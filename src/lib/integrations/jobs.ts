import { randomUUID } from 'node:crypto';
import { ObjectId, MongoServerError, type Db } from 'mongodb';
import { Collections } from '@/lib/mongodb';
import type { Recording, User } from '@/lib/db/types';
import { validateTranscriptionRequest, executeTranscription, type ManualTranscriptionOptions, type TranscriptionExecution } from '@/lib/transcription/manual';
import type { TranscriptionBatch } from '@/lib/transcription/batch-types';
import { getTeamSettings } from '@/lib/team-policy';
import { IntegrationCollections, integrationDb } from './database';
import { ApiError, fingerprint } from './contracts';
import { legacyEnrichmentBlock, processingFailure, type ProcessingStatus } from '@/lib/transcription/processing-errors';

export interface IngestionJob {
    _id: string; owner: string; recordingId: string; options: ManualTranscriptionOptions; automatic: boolean;
    state: 'pending' | 'running' | 'submitted' | 'completed' | 'failed' | 'needs_review';
    createdAt: Date; leaseUntil: Date; leaseOwner?: string; error?: string;
    batchId?: string; attemptId?: string;
    retranscribe?: boolean;
    startedAt?: Date;
    submittedAt?: Date;
    processingStatus?: ProcessingStatus;
    attemptHistory?: { attemptId?: string; state: IngestionJob['state']; error?: string; processingStatus?: ProcessingStatus; startedAt?: Date; submittedAt?: Date; archivedAt: Date }[];
}
interface DispatchSlot { _id: string; jobId?: string; attemptId?: string; until: Date }
const SLOT = 'transcription';
const LEASE_MS = 10 * 60_000;
const ASYNC_WAIT_MS = 24 * 60 * 60_000;
const slots = (db: Db) => db.collection<DispatchSlot>('transcription_dispatch');
export const batchJobId = (batchId: string, recordingId: string) => `batch:${batchId}:${recordingId}`;

function archiveAttempt(job: IngestionJob) {
    if ((job.attemptHistory?.length || 0) >= 32) throw new ApiError(409, 'processing_review_required', 'The processing retry history is full. Contact your administrator before starting another attempt.');
    return [...(job.attemptHistory || []), { attemptId: job.attemptId, state: job.state, error: job.error,
        processingStatus: job.processingStatus, startedAt: job.startedAt, submittedAt: job.submittedAt, archivedAt: new Date() }];
}

export async function enqueueTranscription(owner: string, recordingId: string, options: ManualTranscriptionOptions, id: string, automatic = false, database?: Db, batchId?: string, retranscribe = false) {
    const db = database || await integrationDb();
    const jobs = db.collection<IngestionJob>(IntegrationCollections.jobs);
    let job: IngestionJob | null;
    try {
        job = await jobs.findOneAndUpdate({ _id: id }, { $setOnInsert: {
            owner, recordingId, options, automatic, state: 'pending', createdAt: new Date(), leaseUntil: new Date(0), ...(batchId ? { batchId } : {}), ...(retranscribe ? { retranscribe } : {}),
        } }, { upsert: true, returnDocument: 'after' });
    } catch (error) {
        if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
        job = await jobs.findOne({ _id: id });
    }
    if (!job || job.owner !== owner || job.recordingId !== recordingId || job.automatic !== automatic || job.batchId !== batchId || fingerprint(job.options) !== fingerprint(options)) {
        throw new ApiError(409, 'transcription_conflict', 'A transcription with different options is already queued.');
    }
    return { jobId: id, recordingId, state: 'queued' as const };
}

