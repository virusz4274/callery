import { ZipArchive } from 'archiver';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import type { Recording } from '@/lib/db/types';
import { VIEWER_HTML } from '@/lib/export-viewer-template';
import { storageBucket } from '@/lib/r2';
import { getPartKey } from './part-metadata';
import { isNotFoundError, withRetry } from './retry';
import type { ExportPartMeta } from './types';
import { abandonExportObjectWrite, assertExportActive, beginExportObjectWrite, completeExportObjectWrite } from './object-lifecycle';
import { boundedExportStream } from './bounded-stream';
import { getExportStorageClient } from './storage-client';
import { ExportProcessingError, toExportFailure, wrapExportError } from './errors';
import { logger } from '@/lib/logger';

function sanitizeForPath(value: string): string {
    return value.replace(/[^a-zA-Z0-9.\-_]/g, '_');
}

function getReadmeTxt() {
    return `
Call Organizer Export
=====================

Instructions:
1. Download all parts (Part 1, Part 2, etc.).
2. Extract all zip files into the SAME folder.
3. Open 'viewer.html' in your browser.
4. If asked, select the 'Contacts' folder inside the extracted directory.

Your recordings are organized by Contact > Year > Month.
    `.trim();
}

function toSerializableRecording(recording: Recording): Record<string, unknown> {
    return {
        ...recording,
        _id: recording._id.toString(),
        contactId: recording.contactId ? recording.contactId.toString() : null,
        recordedAt: recording.recordedAt.toISOString(),
        createdAt: recording.createdAt.toISOString(),
        updatedAt: recording.updatedAt.toISOString(),
    };
}

async function getExistingObjectSize(key: string): Promise<number | null> {
    try {
        const head = await getExportStorageClient().send(new HeadObjectCommand({ Bucket: storageBucket(), Key: key }));
        return head.ContentLength ?? 0;
    } catch (error) {
        if (isNotFoundError(error)) {
            return null;
        }

        throw wrapExportError(error, 'archive-upload');
    }
}

async function fetchRecordingStream(key: string, maximumBytes?: number): Promise<Readable | null> {
    try {
        const response = await withRetry('source-download', async () => {
            return getExportStorageClient().send(
                new GetObjectCommand({
                    Bucket: storageBucket(),
                    Key: key,
                })
            );
        });

        if (!response.Body) {
            return null;
        }

        const bound = (source: Readable) => {
            if (!maximumBytes || maximumBytes <= 0) return source;
            const bounded = boundedExportStream(source, maximumBytes);
            bounded.once('close', () => source.destroy());
            return bounded;
        };
        if (response.Body instanceof Readable) return bound(response.Body);

        const maybeWebStream = response.Body as unknown as { getReader?: unknown };
        if (typeof maybeWebStream.getReader === 'function' && typeof Readable.fromWeb === 'function') {
            return bound(Readable.fromWeb(response.Body as unknown as Parameters<typeof Readable.fromWeb>[0]));
        }

        const maybeTransformable = response.Body as unknown as { transformToWebStream?: () => unknown };
        if (typeof maybeTransformable.transformToWebStream === 'function' && typeof Readable.fromWeb === 'function') {
            return bound(Readable.fromWeb(maybeTransformable.transformToWebStream() as Parameters<typeof Readable.fromWeb>[0]));
        }

        return null;
    } catch (error) {
        if (isNotFoundError(error)) {
            return null;
        }

        throw wrapExportError(error, 'source-download');
    }
}

