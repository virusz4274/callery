'use client';

import { browserFileFingerprint, originalFileMatches, type BrowserUploadItem, type BrowserUploadSession } from './browser-uploads-contract';
import { browserUploadApi, BrowserUploadError, finalizeBrowserUpload, type BrowserUploadApi } from './r2-direct-upload-client';
import { uploadQueuePersistence, type UploadQueuePersistence } from './browser-upload-persistence';

export class UploadTransferSlots {
    private active = 0;
    private waiting: (() => void)[] = [];
    constructor(private readonly limit: number) {}
    async run<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
        for (;;) {
            signal.throwIfAborted();
            if (this.active < this.limit) { this.active++; break; }
            await new Promise<void>((resolve, reject) => {
                const wake = () => { signal.removeEventListener('abort', abort); resolve(); };
                const abort = () => { this.waiting = this.waiting.filter(value => value !== wake); reject(signal.reason); };
                this.waiting.push(wake);
                signal.addEventListener('abort', abort, { once: true });
            });
        }
        try { signal.throwIfAborted(); return await work(); }
        finally { this.active--; this.waiting.shift()?.(); }
    }
}

export async function uploadPartChecksum(bytes: Blob) {
    const hash = await crypto.subtle.digest('SHA-256', await bytes.arrayBuffer());
    return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
}

export interface UploadQueueSnapshot { owner: string | null; items: BrowserUploadItem[]; ready: boolean; recoveryAvailable: boolean }
const emptySnapshot: UploadQueueSnapshot = { owner: null, items: [], ready: false, recoveryAvailable: true };
const terminal = (item: BrowserUploadItem) => ['success', 'cancelled', 'expired'].includes(item.status);