export async function requestTranscription(owner: string, recording: Recording, options: ManualTranscriptionOptions, allowRetranscription = false) {
    if (recording.bulkImportId) throw new ApiError(409, 'batch_approval_required', 'This recording is waiting in Transcription. Start its batch there.');
    if (recording.transcriptionStatus === 'processing' || (!allowRetranscription && recording.transcriptionStatus === 'completed')) {
        throw new ApiError(409, 'transcription_conflict', 'Recording is processing or already transcribed.');
    }
    const db = await integrationDb();
    try { await validateTranscriptionRequest(owner, recording._id.toString(), options); }
    catch (error) { throw new ApiError(403, 'transcription_blocked', error instanceof Error ? error.message : 'Transcription is unavailable.'); }
    const uncertainJobs = await db.collection<IngestionJob>(IntegrationCollections.jobs).find({ owner, recordingId: recording._id.toString(), state: 'needs_review' }).toArray();
    if (uncertainJobs.some(job => job.processingStatus && ['contact_admin', 'none'].includes(job.processingStatus.retryAction || ''))) {
        throw new ApiError(409, 'processing_review_required', 'This processing result needs administrator review before it can resume.');
    }
    if (uncertainJobs.some(job => !legacyEnrichmentBlock(recording, job.error)) && !options.acknowledgeProviderOutcome) throw new ApiError(409, 'transcription_review_required', 'The provider outcome is uncertain. Review it before requesting another transcription.');
    const id = `manual:${recording._id}`;
    const active = await db.collection<IngestionJob>(IntegrationCollections.jobs).findOne({ owner, recordingId: recording._id.toString(), state: { $in: ['pending', 'running', 'submitted'] } });
    if (active) {
        if (fingerprint(active.options) !== fingerprint(options)) throw new ApiError(409, 'transcription_conflict', 'This recording already has queued transcription work.');
        return { jobId: active._id, recordingId: recording._id.toString(), state: 'queued' as const };
    }
    const existing = await db.collection<IngestionJob>(IntegrationCollections.jobs).findOne({ _id: id, owner, recordingId: recording._id.toString() });
    if (existing && ['pending', 'running', 'submitted'].includes(existing.state)) {
        if (fingerprint(existing.options) !== fingerprint(options)) throw new ApiError(409, 'transcription_conflict', 'A transcription with different options is already queued.');
        return { jobId: id, recordingId: recording._id.toString(), state: 'queued' as const };
    }
    if (existing?.state === 'needs_review' && !legacyEnrichmentBlock(recording, existing.error) && !options.acknowledgeProviderOutcome) throw new ApiError(409, 'transcription_review_required', 'The provider outcome is uncertain. Review it before requesting another transcription.');
    if (existing) {
        const result = await db.collection<IngestionJob>(IntegrationCollections.jobs).updateOne({ _id: id, owner,
            state: existing.state, ...(existing.attemptId ? { attemptId: existing.attemptId } : { attemptId: { $exists: false } }) }, {
            $set: { state: 'pending', options, leaseUntil: new Date(0), attemptHistory: archiveAttempt(existing),
                retranscribe: recording.transcriptionStatus === 'completed' },
            $unset: { attemptId: '', leaseOwner: '', error: '', processingStatus: '', startedAt: '', submittedAt: '' },
        });
        if (!result.matchedCount) throw new ApiError(409, 'transcription_conflict', 'This processing job changed. Refresh before retrying.');
    }
    for (const uncertain of uncertainJobs) if (uncertain._id !== id) await db.collection<IngestionJob>(IntegrationCollections.jobs).updateOne({ _id: uncertain._id,
        owner, state: 'needs_review', ...(uncertain.attemptId ? { attemptId: uncertain.attemptId } : {}) }, { $set: { state: 'failed' } });
    return enqueueTranscription(owner, recording._id.toString(), options, id, false, db, undefined, recording.transcriptionStatus === 'completed');
}

/** The dispatcher identity is never supplied by a public API or a Server Action. */
export async function isTranscriptionExecutionAuthorized(owner: string, recording: Recording, execution: TranscriptionExecution) {
    const db = await integrationDb();
    const job = await db.collection<IngestionJob>(IntegrationCollections.jobs).findOne({
        _id: execution.jobId, owner, recordingId: recording._id.toString(), state: 'running', attemptId: execution.attemptId,
    });
    if (!job || !await slots(db).findOne({ _id: SLOT, jobId: job._id, attemptId: execution.attemptId })) return false;
    if (!recording.bulkImportId) return !job.batchId;
    return Boolean(job.batchId && recording.transcriptionBatchId === job.batchId && await db.collection<TranscriptionBatch>('transcription_batches').findOne({
        _id: job.batchId, owner, status: { $in: ['running', 'paused'] }, recordingIds: recording._id.toString(),
    }));
}

