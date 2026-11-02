import { claimExportJob, getExportJob, heartbeatExportJob, updateActiveExportJob, ExportWorkerOwnershipError } from '@/lib/db/export-jobs';
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
import { assertExportActive, verifyCheckpointParts } from '@/lib/export-processor/object-lifecycle';
import { ExportProcessingError, exportFailureMessage, toExportFailure, type ExportFailureStage } from '@/lib/export-processor/errors';
import { env } from '@/lib/env';
import type { Filter } from 'mongodb';

export async function processExport(jobId: string, authSubject: string, claimedWorkerToken?: string) {
    const claimed = claimedWorkerToken
        ? await getExportJob(jobId, authSubject)
        : await claimExportJob(jobId, authSubject, env.EXPORT_JOB_STALE_MINUTES);
    if (!claimed?.workerToken || (claimedWorkerToken && claimed.workerToken !== claimedWorkerToken)) return;
    const workerToken = claimed.workerToken;
    logger.info('[Export] Starting archive generation', { generationAttempt: claimed.generationAttempts });
    let costJob: ExportJob | undefined;
    let costStarted = false;
    let stage: ExportFailureStage = 'validation';
    let partNumber: number | undefined;
    let renewing = false;
    const active = () => assertExportActive(authSubject, jobId, undefined, workerToken);
    const update = (updates: Parameters<typeof updateActiveExportJob>[2]) => updateActiveExportJob(jobId, authSubject, updates, undefined, workerToken);
    const heartbeat = setInterval(() => {
        if (renewing) return;
        renewing = true;
        void heartbeatExportJob(jobId, authSubject, workerToken, env.EXPORT_JOB_STALE_MINUTES)
            .catch(error => logger.warn('[Export] Worker heartbeat failed', toExportFailure(error, 'checkpoint')))
            .finally(() => { renewing = false; });
    }, 30_000);
    heartbeat.unref();
    const beginCost = async () => {
        if (!costStarted) { await update({ costStartedAt: new Date() }); costStarted = true; }
    };
    const settleCost = async () => {
        if (!costJob?.costReservationId || costJob.maximumCostMicros === undefined || costJob.costSettledAt) return;
        const db = await getMongoDb();
        const filter: Filter<ExportJob> = { _id: costJob._id, authSubject, workerToken, workerLeaseUntil: { $gt: new Date() },
            status: { $in: ['processing', 'completed', 'failed'] }, cleanupPending: { $ne: true },
            abortedAt: { $exists: false }, cleanedAt: { $exists: false }, costSettledAt: { $exists: false } };
        if (!await db.collection<ExportJob>('export_jobs').findOne(filter)) return;
        await finishExportBudget(authSubject, { id: costJob.costReservationId, maximumCostMicros: costJob.maximumCostMicros,
            source: costJob.costBudgetSource || 'customer', poolId: costJob.costBudgetPoolId, unpriced: costJob.costUnpriced,
            estimateStale: costJob.costEstimateStale, costPolicyVersion: costJob.costPolicyVersion }, costStarted, db);
        const result = await db.collection<ExportJob>('export_jobs').updateOne(filter, { $set: { costSettledAt: new Date() } });
        if (result.matchedCount) costJob.costSettledAt = new Date();
    };
    try {
        await active();
        const user = await findUserByAuthSubject(authSubject);
        if (!user) {
            throw new Error('Account is unavailable');
        }

        const existingJob = claimed;
        costJob = existingJob;
        costStarted = Boolean(existingJob.costStartedAt);
        if (existingJob.sourceRevision && (await getExportSourceSnapshot(authSubject)).revision !== existingJob.sourceRevision) {
            throw new ExportProcessingError('validation', 'source-changed');
        }
        const requesterSubject = existingJob.requestedByAuthSubject || authSubject;
        await resolveExportSubject(requesterSubject, requesterSubject === authSubject ? undefined : user._id.toString());
        const requester = await findUserByAuthSubject(requesterSubject);
        // Recheck persisted parts after queue delay, before any new generation.
        stage = 'checkpoint';
        await verifyCheckpointParts(existingJob);
        stage = 'validation';

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

        await update({
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
            stage = 'finalize';
            await finalizeJob(jobId, authSubject, [], requester?.email, workerToken);
            return;
        }

        let pendingChunk: Recording[] = [];
        let pendingChunkBytes = 0;
        let inputBudgetUsed = initialParts.reduce((sum, part) => sum + part.size, 0);
        let latestCursor = cursor;

        while (true) {
            await active();
            const page = await getRecordingsPageForExport(authSubject, EXPORT_PAGE_SIZE, latestCursor);
            if (page.length === 0) {
                break;
            }

            for (const recording of page) {
                inputBudgetUsed += Math.max(0, recording.fileSize || 0) + Buffer.byteLength(JSON.stringify(recording)) * 2 + 4096;
                if (existingJob.estimatedArchiveBytes !== undefined && inputBudgetUsed > existingJob.estimatedArchiveBytes) {
                    throw new ExportProcessingError('validation', 'budget');
                }
                pendingChunk.push(recording);
                pendingChunkBytes += Math.max(recording.fileSize || 0, DEFAULT_RECORDING_SIZE_BYTES);
                latestCursor = {
                    recordedAt: new Date(recording.recordedAt),
                    id: recording._id.toString(),
                };

                if (pendingChunkBytes >= PART_SIZE_LIMIT) {
                    await beginCost();
                    stage = 'archive-build';
                    partNumber = nextPartNumber;
                    const part = await ensurePartUploaded(authSubject, jobId, nextPartNumber, pendingChunk, existingJob.estimatedArchiveBytes, workerToken);
                    parts = upsertPart(parts, part);

                    processedRecordings += pendingChunk.length;
                    nextPartNumber += 1;
                    pendingChunk = [];
                    pendingChunkBytes = 0;

                    stage = 'checkpoint';
                    await persistCheckpoint({
                        jobId,
                        authSubject,
                        totalRecordings,
                        processedRecordings,
                        cursor: latestCursor,
                        nextPartNumber,
                        parts,
                        workerToken,
                    });
                }
            }
        }

        if (pendingChunk.length > 0) {
            await beginCost();
            stage = 'archive-build';
            partNumber = nextPartNumber;
            const part = await ensurePartUploaded(authSubject, jobId, nextPartNumber, pendingChunk, existingJob.estimatedArchiveBytes, workerToken);
            parts = upsertPart(parts, part);
            processedRecordings += pendingChunk.length;
            nextPartNumber += 1;

            stage = 'checkpoint';
            await persistCheckpoint({
                jobId,
                authSubject,
                totalRecordings,
                processedRecordings,
                cursor: latestCursor,
                nextPartNumber,
                parts,
                workerToken,
            });
        }

        stage = 'finalize';
        await finalizeJob(jobId, authSubject, parts, requester?.email, workerToken);
    } catch (error) {
        const failure = { ...toExportFailure(error, stage), occurredAt: new Date(),
            generationAttempt: claimed.generationAttempts, ...(partNumber === undefined ? {} : { partNumber }) };
        try {
            await active();
            // Finish the accepted expense before exposing a manually retryable
            // failure. The settlement itself remains idempotent by reservation.
            await settleCost().catch(settlementError => logger.warn('[Export] Budget settlement remains pending', toExportFailure(settlementError, 'finalize')));
            await update({ status: 'failed', error: exportFailureMessage(failure), failure });
            logger.error('[Export] Archive generation failed', failure);
        } catch (ownershipError) {
            if (ownershipError instanceof ExportWorkerOwnershipError || ownershipError instanceof ExportProcessingError && ownershipError.code === 'cancelled') {
                logger.info('[Export] Archive worker was replaced or revoked');
            } else {
                logger.error('[Export] Failure persistence remains pending', toExportFailure(ownershipError, 'checkpoint'));
            }
        }
    } finally {
        clearInterval(heartbeat);
        await settleCost().catch(error => logger.error('[Export] Budget settlement remains pending', toExportFailure(error, 'finalize')));
        // A terminal worker releases its token; a stale worker cannot clear a
        // newer worker's lease or change its timestamps.
        try {
            const db = await getMongoDb();
            await db.collection<ExportJob>('export_jobs').updateOne({ _id: claimed._id, authSubject, workerToken,
                status: { $in: ['completed', 'failed'] } }, { $unset: { workerToken: '', workerLeaseUntil: '' } });
        } catch (error) { logger.warn('[Export] Terminal lease release remains pending', toExportFailure(error, 'checkpoint')); }
    }
}
