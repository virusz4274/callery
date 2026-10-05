import archiver from 'archiver';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import type { Recording } from '@/lib/db/types';
import { VIEWER_HTML } from '@/lib/export-viewer-template';
import { storageBucket, getStorageClient } from '@/lib/r2';
import { getPartKey } from './part-metadata';
import { isNotFoundError, withRetry } from './retry';
import type { ExportPartMeta } from './types';

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
        const head = await getStorageClient().send(new HeadObjectCommand({ Bucket: storageBucket(), Key: key }));
        return head.ContentLength ?? 0;
    } catch (error) {
        if (isNotFoundError(error)) {
            return null;
        }

        throw error;
    }
}

async function fetchRecordingStream(key: string): Promise<Readable | null> {
    try {
        const response = await withRetry(`Fetch source object ${key}`, async () => {
            return getStorageClient().send(
                new GetObjectCommand({
                    Bucket: storageBucket(),
                    Key: key,
                })
            );
        });

        if (!response.Body) {
            return null;
        }

        if (response.Body instanceof Readable) {
            return response.Body;
        }

        const maybeWebStream = response.Body as unknown as { getReader?: unknown };
        if (typeof maybeWebStream.getReader === 'function' && typeof Readable.fromWeb === 'function') {
            return Readable.fromWeb(response.Body as unknown as Parameters<typeof Readable.fromWeb>[0]);
        }

        const maybeTransformable = response.Body as unknown as { transformToWebStream?: () => unknown };
        if (typeof maybeTransformable.transformToWebStream === 'function' && typeof Readable.fromWeb === 'function') {
            return Readable.fromWeb(maybeTransformable.transformToWebStream() as Parameters<typeof Readable.fromWeb>[0]);
        }

        return null;
    } catch (error) {
        if (isNotFoundError(error)) {
            return null;
        }

        throw error;
    }
}

async function uploadArchivePart(key: string, chunk: Recording[]): Promise<number> {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'callery-export-'));
    const archivePath = path.join(tempDir, 'part.zip');

    try {
        await new Promise<void>((resolve, reject) => {
            const archive = archiver('zip', { zlib: { level: 9 } });
            const output = createWriteStream(archivePath);
            let settled = false;

            const fail = (error: unknown) => {
                if (settled) {
                    return;
                }
                settled = true;
                reject(error);
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

                    const stream = await fetchRecordingStream(recording.r2Key);
                    if (stream) {
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
        await getStorageClient().send(
            new PutObjectCommand({
                Bucket: storageBucket(),
                Key: key,
                Body: createReadStream(archivePath),
                ContentLength: size,
                ContentType: 'application/zip',
            })
        );

        return size;
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
}

export async function ensurePartUploaded(
    authSubject: string,
    jobId: string,
    partNumber: number,
    chunk: Recording[]
): Promise<ExportPartMeta> {
    const key = getPartKey(authSubject, jobId, partNumber);
    const existingSize = await getExistingObjectSize(key);
    if (existingSize !== null) {
        return { key, size: existingSize };
    }

    const uploadedSize = await withRetry(`Upload ${key}`, async () => uploadArchivePart(key, chunk));
    return { key, size: uploadedSize };
}