async function releaseSlot(db: Db, job: IngestionJob) {
    await slots(db).updateOne({ _id: SLOT, jobId: job._id, attemptId: job.attemptId }, {
        $set: { until: new Date(0) }, $unset: { jobId: '', attemptId: '' },
    });
}

export async function reconcileTranscriptionBatches(db: Db) {
    const batches = db.collection<TranscriptionBatch>('transcription_batches');
    for await (const batch of batches.find({ status: { $in: ['running', 'paused', 'needs_review'] } })) {
        const jobs = await db.collection<IngestionJob>(IntegrationCollections.jobs).find({ batchId: batch._id }).toArray();
        const expected = batch.recordingIds.map(id => jobs.find(job => job._id === batchJobId(batch._id, id)));
        if (expected.length && expected.every(job => job?.state === 'completed')) {
            await batches.updateOne({ _id: batch._id, status: { $in: ['running', 'paused', 'needs_review'] } }, { $set: { status: 'completed', updatedAt: new Date() } });
        } else if (expected.some(job => job && ['failed', 'needs_review'].includes(job.state))) {
            await batches.updateOne({ _id: batch._id, status: { $in: ['running', 'paused'] } }, { $set: {
                status: 'needs_review', updatedAt: new Date(), error: 'Processing stopped. Review the failed recordings before retrying.',
            } });
        }
    }
}

/** Async callbacks settle only their own attempt, never a newer job's slot. */
export async function settleQueuedTranscription(owner: string, recordingId: string, execution?: TranscriptionExecution, database?: Db) {
    const db = database || await integrationDb();
    const recording = await db.collection<Recording>(Collections.RECORDINGS).findOne({ _id: new ObjectId(recordingId), authSubject: owner });
    if (!recording || !['completed', 'failed'].includes(recording.transcriptionStatus)) return;
    const jobId = execution?.jobId || recording.transcriptionJobId;
    const attemptId = execution?.attemptId || recording.transcriptionAttemptId;
    if (!jobId || !attemptId || recording.transcriptionJobId !== jobId || recording.transcriptionAttemptId !== attemptId) return;
    const job = await db.collection<IngestionJob>(IntegrationCollections.jobs).findOneAndUpdate({
        _id: jobId, owner, recordingId, attemptId, state: { $in: ['running', 'submitted', 'needs_review'] },
    }, { $set: {
        state: recording.transcriptionStatus === 'completed' ? 'completed'
            : recording.processingStatus && recording.processingStatus.state !== 'needs_review'
                && recording.processingStatus.providerOutcome !== 'unknown' ? 'failed' : 'needs_review',
        error: recording.transcriptionStatus === 'completed' ? '' : recording.transcriptionError || 'Provider processing failed. Review before retrying.',
        ...(recording.processingStatus ? { processingStatus: recording.processingStatus } : {}),
        leaseUntil: new Date(0),
    }, $unset: { leaseOwner: '' } }, { returnDocument: 'after' });
    if (job) await releaseSlot(db, job);
    await reconcileTranscriptionBatches(db);
}

/** A callback owns the same slot throughout enrichment, even hours after submission. */
export async function beginQueuedWebhookExecution(owner: string, recordingId: string, eventId: string, execution?: TranscriptionExecution, database?: Db) {
    const db = database || await integrationDb();
    if (execution) {
        const job = await db.collection<IngestionJob>(IntegrationCollections.jobs).findOne({ _id: execution.jobId, owner, recordingId });
        if (!job || job.attemptId !== execution.attemptId || job.state === 'completed') throw new Error('This callback no longer owns the transcription slot.');
        if (!['running', 'submitted'].includes(job.state) || !await slots(db).findOne({ _id: SLOT, jobId: execution.jobId, attemptId: execution.attemptId })) return undefined;
    }
    const renew = async () => {
        if (execution) {
            const result = await slots(db).updateOne({ _id: SLOT, jobId: execution.jobId, attemptId: execution.attemptId }, { $set: { until: new Date(Date.now() + LEASE_MS) } });
            if (!result.matchedCount) throw new Error('This callback no longer owns the transcription slot.');
            const job = await db.collection<IngestionJob>(IntegrationCollections.jobs).updateOne({ _id: execution.jobId, owner, recordingId, attemptId: execution.attemptId, state: { $in: ['running', 'submitted'] } }, { $set: { state: 'running', leaseUntil: new Date(Date.now() + LEASE_MS) } });
            if (!job.matchedCount) throw new Error('This provider attempt requires review before continuing.');
        }
        await db.collection<{ _id: string }>(Collections.TRANSCRIPTION_WEBHOOK_EVENTS).updateOne({ _id: eventId }, { $set: { updatedAt: new Date() } });
    };
    await renew();
    const timer = setInterval(() => { void renew().catch(() => {}); }, 30_000);
    timer.unref();
    return () => clearInterval(timer);
}

