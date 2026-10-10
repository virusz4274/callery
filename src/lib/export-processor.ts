import { getExportJob, updateExportJob } from '@/lib/db/export-jobs';
import { countRecordingsForExport, getRecordingsPageForExport, type RecordingExportCursor } from '@/lib/db/recordings';
import type { Recording } from '@/lib/db/types';
import { findUserByAuthSubject } from '@/lib/db/users';
import {
    DEFAULT_RECORDING_SIZE_BYTES,
    EXPORT_PAGE_SIZE,
    PART_SIZE_LIMIT,
} from '@/lib/export-processor/constants';
import { ensurePartUploaded } from '@/lib/export-processor/archive';
import { finalizeJob, persistCheckpoint } from '@/lib/export-processor/lifecycle';
import { toStorageParts, upsertPart } from '@/lib/export-processor/part-metadata';
import type { ExportPartMeta } from '@/lib/export-processor/types';
import { logger } from '@/lib/logger';
import { resolveExportSubject } from '@/lib/team-policy';

export async function processExport(jobId: string, authSubject: string) {
    logger.info(`[Export] Starting job ${jobId} for user ${authSubject}`);
    try {
        const user = await findUserByAuthSubject(authSubject);
        if (!user) {
            throw new Error('Account is unavailable');
        }

        const existingJob = await getExportJob(jobId, authSubject);
        if (!existingJob) {
            throw new Error('Export job not found');
        }
        const requesterSubject = existingJob.requestedByAuthSubject || authSubject;
        await resolveExportSubject(requesterSubject, requesterSubject === authSubject ? undefined : user._id.toString());
        const requester = await findUserByAuthSubject(requesterSubject);

        let totalRecordings = existingJob.totalRecordings;
        if (!totalRecordings) {
            totalRecordings = await countRecordingsForExport(authSubject);
        }

        const initialParts: ExportPartMeta[] = existingJob.parts.map((part) => ({
            key: part.key,
            size: part.size,
        }));

        let parts = initialParts;
        let processedRecordings = existingJob.processedRecordings;
        let nextPartNumber = existingJob.checkpoint.nextPartNumber;
        let cursor: RecordingExportCursor | undefined;

        if (existingJob.checkpoint.cursorRecordedAt && existingJob.checkpoint.cursorId) {
            cursor = {
                recordedAt: new Date(existingJob.checkpoint.cursorRecordedAt),
                id: existingJob.checkpoint.cursorId,
            };
        }

        await updateExportJob(jobId, authSubject, {
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
            await finalizeJob(jobId, authSubject, [], requester?.email);
            return;
        }

        let pendingChunk: Recording[] = [];
        let pendingChunkBytes = 0;
        let latestCursor = cursor;

        while (true) {
            const page = await getRecordingsPageForExport(authSubject, EXPORT_PAGE_SIZE, latestCursor);
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
                    const part = await ensurePartUploaded(authSubject, jobId, nextPartNumber, pendingChunk);
                    parts = upsertPart(parts, part);

                    processedRecordings += pendingChunk.length;
                    nextPartNumber += 1;
                    pendingChunk = [];
                    pendingChunkBytes = 0;

                    await persistCheckpoint({
                        jobId,
                        authSubject,
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
            const part = await ensurePartUploaded(authSubject, jobId, nextPartNumber, pendingChunk);
            parts = upsertPart(parts, part);
            processedRecordings += pendingChunk.length;
            nextPartNumber += 1;

            await persistCheckpoint({
                jobId,
                authSubject,
                totalRecordings,
                processedRecordings,
                cursor: latestCursor,
                nextPartNumber,
                parts,
            });
        }

        await finalizeJob(jobId, authSubject, parts, requester?.email);
    } catch (error) {
        logger.error('[Export] Fatal Error:', error);
        await updateExportJob(jobId, authSubject, {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
