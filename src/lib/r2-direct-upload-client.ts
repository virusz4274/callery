'use client';

import type { BrowserUploadItem, BrowserUploadSession } from './browser-uploads-contract';

export class BrowserUploadError extends Error {
    constructor(message: string, public status = 0, public code = 'network_error', public retryAfter?: number) { super(message); }
}

export function abortableUploadDelay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) { reject(signal.reason); return; }
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
        signal.addEventListener('abort', abort, { once: true });
    });
}

export async function retryUploadOperation<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        signal.throwIfAborted();
        try { return await work(); }
        catch (error) {
            signal.throwIfAborted();
            const failure = error instanceof BrowserUploadError ? error : new BrowserUploadError('Network interrupted. Retry this upload.');
            const transient = !failure.status || failure.status === 429 || failure.status >= 500 || failure.code === 'upload_busy';
            if (!transient || attempt >= 4) throw failure;
            await abortableUploadDelay(Math.min(60_000, (failure.retryAfter ?? 2 ** attempt) * 1000), signal);
        }
    }
}

async function json<T>(path: string, signal: AbortSignal, init: RequestInit = {}): Promise<T> {
    signal.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    const timer = setTimeout(() => controller.abort(new DOMException('Upload request timed out', 'TimeoutError')), 30_000);
    signal.addEventListener('abort', abort, { once: true });
    try {
        const response = await fetch(`/api/uploads${path}`, { ...init, signal: controller.signal, credentials: 'same-origin', cache: 'no-store', headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.success) throw new BrowserUploadError(body?.error?.message || 'Upload request failed. Please retry.', response.status, body?.error?.code || 'upload_failed', Number(response.headers.get('retry-after')) || undefined);
        return body.data as T;
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}

/** XHR exposes real transferred byte counts and supports interrupting a single part. */
export function transferUploadPart(url: string, bytes: Blob, signal: AbortSignal, progress: (loaded: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        signal.throwIfAborted();
        const xhr = new XMLHttpRequest();
        const abort = () => xhr.abort();
        const finish = (error?: Error) => { signal.removeEventListener('abort', abort); if (error) reject(error); else resolve(); };
        xhr.open('PUT', url);
        xhr.timeout = 180_000;
        xhr.upload.onprogress = event => progress(Math.min(bytes.size, event.loaded));
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) { progress(bytes.size); finish(); }
            else {
                let message = 'Part upload failed. Please retry.', code = 'part_failed';
                try { const body = JSON.parse(xhr.responseText); message = body.error?.message || message; code = body.error?.code || code; } catch { /* Storage errors need not be JSON. */ }
                finish(new BrowserUploadError(message, xhr.status, code, Number(xhr.getResponseHeader('Retry-After')) || undefined));
            }
        };
        xhr.onerror = () => finish(new BrowserUploadError('Connection interrupted. Your completed parts are saved.'));
        xhr.ontimeout = () => finish(new BrowserUploadError('Part upload timed out. Your completed parts are saved.'));
        xhr.onabort = () => finish(new DOMException('Upload paused', 'AbortError'));
        signal.addEventListener('abort', abort, { once: true });
        xhr.send(bytes);
    });
}

export interface BrowserUploadApi {
    create(item: BrowserUploadItem, signal: AbortSignal): Promise<BrowserUploadSession>;
    status(id: string, signal: AbortSignal): Promise<BrowserUploadSession>;
    part(id: string, part: number, bytes: Blob, direct: boolean, signal: AbortSignal, progress: (loaded: number) => void): Promise<void>;
    complete(id: string, signal: AbortSignal): Promise<BrowserUploadSession>;
    cancel(id: string, signal: AbortSignal): Promise<BrowserUploadSession>;
}

/** Completion can outlive a lost response or another worker's lease. Poll the
 * durable session, without asking the user for the file or retransferring it. */
export async function finalizeBrowserUpload(api: BrowserUploadApi, id: string, signal: AbortSignal, options = { intervalMs: 3000, maximumPolls: 100 }): Promise<BrowserUploadSession> {
    const submit = async () => {
        try { return await api.complete(id, signal); }
        catch (error) {
            signal.throwIfAborted();
            if (error instanceof BrowserUploadError && error.status > 0 && error.status < 500 && error.status !== 429 && error.code !== 'upload_busy') throw error;
        }
    };
    const deadline = Date.now() + 5 * 60_000;
    let session = await submit();
    for (let poll = 0; poll < options.maximumPolls && Date.now() < deadline; poll++) {
        signal.throwIfAborted();
        if (session?.state === 'completed') return session;
        session = await api.status(id, signal);
        if (session.state === 'completed') return session;
        if (session.state === 'expired' || session.state === 'cancelled') throw new BrowserUploadError('This upload is no longer active.', 410, 'upload_expired');
        if (session.state === 'uploading' && session.errorCode) throw new BrowserUploadError('The uploaded file needs attention. Retry this upload or cancel it.', 409, session.errorCode);
        // If the first request never arrived, safely retry the same finalization
        // identity. An actively leased finalization is only observed, not reset.
        if (session.state === 'uploading' && poll % 5 === 0) session = await submit();
        if (session?.state === 'completed') return session;
        await abortableUploadDelay(options.intervalMs, signal);
    }
    throw new BrowserUploadError('The upload is still finishing in the background. Retry to check its status; your audio does not need to be uploaded again.', 503, 'finalization_pending');
}

export const browserUploadApi: BrowserUploadApi = {
    create: (item, signal) => retryUploadOperation(() => json('', signal, {
        method: 'POST', headers: { 'Idempotency-Key': item.requestKey },
        body: JSON.stringify({ fileName: item.fileName, fileSize: item.fileSize, ...(item.mimeType ? { mimeType: item.mimeType } : {}), ...(item.bulkImportId ? { bulkImportId: item.bulkImportId } : {}) }),
    }), signal),
    status: (id, signal) => retryUploadOperation(() => json(`/${encodeURIComponent(id)}`, signal), signal),
    async part(id, number, bytes, direct, signal, progress) {
        const path = `/${encodeURIComponent(id)}/parts/${number}`;
        let proxy = !direct;
        await retryUploadOperation(async () => {
            let url = `/api/uploads${path}`;
            if (!proxy) {
                try { url = (await json<{ url: string }>(path, signal, { method: 'POST', body: '{}' })).url; }
                catch (error) { if (!(error instanceof BrowserUploadError) || error.code !== 'use_proxy') throw error; proxy = true; }
            }
            try { await transferUploadPart(url, bytes, signal, progress); }
            catch (error) {
                // A blocked storage CORS request can use the same durable multipart
                // session through the bounded proxy; never restart the whole file.
                if (!proxy && error instanceof BrowserUploadError && (!error.status || error.status === 403)) { proxy = true; throw new BrowserUploadError('Switching to the upload proxy.'); }
                throw error;
            }
        }, signal);
    },
    complete: (id, signal) => retryUploadOperation(() => json(`/${encodeURIComponent(id)}/complete`, signal, { method: 'POST', body: '{}' }), signal),
    cancel: (id, signal) => retryUploadOperation(() => json(`/${encodeURIComponent(id)}`, signal, { method: 'DELETE' }), signal),
};