/** Requeue only a validated saved provider result, never the original ASR call. */
export async function queueDeferredTranscriptionCompletion(owner: string, recordingId: string, execution: TranscriptionExecution, database?: Db) {
    const db = database || await integrationDb();
    const recordings = db.collection<Recording>(Collections.RECORDINGS);
    const jobs = db.collection<IngestionJob>(IntegrationCollections.jobs);
    const markerFilter = { 'transcriptionCompletionPending.jobId': execution.jobId, 'transcriptionCompletionPending.attemptId': execution.attemptId };
    const recording = await recordings.findOne({ _id: new ObjectId(recordingId), authSubject: owner,
        transcriptionResultAttemptId: execution.attemptId, ...markerFilter });
    if (!recording?.fullTranscript || !recording.transcriptionEnrichmentPending) return;
    const job = await jobs.findOne({ _id: execution.jobId, owner, recordingId });
    if (!job) throw new ApiError(409, 'transcription_review_required', 'The saved result has no matching execution journal.');
    // A worker already claimed this exact saved result. Do not reset its state.
    if (job.attemptId !== execution.attemptId && ['pending', 'running', 'submitted', 'completed'].includes(job.state)) {
        await recordings.updateOne({ _id: recording._id, authSubject: owner, ...markerFilter }, { $unset: { transcriptionCompletionPending: '' } });
        return;
    }
    if (job.attemptId !== execution.attemptId) throw new ApiError(409, 'transcription_review_required', 'A newer execution requires review.');
    if (job.state !== 'pending') {
        if (await slots(db).findOne({ _id: SLOT, jobId: execution.jobId, attemptId: execution.attemptId })) {
            throw new ApiError(409, 'transcription_conflict', 'The original callback execution is still settling. Retry its completion.');
        }
        // This archives an already-paid result, not another permitted provider
        // attempt. Preserve the original error even when normal retry history is full.
        const attemptHistory = [...(job.attemptHistory || []), { attemptId: job.attemptId, state: job.state, error: job.error,
            processingStatus: job.processingStatus, startedAt: job.startedAt, submittedAt: job.submittedAt, archivedAt: new Date() }];
        const changed = await jobs.updateOne({ _id: job._id, owner, recordingId, attemptId: job.attemptId, state: job.state }, {
            $set: { state: 'pending', leaseUntil: new Date(0), attemptHistory },
            $unset: { leaseOwner: '', error: '', processingStatus: '' },
        });
        if (!changed.matchedCount) throw new ApiError(409, 'transcription_conflict', 'The saved completion changed. Retry its handoff.');
    }
    if (job.batchId && !await jobs.countDocuments({ owner, batchId: job.batchId, state: { $in: ['failed', 'needs_review'] } })) {
        await db.collection<TranscriptionBatch>('transcription_batches').updateOne({ _id: job.batchId, owner, status: 'needs_review' }, {
            $set: { status: 'running', updatedAt: new Date() }, $unset: { error: '' },
        });
    }
    await recordings.updateOne({ _id: recording._id, authSubject: owner, ...markerFilter }, { $unset: { transcriptionCompletionPending: '' } });
}