async function uploadArchivePart(authSubject: string, jobId: string, key: string, chunk: Recording[], maximumArchiveBytes?: number, workerToken?: string): Promise<number> {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'callery-export-')).catch(error => { throw wrapExportError(error, 'archive-build', 'archive'); });
    const archivePath = path.join(tempDir, 'part.zip');
    let outputClosed = Promise.resolve();
    let primaryFailure: Error | undefined;

    try {
        await new Promise<void>((resolve, reject) => {
            const archive = new ZipArchive({ zlib: { level: 9 } });
            const output = createWriteStream(archivePath);
            outputClosed = finished(output).then(() => {}, () => {});
            let settled = false;
            const sources = new Set<Readable>();

            const fail = (error: unknown) => {
                if (settled) {
                    return;
                }
                settled = true;
                for (const source of sources) source.destroy();
                archive.abort();
                output.destroy();
                reject(wrapExportError(error, 'archive-build', 'archive'));
            };

            archive.on('warning', (error: unknown) => {
                if ((error as { code?: string })?.code !== 'ENOENT') {
                    fail(error);
                }
            });
            archive.on('error', fail);
            output.on('error', fail);
            output.on('close', () => {
                if (settled) {
                    return;
                }
                settled = true;
                resolve();
            });

            archive.pipe(output);

            const appendFiles = async () => {
                archive.append(VIEWER_HTML, { name: 'viewer.html' });
                archive.append(getReadmeTxt(), { name: 'README.txt' });

                for (const recording of chunk) {
                    if (settled) return;
                    const date = new Date(recording.recordedAt);
                    const year = date.getFullYear().toString();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const displayName = recording.contactName || recording.phoneNumber || 'Unknown';
                    const safeName = sanitizeForPath(displayName);
                    const ext = recording.fileName.split('.').pop() || 'm4a';
                    const fileBaseName = `${safeName}_${date.getTime()}`;
                    const folderInZip = `Contacts/${safeName}/${year}/${month}`;
                    const audioPath = `${folderInZip}/${fileBaseName}.${ext}`;
                    const jsonPath = `${folderInZip}/${fileBaseName}.json`;
                    const txtPath = `${folderInZip}/${fileBaseName}.txt`;

                    const stream = await fetchRecordingStream(recording.r2Key, recording.fileSize);
                    if (settled) { stream?.destroy(); return; }
                    if (stream) {
                        sources.add(stream);
                        stream.once('error', error => fail(wrapExportError(error, 'source-download')));
                        stream.once('end', () => sources.delete(stream));
                        archive.append(stream, { name: audioPath });
                    } else {
                        archive.append(`Source audio file not found in storage (key: ${recording.r2Key}).`, {
                            name: `${folderInZip}/${fileBaseName}.missing.txt`,
                        });
                    }

                    const serialized = JSON.stringify(toSerializableRecording(recording), null, 2);
                    archive.append(serialized, { name: jsonPath });

                    const transcriptText =
                        recording.fullTranscript?.map((segment) => `[${segment.speakerId}]: ${segment.text}`).join('\n') ||
                        '(No Transcript)';
                    const textSummary = `Call with: ${displayName}
Date: ${date.toISOString()}
Duration: ${recording.duration}s
Phone: ${recording.phoneNumber}

Transcript:
${transcriptText}`;
                    archive.append(textSummary, { name: txtPath });
                }

                await archive.finalize();
            };

            appendFiles().catch(fail);
        });

        const { size } = await stat(archivePath);
        if (maximumArchiveBytes !== undefined && size > maximumArchiveBytes) throw new ExportProcessingError('archive-build', 'budget');
        const intent = await beginExportObjectWrite(authSubject, jobId, key, undefined, workerToken);
        try {
            // Both attempts fit within the durable five-minute write lease.
            await withRetry('archive-upload', async () => {
                await assertExportActive(authSubject, jobId, undefined, workerToken);
                const body = createReadStream(archivePath);
                const bodyClosed = finished(body).then(() => {}, () => {});
                try {
                    await getExportStorageClient().send(new PutObjectCommand({ Bucket: storageBucket(), Key: key,
                        Body: body, ContentLength: size, ContentType: 'application/zip' }),
                    { abortSignal: AbortSignal.timeout(120_000) });
                } finally {
                    body.destroy();
                    await bodyClosed;
                }
            }, 2);
            if (!await completeExportObjectWrite(intent, undefined, workerToken)) {
                try { await getExportStorageClient().send(new DeleteObjectCommand({ Bucket: storageBucket(), Key: key })); }
                catch (cleanupError) { logger.warn('[Export] Cancelled archive object cleanup remains pending', toExportFailure(cleanupError, 'archive-upload')); }
                throw new ExportProcessingError('archive-upload', 'cancelled');
            }
        } catch (error) {
            try { await abandonExportObjectWrite(intent); }
            catch (cleanupError) { logger.warn('[Export] Object write cleanup remains pending', toExportFailure(cleanupError, 'archive-upload')); }
            throw wrapExportError(error, 'archive-upload');
        }

        return size;
    } catch (error) {
        primaryFailure = wrapExportError(error, 'archive-build', 'archive');
        throw primaryFailure;
    } finally {
        await outputClosed;
        try { await rm(tempDir, { recursive: true, force: true }); }
        catch (cleanupError) {
            if (!primaryFailure) throw wrapExportError(cleanupError, 'archive-build', 'archive');
            logger.warn('[Export] Temporary archive cleanup failed', toExportFailure(cleanupError, 'archive-build'));
        }
    }
}

export async function ensurePartUploaded(
    authSubject: string,
    jobId: string,
    partNumber: number,
    chunk: Recording[],
    maximumArchiveBytes?: number,
    workerToken?: string,
): Promise<ExportPartMeta> {
    await assertExportActive(authSubject, jobId, undefined, workerToken);
    const key = getPartKey(authSubject, jobId, partNumber, workerToken);
    const existingSize = await getExistingObjectSize(key);
    if (existingSize !== null) {
        await assertExportActive(authSubject, jobId, undefined, workerToken);
        return { key, size: existingSize };
    }

    const uploadedSize = await uploadArchivePart(authSubject, jobId, key, chunk, maximumArchiveBytes, workerToken);
    return { key, size: uploadedSize };
}