/** One account-bound manager lives above page navigation. File bytes stay in memory. */
export class BrowserUploadManager {
    private state: UploadQueueSnapshot = emptySnapshot;
    private listeners = new Set<() => void>();
    private files = new Map<string, File>();
    private active = new Map<string, AbortController>();
    private cancellations = new Map<string, Promise<boolean>>();
    private slots = new UploadTransferSlots(4);
    private lifecycle = new AbortController();
    private generation = 0;
    private online = true;
    private writes: Promise<void> = Promise.resolve();
    constructor(private readonly api: BrowserUploadApi = browserUploadApi, private readonly persistence: UploadQueuePersistence = uploadQueuePersistence) {}
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    getSnapshot = () => this.state;
    getServerSnapshot = () => emptySnapshot;
    private emit(patch: Partial<UploadQueueSnapshot>) {
        this.state = { ...this.state, ...patch };
        for (const listener of this.listeners) listener();
    }
    private patch(id: string, patch: Partial<BrowserUploadItem>) {
        this.emit({ items: this.state.items.map(item => item.id === id ? { ...item, ...patch } : item) });
    }
    private item(id: string) { return this.state.items.find(item => item.id === id); }
    private persist() {
        const owner = this.state.owner;
        if (!owner) return Promise.resolve();
        const epoch = this.generation;
        // Explicit projection: no File, Blob, signed URL or credential is persisted.
        const items = this.state.items.map(item => ({ ...item, progressBytes: item.completedBytes }));
        this.writes = this.writes.catch(() => {}).then(() => this.persistence.save(owner, items)).catch(() => {
            if (epoch === this.generation) this.emit({ recoveryAvailable: false });
        });
        return this.writes;
    }
    async setOwner(owner: string | null) {
        if (owner === this.state.owner && this.state.ready) return;
        const epoch = ++this.generation;
        this.lifecycle.abort(); this.lifecycle = new AbortController();
        for (const controller of this.active.values()) controller.abort();
        this.active.clear(); this.files.clear();
        this.emit({ owner, items: [], ready: !owner, recoveryAvailable: true });
        if (!owner) return;
        try {
            const items = await this.persistence.load(owner);
            if (epoch !== this.generation) return;
            this.emit({ items: items.map(item => terminal(item) ? item : { ...item, status: 'needs-file', progressBytes: item.completedBytes }), ready: true });
            for (const item of this.state.items) {
                if (item.sessionId && !terminal(item)) void this.refreshRecovered(item.id, epoch);
            }
        } catch {
            if (epoch === this.generation) this.emit({ ready: true, recoveryAvailable: false });
        }
    }
    private async refreshRecovered(id: string, epoch: number) {
        const item = this.item(id);
        if (!item?.sessionId) return;
        try {
            const session = await this.api.status(item.sessionId, this.lifecycle.signal);
            if (epoch !== this.generation || !this.item(id)) return;
            if (session.state === 'completed') this.acceptCompleted(id, session);
            else if (session.state === 'finalizing') {
                this.patch(id, { status: 'queued', completedBytes: item.fileSize, progressBytes: item.fileSize }); this.pump();
            } else if (session.state === 'cancelled' || session.state === 'expired') this.patch(id, { status: session.state });
            else this.patch(id, { completedBytes: (session.parts || []).reduce((sum, part) => sum + part.size, 0), expiresAt: session.expiresAt });
        } catch (error) {
            if (epoch !== this.generation) return;
            if (error instanceof BrowserUploadError && error.status === 410) this.patch(id, { status: 'expired', error: error.message });
            else this.patch(id, { error: error instanceof Error ? error.message : 'Could not check saved upload. Retry when connected.' });
        }
        await this.persist();
    }
    add(files: File[], bulkImportId?: string) {
        if (!this.state.owner || !this.state.ready) return;
        let items = [...this.state.items];
        for (const file of files) {
            const fingerprint = browserFileFingerprint(file);
            const recover = items.find(item => item.bulkImportId === bulkImportId && item.fingerprint === fingerprint && !terminal(item) && !this.files.has(item.id));
            if (recover && originalFileMatches(recover, file)) {
                this.files.set(recover.id, file);
                items = items.map(item => item.id === recover.id ? { ...item, status: 'queued', error: undefined } : item);
                continue;
            }
            const previous = items.find(item => item.bulkImportId === bulkImportId && item.fingerprint === fingerprint && item.status !== 'cancelled' && item.status !== 'expired');
            const id = crypto.randomUUID();
            this.files.set(id, file);
            items.push({ id, fileName: file.name, fileSize: file.size, lastModified: file.lastModified, mimeType: file.type, fingerprint,
                requestKey: crypto.randomUUID(), bulkImportId, status: 'pending', completedBytes: 0, progressBytes: 0, checksums: {},
                ...(previous ? { isDuplicate: true, duplicateOfId: previous.id, error: 'This file is already in your queue.' } : {}),
            });
        }
        this.emit({ items }); void this.persist(); this.pump();
    }
    reselect(id: string, file: File) {
        const item = this.item(id);
        if (!item || terminal(item)) return;
        if (!originalFileMatches(item, file)) { this.patch(id, { error: 'Choose the original file with the same name, size and modification date.' }); return; }
        this.files.set(id, file);
        this.patch(id, { status: 'queued', error: undefined }); void this.persist(); this.pump();
    }
    start(ids: string[]) {
        for (const id of ids) {
            const item = this.item(id);
            if (!item || terminal(item) || item.isDuplicate || this.active.has(id)) continue;
            if (!this.files.has(id) && item.completedBytes !== item.fileSize) this.patch(id, { status: 'needs-file' });
            else this.patch(id, { status: this.online ? 'queued' : 'offline', error: undefined });
        }
        void this.persist(); this.pump();
    }
    pause(id: string) {
        const item = this.item(id);
        if (!item || terminal(item) || item.status === 'finalizing') return;
        this.patch(id, { status: 'paused', progressBytes: item.completedBytes });
        this.active.get(id)?.abort(); void this.persist();
    }
    setOnline(online: boolean) {
        this.online = online;
        for (const item of this.state.items) {
            if (!online && ['queued', 'uploading', 'finalizing'].includes(item.status)) {
                this.patch(item.id, { status: 'offline', progressBytes: item.completedBytes }); this.active.get(item.id)?.abort();
            } else if (online && item.status === 'offline') {
                this.patch(item.id, { status: this.files.has(item.id) || item.completedBytes === item.fileSize ? 'queued' : 'needs-file' });
            }
        }
        void this.persist(); this.pump();
    }
    cancel(id: string): Promise<boolean> {
        const existing = this.cancellations.get(id);
        if (existing) return existing;
        const task = this.cancelItem(id).finally(() => { if (this.cancellations.get(id) === task) this.cancellations.delete(id); });
        this.cancellations.set(id, task);
        return task;
    }
    private async cancelItem(id: string): Promise<boolean> {
        const item = this.item(id);
        if (!item) return true;
        if (item.status === 'success' || item.status === 'expired' || item.status === 'cancelled') return true;
        if (item.status === 'finalizing') return false;
        const epoch = this.generation;
        const wasActive = this.active.has(id);
        this.patch(id, { status: 'cancelled', progressBytes: item.completedBytes }); this.active.get(id)?.abort();
        try {
            // If initialization's response was lost, recover its stable request key
            // before cancelling so reservations cannot silently be left behind.
            let sessionId = item.sessionId;
            if (!sessionId && (wasActive || item.initializationStarted)) {
                const recovered = await this.api.create(item, this.lifecycle.signal);
                if (epoch !== this.generation) return false;
                if (recovered.state === 'completed') { this.acceptCompleted(id, recovered); await this.persist(); return false; }
                if (recovered.state === 'finalizing') { this.patch(id, { status: 'queued', sessionId: recovered.id, completedBytes: item.fileSize, progressBytes: item.fileSize }); await this.persist(); this.pump(); return false; }
                sessionId = recovered.id;
            }
            if (sessionId) {
                const session = await this.api.cancel(sessionId, this.lifecycle.signal);
                if (epoch !== this.generation) return false;
                if (session.state === 'completed') { this.acceptCompleted(id, session); return false; }
                this.patch(id, { sessionId });
            }
            this.files.delete(id); await this.persist(); return true;
        } catch (error) {
            if (epoch !== this.generation) return false;
            if (item.sessionId && error instanceof BrowserUploadError && error.code === 'upload_busy') {
                const settled = await this.api.status(item.sessionId, this.lifecycle.signal).catch(() => null);
                if (epoch !== this.generation) return false;
                if (settled?.state === 'completed') { this.acceptCompleted(id, settled); await this.persist(); return false; }
                if (settled?.state === 'finalizing') { this.patch(id, { status: 'queued', completedBytes: item.fileSize, progressBytes: item.fileSize }); await this.persist(); this.pump(); return false; }
            }
            this.patch(id, { status: 'error', error: error instanceof Error ? error.message : 'Cancellation failed. Retry cancellation to release this upload.' });
            await this.persist(); return false;
        }
    }
    async remove(id: string) {
        if (!await this.cancel(id)) return;
        this.files.delete(id); this.emit({ items: this.state.items.filter(item => item.id !== id) }); await this.persist();
    }
    private pump() {
        if (!this.online || !this.state.owner || !this.state.ready) return;
        for (const item of this.state.items) {
            if (this.active.size >= 2) break;
            if (item.status !== 'queued' || item.isDuplicate || this.active.has(item.id)) continue;
            const controller = new AbortController(); this.active.set(item.id, controller);
            void this.run(item.id, controller, this.generation).finally(() => {
                if (this.active.get(item.id) === controller) this.active.delete(item.id);
                this.pump();
            });
        }
    }
    private acceptCompleted(id: string, session: BrowserUploadSession) {
        const item = this.item(id);
        if (!item) return;
        this.patch(id, { status: 'success', completedBytes: item.fileSize, progressBytes: item.fileSize, recordingId: session.recordingId || undefined, error: undefined });
        this.files.delete(id);
    }
    private async run(id: string, controller: AbortController, epoch: number) {
        const signal = controller.signal;
        const current = () => { signal.throwIfAborted(); if (epoch !== this.generation) throw new DOMException('Account changed', 'AbortError'); return this.item(id)!; };
        try {
            this.patch(id, { status: 'uploading', error: undefined });
            let item = current();
            let session: BrowserUploadSession;
            if (!item.sessionId) {
                this.patch(id, { initializationStarted: true }); await this.persist(); item = current();
                session = await this.api.create(item, signal); item = current();
                this.patch(id, { sessionId: session.id, expiresAt: session.expiresAt }); await this.persist();
            }
            item = current();
            session = await this.api.status(item.sessionId!, signal); item = current();
            if (session.state === 'completed') { this.acceptCompleted(id, session); return; }
            if (session.state === 'cancelled' || session.state === 'expired') { this.patch(id, { status: session.state }); return; }
            if (session.state !== 'finalizing') {
                const file = this.files.get(id);
                if (!file) { this.patch(id, { status: 'needs-file' }); return; }
                const confirmed = new Map((session.parts || []).map(part => [part.partNumber, part.size]));
                for (const part of session.parts || []) {
                    const start = (part.partNumber - 1) * session.partSize;
                    const bytes = file.slice(start, start + part.size);
                    if (!current().checksums[part.partNumber] || await uploadPartChecksum(bytes) !== current().checksums[part.partNumber]) {
                        this.files.delete(id);
                        this.patch(id, { status: 'needs-file', error: 'This file does not match the saved upload. Select the original file, or cancel and start again.' }); return;
                    }
                }
                let completedBytes = Array.from(confirmed.values()).reduce((sum, size) => sum + size, 0);
                this.patch(id, { completedBytes, progressBytes: completedBytes });
                const inFlight = new Map<number, number>();
                const missing = Array.from({ length: session.partCount }, (_, index) => index + 1).filter(number => !confirmed.has(number));
                let next = 0;
                let partFailure: unknown;
                const worker = async () => {
                    try { while (next < missing.length && !partFailure) {
                        const number = missing[next++];
                        await this.slots.run(signal, async () => {
                            current();
                            const offset = (number - 1) * session.partSize;
                            const bytes = file.slice(offset, Math.min(file.size, offset + session.partSize));
                            const checksum = await uploadPartChecksum(bytes); current();
                            this.patch(id, { checksums: { ...current().checksums, [number]: checksum } });
                            await this.persist(); current();
                            await this.api.part(session.id, number, bytes, session.transport === 'direct', signal, loaded => {
                                if (signal.aborted || epoch !== this.generation) return;
                                inFlight.set(number, loaded);
                                this.patch(id, { progressBytes: Math.min(file.size, completedBytes + Array.from(inFlight.values()).reduce((sum, value) => sum + value, 0)) });
                            });
                            current(); inFlight.delete(number); completedBytes += bytes.size;
                            this.patch(id, { completedBytes, progressBytes: completedBytes + Array.from(inFlight.values()).reduce((sum, value) => sum + value, 0) });
                            await this.persist();
                        });
                    } } catch (error) { partFailure = error; throw error; }
                };
                // Do not let a failed sibling keep transferring invisibly after its
                // file task leaves the active set.
                const results = await Promise.allSettled([worker(), worker()]);
                const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
                if (failure) throw failure.reason;
            }
            item = current(); this.patch(id, { status: 'finalizing', completedBytes: item.fileSize, progressBytes: item.fileSize }); await this.persist();
            session = await finalizeBrowserUpload(this.api, session.id, signal); current();
            if (session.state === 'completed') this.acceptCompleted(id, session);
            else this.patch(id, { status: 'error', error: 'Finalization is still in progress. Recheck this upload.' });
        } catch (error) {
            if (signal.aborted || epoch !== this.generation) return;
            this.patch(id, { status: error instanceof BrowserUploadError && error.status === 410 ? 'expired' : 'error',
                error: error instanceof Error ? error.message : 'Upload interrupted. Retry to resume saved parts.',
                progressBytes: this.item(id)?.completedBytes || 0 });
        } finally {
            if (epoch === this.generation) await this.persist();
        }
    }
}