/** Repair a crash after result acceptance or settlement but before queue handoff. */
async function repairDeferredTranscriptionCompletions(db: Db) {
    for await (const recording of db.collection<Recording>(Collections.RECORDINGS).find({ 'transcriptionCompletionPending.jobId': { $type: 'string' } }).limit(100)) {
        if (!recording.transcriptionCompletionPending) continue;
        try { await queueDeferredTranscriptionCompletion(recording.authSubject, recording._id.toHexString(), recording.transcriptionCompletionPending, db); }
        catch (error) { if (!(error instanceof ApiError) || error.status >= 500) throw error; }
    }
}

/** Respect already accepted work from deployments predating the shared dispatcher. */
async function recoverLegacyJobs(db: Db): Promise<boolean> {
    const jobs = db.collection<IngestionJob>(IntegrationCollections.jobs);
    let busy = false;
    for await (const job of jobs.find({ state: { $in: ['running', 'submitted'] }, attemptId: { $exists: false } })) {
        const recording = await db.collection<Recording>(Collections.RECORDINGS).findOne({ _id: new ObjectId(job.recordingId), authSubject: job.owner });
        if (recording?.transcriptionStatus === 'completed') await jobs.updateOne({ _id: job._id, attemptId: { $exists: false } }, { $set: { state: 'completed' } });
        else if (recording?.externalTranscriptionId && recording.transcriptionStatus === 'processing') busy = true;
        else if (job.state === 'running' && job.leaseUntil > new Date()) busy = true;
        else await jobs.updateOne({ _id: job._id, attemptId: { $exists: false } }, { $set: { state: 'needs_review', error: 'Previous execution may have reached a provider. Review before retrying.' } });
    }
    for await (const recording of db.collection<Recording>(Collections.RECORDINGS).find({ transcriptionStatus: 'processing', transcriptionAttemptId: { $exists: false } })) {
        if (recording.externalTranscriptionId || recording.updatedAt.getTime() > Date.now() - LEASE_MS) busy = true;
        else await db.collection<Recording>(Collections.RECORDINGS).updateOne({ _id: recording._id, transcriptionStatus: 'processing', transcriptionAttemptId: { $exists: false } }, { $set: { transcriptionStatus: 'failed', transcriptionError: 'Previous execution was interrupted. Review the provider outcome before retrying.' } });
    }
    return busy;
}

async function recoverActiveSlot(db: Db) {
    const slot = await slots(db).findOne({ _id: SLOT });
    if (!slot?.jobId) return;
    const jobs = db.collection<IngestionJob>(IntegrationCollections.jobs);
    const job = await jobs.findOne({ _id: slot.jobId, attemptId: slot.attemptId });
    if (!job) {
        if (slot.until <= new Date()) await slots(db).updateOne({ _id: SLOT, jobId: slot.jobId, attemptId: slot.attemptId }, { $unset: { jobId: '', attemptId: '' } });
        return;
    }
    const recording = await db.collection<Recording>(Collections.RECORDINGS).findOne({ _id: new ObjectId(job.recordingId), authSubject: job.owner });
    if (recording && ['completed', 'failed'].includes(recording.transcriptionStatus) && recording.transcriptionAttemptId === job.attemptId) {
        await settleQueuedTranscription(job.owner, job.recordingId, { jobId: job._id, attemptId: job.attemptId! }, db);
    } else if (['completed', 'failed', 'needs_review'].includes(job.state)) {
        await releaseSlot(db, job);
    } else if (slot.until <= new Date()) {
        if (recording?.externalTranscriptionId && recording.transcriptionAttemptId === job.attemptId && !recording.transcriptionEnrichmentPending && Date.now() - (job.submittedAt || job.startedAt || job.createdAt).getTime() < ASYNC_WAIT_MS) {
            await jobs.updateOne({ _id: job._id, attemptId: job.attemptId }, { $set: { state: 'submitted' } });
            return;
        }
        const message = recording?.externalTranscriptionId && !recording.transcriptionEnrichmentPending
            ? 'No provider completion arrived within 24 hours. Check the provider outcome before retrying.'
            : 'Execution was interrupted. The provider outcome may be uncertain; review before explicitly retrying.';
        await jobs.updateOne({ _id: job._id, attemptId: job.attemptId }, { $set: { state: 'needs_review', error: message } });
        if (recording?.transcriptionStatus === 'processing') await db.collection<Recording>(Collections.RECORDINGS).updateOne(
            { _id: recording._id, transcriptionAttemptId: job.attemptId }, { $set: { transcriptionStatus: 'failed', transcriptionError: message } },
        );
        await releaseSlot(db, job);
    }
}

