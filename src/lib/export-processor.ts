import { beginExportJobAttempt, getExportJob, updateActiveExportJob, updateExportJob } from '@/lib/db/export-jobs';
import { countRecordingsForExport, getRecordingsPageForExport, type RecordingExportCursor } from '@/lib/db/recordings';
import type { ExportJob, Recording } from '@/lib/db/types';
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
import { finishExportBudget, getExportSourceSnapshot } from '@/lib/export-processor/policy';
import { getMongoDb } from '@/lib/mongodb';
import { assertExportActive } from '@/lib/export-processor/object-lifecycle';

export async function processExport(jobId: string, authSubject: string) {
    logger.info(`[Export] Starting job ${jobId} for user ${authSubject}`);
    let costJob: ExportJob | undefined;
    let costStarted = false;
    const beginCost = async () => {
        if (!costStarted) { await updateActiveExportJob(jobId, authSubject, { costStartedAt: new Date() }); costStarted = true; }
    };
    try {
        await assertExportActive(authSubject, jobId);
        const user = await findUserByAuthSubject(authSubject);
        if (!user) {
            throw new Error('Account is unavailable');
        }

        const existingJob = await getExportJob(jobId, authSubject);
        if (!existingJob) {
            throw new Error('Export job not found');
        }
        costJob = existingJob;
        costStarted = Boolean(existingJob.costStartedAt);
        await beginExportJobAttempt(jobId, authSubject);
        if (existingJob.sourceRevision && (await getExportSourceSnapshot(authSubject)).revision !== existingJob.sourceRevision) {
            throw new Error('Recordings changed while this archive was queued. Request a new export.');
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

        await updateActiveExportJob(jobId, authSubject, {
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
        let inputBudgetUsed = initialParts.reduce((sum, part) => sum + part.size, 0);
        let latestCursor = cursor;

        while (true) {
            await assertExportActive(authSubject, jobId);
            const page = await getRecordingsPageForExport(authSubject, EXPORT_PAGE_SIZE, latestCursor);
            if (page.length === 0) {
                break;
            }

            for (const recording of page) {
                inputBudgetUsed += Math.max(0, recording.fileSize || 0) + Buffer.byteLength(JSON.stringify(recording)) * 2 + 4096;
                if (existingJob.estimatedArchiveBytes !== undefined && inputBudgetUsed > existingJob.estimatedArchiveBytes) {
                    throw new Error('This archive changed beyond its reserved cost budget. Request a fresh export.');
                }
                pendingChunk.push(recording);
                pendingChunkBytes += Math.max(recording.fileSize || 0, DEFAULT_RECORDING_SIZE_BYTES);
                latestCursor = {
                    recordedAt: new Date(recording.recordedAt),
                    id: recording._id.toString(),
                };

                if (pendingChunkBytes >= PART_SIZE_LIMIT) {
                    await beginCost();
                    const part = await ensurePartUploaded(authSubject, jobId, nextPartNumber, pendingChunk, existingJob.estimatedArchiveBytes);
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
            await beginCost();
            const part = await ensurePartUploaded(authSubject, jobId, nextPartNumber, pendingChunk, existingJob.estimatedArchiveBytes);
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
    } finally {
        if (costJob?.costReservationId && costJob.maximumCostMicros !== undefined && !costJob.costSettledAt) {
            try {
                await finishExportBudget(authSubject, { id: costJob.costReservationId, maximumCostMicros: costJob.maximumCostMicros,
                    source: costJob.costBudgetSource || 'customer', poolId: costJob.costBudgetPoolId, unpriced: costJob.costUnpriced,
                    estimateStale: costJob.costEstimateStale, costPolicyVersion: costJob.costPolicyVersion }, costStarted, await getMongoDb());
                await updateExportJob(jobId, authSubject, { costSettledAt: new Date() });
            } catch (error) { logger.error('Export budget settlement remains pending', error); }
        }
    }
}
