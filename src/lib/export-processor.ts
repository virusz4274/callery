import { getExportJob, updateExportJob } from '@/lib/db/export-jobs';
import { countRecordingsForExport, getRecordingsPageForExport, type RecordingExportCursor } from '@/lib/db/recordings';
import type { Recording } from '@/lib/db/types';
import { findUserByFirebaseUid } from '@/lib/db/users';
import {
    DEFAULT_RECORDING_SIZE_BYTES,
    EXPORT_PAGE_SIZE,
    PART_SIZE_LIMIT,
} from '@/lib/export-processor/constants';
import { ensurePartUploaded } from '@/lib/export-processor/archive';
import { finalizeJob, persistCheckpoint } from '@/lib/export-processor/lifecycle';
import { inferNextPartNumber, toStorageParts, upsertPart } from '@/lib/export-processor/part-metadata';
import type { ExportPartMeta } from '@/lib/export-processor/types';

export async function processExport(jobId: string, firebaseUid: string) {
    console.log(`[Export] Starting job ${jobId} for user ${firebaseUid}`);
    try {
        const user = await findUserByFirebaseUid(firebaseUid);
        if (!user) {
            throw new Error('User not found');
        }

        const existingJob = await getExportJob(jobId, firebaseUid);
        if (!existingJob) {
            throw new Error('Export job not found');
        }

        let totalRecordings = existingJob.totalRecordings || 0;
        if (!totalRecordings) {
            totalRecordings = await countRecordingsForExport(firebaseUid);
        }

        const initialParts: ExportPartMeta[] = (existingJob.parts || []).map((part) => ({
            key: part.key,
            size: part.size,
        }));

        let parts = initialParts;
        let processedRecordings = existingJob.processedRecordings || 0;
        let nextPartNumber = existingJob.checkpoint?.nextPartNumber || inferNextPartNumber(parts);
        let cursor: RecordingExportCursor | undefined;

        if (existingJob.checkpoint?.cursorRecordedAt && existingJob.checkpoint.cursorId) {
            cursor = {
                recordedAt: new Date(existingJob.checkpoint.cursorRecordedAt),
                id: existingJob.checkpoint.cursorId,
            };
        }

        await updateExportJob(jobId, firebaseUid, {
            status: 'processing',
            startedAt: existingJob.startedAt || new Date(),
            totalRecordings,
            processedRecordings,
            progress: totalRecordings > 0 ? Math.min(99, Math.round((processedRecordings / totalRecordings) * 100)) : 0,
            parts: toStorageParts(parts),
            checkpoint: {
                nextPartNumber,
                cursorRecordedAt: cursor?.recordedAt,
                cursorId: cursor?.id,
            },
            error: undefined,
        });

        if (totalRecordings === 0) {
            await finalizeJob(jobId, firebaseUid, [], user.email);
            return;
        }

        let pendingChunk: Recording[] = [];
        let pendingChunkBytes = 0;
        let latestCursor = cursor;

        while (true) {
            const page = await getRecordingsPageForExport(firebaseUid, EXPORT_PAGE_SIZE, latestCursor);
            if (page.length === 0) {
                break;
            }

            for (const recording of page) {
                pendingChunk.push(recording);
                pendingChunkBytes += Math.max(recording.fileSize || 0, DEFAULT_RECORDING_SIZE_BYTES);
                latestCursor = {
                    recordedAt: new Date(recording.recordedAt),
                    id: recording._id.toString(),
                };

                if (pendingChunkBytes >= PART_SIZE_LIMIT) {
                    const part = await ensurePartUploaded(firebaseUid, jobId, nextPartNumber, pendingChunk);
                    parts = upsertPart(parts, part);

                    processedRecordings += pendingChunk.length;
                    nextPartNumber += 1;
                    pendingChunk = [];
                    pendingChunkBytes = 0;

                    await persistCheckpoint({
                        jobId,
                        firebaseUid,
                        totalRecordings,
                        processedRecordings,
                        cursor: latestCursor,
                        nextPartNumber,
                        parts,
                    });
                }
            }
        }

        if (pendingChunk.length > 0) {
            const part = await ensurePartUploaded(firebaseUid, jobId, nextPartNumber, pendingChunk);
            parts = upsertPart(parts, part);
            processedRecordings += pendingChunk.length;
            nextPartNumber += 1;

            await persistCheckpoint({
                jobId,
                firebaseUid,
                totalRecordings,
                processedRecordings,
                cursor: latestCursor,
                nextPartNumber,
                parts,
            });
        }

        await finalizeJob(jobId, firebaseUid, parts, user.email);
    } catch (error) {
        console.error('[Export] Fatal Error:', error);
        await updateExportJob(jobId, firebaseUid, {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