export async function resetBatchJobsForRetry(owner: string, batchId: string, recordingIds: string[], database?: Db) {
    const db = database || await integrationDb();
    const jobs = db.collection<IngestionJob>(IntegrationCollections.jobs);
    const unsafe = await jobs.find({ owner, batchId, state: { $in: ['failed', 'needs_review'] } }).toArray();
    const pending = await jobs.find({ owner, batchId, state: 'pending', recordingId: { $in: recordingIds } }).toArray();
    const reviewed = [...unsafe, ...pending];
    if (!reviewed.length || reviewed.length !== new Set(recordingIds).size || reviewed.some(job => !recordingIds.includes(job.recordingId))) {
        throw new ApiError(409, 'review_all_failures', 'Review all failed or uncertain recordings in this batch before retrying.');
    }
    const histories = reviewed.map(archiveAttempt);
    for (const [index, job] of reviewed.entries()) {
        await releaseSlot(db, job);
        const result = await jobs.updateOne({ _id: job._id, owner, batchId, state: job.state,
            ...(job.attemptId ? { attemptId: job.attemptId } : { attemptId: { $exists: false } }) }, {
            $set: { state: 'pending', leaseUntil: new Date(0), attemptHistory: histories[index] }, $unset: { attemptId: '', leaseOwner: '', error: '', processingStatus: '' },
        });
        if (!result.matchedCount) throw new ApiError(409, 'transcription_conflict', 'This processing job changed. Refresh before retrying.');
        await db.collection<Recording>(Collections.RECORDINGS).updateOne({ _id: new ObjectId(job.recordingId), authSubject: owner, transcriptionBatchId: batchId }, {
            $set: { transcriptionStatus: 'pending', transcriptionError: '' },
        });
    }
}

export async function processTranscriptionJobs(limit = 5, database?: Db) {
    const db = database || await integrationDb();
    const jobs = db.collection<IngestionJob>(IntegrationCollections.jobs);
    const { repairTranscriptionBatchReservations } = await import('@/lib/transcription/batches');
    await repairTranscriptionBatchReservations(db);
    await recoverActiveSlot(db);
    await repairDeferredTranscriptionCompletions(db);
    await reconcileTranscriptionBatches(db);
    if (await recoverLegacyJobs(db)) return 0;
    for await (const batch of db.collection<TranscriptionBatch>('transcription_batches').find({ status: 'running' })) {
        for (const id of batch.recordingIds) await enqueueTranscription(batch.owner, id, { provider: batch.provider, ...(batch.model ? { model: batch.model } : {}) }, batchJobId(batch._id, id), false, db, batch._id);
    }
    let processed = 0;
    const deadline = Date.now() + 270_000;
    while (processed < limit && Date.now() < deadline) {
        const activeBatches = await db.collection<TranscriptionBatch>('transcription_batches').find({ status: 'running' }).project<{ _id: string }>({ _id: 1 }).toArray();
        const candidate = await jobs.findOne({ state: 'pending', $or: [{ batchId: { $exists: false } }, { batchId: { $in: activeBatches.map(batch => batch._id) } }] }, { sort: { createdAt: 1, _id: 1 } });
        if (!candidate) break;
        const attemptId = randomUUID();
        try {
            await slots(db).updateOne({ _id: SLOT }, { $setOnInsert: { until: new Date(0) } }, { upsert: true });
        } catch (error) { if (!(error instanceof MongoServerError) || error.code !== 11000) throw error; }
        const slot = await slots(db).findOneAndUpdate({ _id: SLOT, jobId: { $exists: false } }, {
            $set: { jobId: candidate._id, attemptId, until: new Date(Date.now() + LEASE_MS) },
        }, { returnDocument: 'after' });
        if (!slot) break;
        const job = await jobs.findOneAndUpdate({ _id: candidate._id, state: 'pending' }, {
            $set: { state: 'running', attemptId, startedAt: new Date(), leaseOwner: attemptId, leaseUntil: new Date(Date.now() + LEASE_MS) },
        }, { returnDocument: 'after' });
        if (!job) { await releaseSlot(db, { ...candidate, attemptId }); continue; }
        const heartbeat = setInterval(() => {
            void Promise.all([
                slots(db).updateOne({ _id: SLOT, jobId: job._id, attemptId }, { $set: { until: new Date(Date.now() + LEASE_MS) } }),
                jobs.updateOne({ _id: job._id, attemptId }, { $set: { leaseUntil: new Date(Date.now() + LEASE_MS) } }),
            ]).catch(() => {});
        }, 30_000);
        heartbeat.unref();
        let executionUncertain = false;
        let failureStatus: ProcessingStatus | undefined;
        try {
            const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: job.owner });
            const recording = await db.collection<Recording>(Collections.RECORDINGS).findOne({ _id: new ObjectId(job.recordingId), authSubject: job.owner });
            if (!user || user.disabled || user.softDelete?.isDeleted || user.teamInvitationPending || !recording) throw new Error('Account or recording unavailable.');
            if (job.batchId && !await db.collection<TranscriptionBatch>('transcription_batches').findOne({ _id: job.batchId, owner: job.owner, status: 'running' })) {
                await jobs.updateOne({ _id: job._id, attemptId }, { $set: { state: 'pending' }, $unset: { attemptId: '', leaseOwner: '' } });
                await releaseSlot(db, job); break;
            }
            if (recording.transcriptionStatus === 'completed' && !job.retranscribe) {
                await jobs.updateOne({ _id: job._id, attemptId }, { $set: { state: 'completed' } });
                await releaseSlot(db, job); await reconcileTranscriptionBatches(db); continue;
            }
            if (job.automatic) {
                const team = await getTeamSettings(db);
                if (recording.bulkImportId || (team.enabled ? team.transcriptionMode !== 'automatic' : !user.transcriptionSettings.autoTranscribe)) throw new Error('Automatic transcription is disabled for this recording.');
            }
            const company = await getTeamSettings(db);
            const options = job.automatic ? {
                provider: company.enabled ? company.transcriptionProvider : undefined,
                model: company.enabled ? company.transcriptionModel : user.transcriptionSettings.defaultModel,
            } : job.options;
            executionUncertain = true;
            const result = await executeTranscription(job.owner, job.recordingId, options, { jobId: job._id, attemptId });
            if (result.error) {
                executionUncertain = result.providerOutcomeUncertain === true;
                failureStatus = 'processingStatus' in result ? result.processingStatus : undefined;
                throw new Error(result.error);
            }
            await settleQueuedTranscription(job.owner, job.recordingId, { jobId: job._id, attemptId }, db);
            const latest = await jobs.findOne({ _id: job._id, attemptId });
            if (latest?.state === 'running') await jobs.updateOne({ _id: job._id, attemptId, state: 'running' }, { $set: { state: 'submitted', submittedAt: new Date(), leaseUntil: new Date(0) }, $unset: { leaseOwner: '' } });
        } catch (error) {
            const message = (error instanceof Error ? error.message : 'Transcription failed').slice(0, 500);
            const processingStatus = failureStatus || processingFailure(error, 'transcription', executionUncertain ? 'unknown' : 'not_started');
            await jobs.updateOne({ _id: job._id, attemptId, state: { $in: ['running', 'submitted'] } }, {
                $set: { state: processingStatus.state === 'needs_review' || processingStatus.providerOutcome === 'unknown' ? 'needs_review' : 'failed', error: message,
                    processingStatus, leaseUntil: new Date(0) }, $unset: { leaseOwner: '' },
            });
            await releaseSlot(db, job);
            await reconcileTranscriptionBatches(db);
        } finally { clearInterval(heartbeat); }
        processed++;
    }
    return processed;
}

export async function recordingJobStatus(owner: string, recordingId: string) {
    const job = await (await integrationDb()).collection<IngestionJob>(IntegrationCollections.jobs).findOne({ owner, recordingId }, { sort: { createdAt: -1 } });
    return job ? { state: job.state, error: job.error ?? null, processingStatus: job.processingStatus } : null;
}
