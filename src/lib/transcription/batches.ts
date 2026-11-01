import { processingProgress } from './progress';
import { randomUUID } from 'node:crypto';
import { MongoServerError, ObjectId, type Db, type Filter } from 'mongodb';
import { z } from 'zod';
import { checkTranscriptionAccess, checkUserAccess } from '@/lib/access-control';
import { billingEnabled, transcriptionPricing } from '@/lib/config';
import { effectiveTranscriptionProvider, resolveEffectiveTranscriptionPolicy, type EffectiveTranscriptionPolicy } from '@/lib/transcription-multipliers';
import { assertManagedTranscriptionLimits } from '@/lib/stripe/catalog';
import type { Recording, SystemSettings, User } from '@/lib/db/types';
import { ApiError } from '@/lib/integrations/contracts';
import { integrationDb, IntegrationCollections } from '@/lib/integrations/database';
import { Collections } from '@/lib/mongodb';
import { getTeamSettings } from '@/lib/team-policy';
import { buildTranscriptionFileSizeError, isTranscriptionFileSizeAllowed } from '@/lib/transcription-limits';
import { calculateBilledDuration, isKnownAudioDuration } from '@/lib/utils/billing';
import { resolveTranscriptionProvider } from '@/services/transcription';
import { TranscriptionFactory } from '@/services/transcription/factory';
import type { BatchResponse, BatchSelection, TranscriptionBatch, TranscriptionImport, TranscriptionWorkspace, WaitingRecording } from './batch-types';
import { defaultTranscriptionModel as defaultModel } from './model';
import type { ProcessingStatus } from './processing-errors';

const BATCHES = 'transcription_batches';
const IMPORTS = 'transcription_imports';
const LOCKS = 'transcription_batch_locks';
const WAITING_PAGE_SIZE = 100;
const BATCH_PAGE_SIZE = 50;
function providerPolicy(settings: SystemSettings | null): EffectiveTranscriptionPolicy {
    const managed = billingEnabled();
    return resolveEffectiveTranscriptionPolicy(managed, managed ? {} : transcriptionPricing(), settings?.transcriptionMultipliers);
}
function selectedProvider(policy: EffectiveTranscriptionPolicy, provider: string, model?: string) {
    try { return effectiveTranscriptionProvider(policy, provider, model); }
    catch (error) { invalid(error instanceof Error ? error.message : 'This transcription provider or model is not available.'); }
}
const RECORDING_METADATA_PROJECTION = {
    _id: 1, fileName: 1, standardizedDisplayName: 1, duration: 1, recordedAt: 1,
    recordingDateKey: 1, bulkImportId: 1, transcriptionStatus: 1, processingStatus: 1, transcriptionEnrichmentPending: 1,
} as const;
const RecordingIdsSchema = z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(1000)
    .refine(ids => new Set(ids).size === ids.length, 'Select each recording only once.');
const SelectionSchema = z.object({
    recordingIds: RecordingIdsSchema,
    name: z.string().trim().min(1).max(120).optional(),
    provider: z.enum(['soniox', 'elevenlabs', 'gemini', 'openai_compat']).optional(),
    model: z.string().trim().min(1).max(120).optional(),
}).strict();
const UpdateSchema = z.object({
    action: z.enum(['edit', 'remove', 'start', 'pause', 'resume', 'retry']),
    recordingIds: RecordingIdsSchema.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    provider: z.enum(['soniox', 'elevenlabs', 'gemini', 'openai_compat']).optional(),
    model: z.string().trim().min(1).max(120).optional(),
    acknowledgeProviderOutcome: z.boolean().optional(),
}).strict();

interface BatchLock { _id: string; token: string; until: Date }
interface BatchJob {
    _id: string; owner: string; recordingId: string; batchId?: string;
    state: 'pending' | 'running' | 'submitted' | 'completed' | 'failed' | 'needs_review';
    error?: string;
    processingStatus?: ProcessingStatus;
}

function invalid(message: string): never { throw new ApiError(400, 'invalid_batch', message); }
function conflict(message: string): never { throw new ApiError(409, 'batch_conflict', message); }

/** All membership mutations for an owner share a renewable standalone-safe lease. */
async function withOwnerLock<T>(db: Db, owner: string, work: () => Promise<T>): Promise<T> {
    const token = randomUUID();
    const locks = db.collection<BatchLock>(LOCKS);
    try {
        const lock = await locks.findOneAndUpdate({ _id: owner, until: { $lte: new Date() } }, {
            $set: { token, until: new Date(Date.now() + 60_000) },
        }, { upsert: true, returnDocument: 'after' });
        if (!lock || lock.token !== token) conflict('Another batch change is in progress. Please retry.');
    } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) conflict('Another batch change is in progress. Please retry.');
        throw error;
    }
    const heartbeat = setInterval(() => {
        void locks.updateOne({ _id: owner, token }, { $set: { until: new Date(Date.now() + 60_000) } }).catch(() => {});
    }, 15_000);
    heartbeat.unref();
    try { return await work(); }
    finally {
        clearInterval(heartbeat);
        await locks.deleteOne({ _id: owner, token });
    }
}

async function actor(db: Db, owner: string): Promise<User> {
    const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: owner });
    if (!user) throw new ApiError(401, 'unauthorized', 'Account unavailable.');
    const access = checkUserAccess(user);
    if (!access.allowed) throw new ApiError(403, 'account_unavailable', access.reason || 'Account unavailable.');
    return user;
}

function waitingFilter(owner: string): Filter<Recording> {
    return {
        authSubject: owner,
        bulkImportId: { $type: 'string' },
        transcriptionBatchId: { $exists: false },
        transcriptionStatus: { $in: ['pending', 'failed'] },
        externalTranscriptionId: { $exists: false },
        transcriptionAttemptId: { $exists: false },
    };
}

function metadata(recording: Recording): WaitingRecording {
    return {
        id: recording._id.toHexString(), fileName: recording.fileName,
        displayName: recording.standardizedDisplayName || recording.fileName,
        duration: recording.duration, recordedAt: recording.recordedAt.toISOString(),
        dateKey: recording.recordingDateKey ?? null, importId: recording.bulkImportId!,
    };
}

async function batchResponse(db: Db, batch: TranscriptionBatch): Promise<BatchResponse> {
    const [recordings, jobs] = await Promise.all([
        db.collection<Recording>(Collections.RECORDINGS).find({ authSubject: batch.owner, _id: { $in: batch.recordingIds.map(id => new ObjectId(id)) } }, { projection: RECORDING_METADATA_PROJECTION }).toArray(),
        db.collection<BatchJob>(IntegrationCollections.jobs).find({ owner: batch.owner, batchId: batch._id }, { projection: { recordingId: 1, state: 1, error: 1, processingStatus: 1 } }).toArray(),
    ]);
    const byId = new Map(recordings.map(recording => [recording._id.toHexString(), recording]));
    const jobsByRecording = new Map(jobs.map(job => [job.recordingId, job]));
    const items = batch.recordingIds.flatMap(id => {
        const recording = byId.get(id);
        if (!recording) return [];
        const job = jobsByRecording.get(id);
        return [{ ...metadata(recording), status: recording.transcriptionStatus,
            processingStatus: job?.processingStatus || recording.processingStatus,
            processingProgress: processingProgress({ ...recording, processingStatus: job?.processingStatus || recording.processingStatus }),
            ...(job ? { jobState: job.state, ...(job.error ? { error: job.error } : {}) } : {}) }];
    });
    return {
        id: batch._id, name: batch.name, dateKey: batch.dateKey, recordingIds: batch.recordingIds,
        recordings: items, provider: batch.provider, ...(batch.model ? { model: batch.model } : {}),
        status: batch.status, createdAt: batch.createdAt.toISOString(), updatedAt: batch.updatedAt.toISOString(),
        totalDuration: batch.totalDuration,
        completedCount: items.filter(item => item.jobState ? item.jobState === 'completed' : item.status === 'completed').length,
        failedCount: items.filter(item => item.jobState ? ['failed', 'needs_review'].includes(item.jobState) : item.status === 'failed').length,
        ...(batch.error ? { error: batch.error } : {}),
    };
}

async function completeReservation(db: Db, batch: TranscriptionBatch): Promise<boolean> {
    if (batch.removing) {
        await db.collection<Recording>(Collections.RECORDINGS).updateMany({ authSubject: batch.owner, transcriptionBatchId: batch._id }, { $unset: { transcriptionBatchId: '' } });
        await db.collection<TranscriptionBatch>(BATCHES).deleteOne({ _id: batch._id, owner: batch.owner, status: 'draft', removing: true });
        return true;
    }
    const selection = batch.reservationUpdate;
    if (!selection) {
        if (batch.reservationReleasePending) {
            await db.collection<Recording>(Collections.RECORDINGS).updateMany({ authSubject: batch.owner, transcriptionBatchId: batch._id, _id: { $nin: batch.recordingIds.map(id => new ObjectId(id)) } }, { $unset: { transcriptionBatchId: '' } });
            await db.collection<TranscriptionBatch>(BATCHES).updateOne({ _id: batch._id, owner: batch.owner, status: 'draft' }, { $unset: { reservationReleasePending: '' } });
        }
        return true;
    }
    const ids = selection.recordingIds.map(id => new ObjectId(id));
    await db.collection<Recording>(Collections.RECORDINGS).updateMany({
        authSubject: batch.owner, _id: { $in: ids }, bulkImportId: { $type: 'string' },
        transcriptionStatus: { $in: ['pending', 'failed'] }, externalTranscriptionId: { $exists: false },
        transcriptionAttemptId: { $exists: false },
        $or: [{ transcriptionBatchId: { $exists: false } }, { transcriptionBatchId: batch._id }],
    }, { $set: { transcriptionBatchId: batch._id } });
    const reserved = await db.collection<Recording>(Collections.RECORDINGS).countDocuments({ authSubject: batch.owner, _id: { $in: ids }, transcriptionBatchId: batch._id });
    if (reserved !== ids.length) {
        await db.collection<Recording>(Collections.RECORDINGS).updateMany({ authSubject: batch.owner, transcriptionBatchId: batch._id, _id: { $nin: batch.recordingIds.map(id => new ObjectId(id)) } }, { $unset: { transcriptionBatchId: '' } });
        if (!batch.recordingIds.length) await db.collection<TranscriptionBatch>(BATCHES).deleteOne({ _id: batch._id, status: 'draft' });
        else await db.collection<TranscriptionBatch>(BATCHES).updateOne({ _id: batch._id, status: 'draft' }, { $unset: { reservationUpdate: '' }, $set: { error: 'Some selected recordings are no longer available. Review this batch.', updatedAt: new Date() } });
        return false;
    }
    await db.collection<TranscriptionBatch>(BATCHES).updateOne({ _id: batch._id, owner: batch.owner, status: 'draft' }, {
        $set: { ...selection, reservationReleasePending: true, updatedAt: new Date() }, $unset: { reservationUpdate: '', error: '' },
    });
    await db.collection<Recording>(Collections.RECORDINGS).updateMany({ authSubject: batch.owner, transcriptionBatchId: batch._id, _id: { $nin: ids } }, { $unset: { transcriptionBatchId: '' } });
    await db.collection<TranscriptionBatch>(BATCHES).updateOne({ _id: batch._id, owner: batch.owner, status: 'draft' }, { $unset: { reservationReleasePending: '' } });
    return true;
}

const repairableDrafts: Filter<TranscriptionBatch> = {
    status: 'draft', $or: [{ reservationUpdate: { $exists: true } }, { removing: true }, { reservationReleasePending: true }],
};

async function repairOwner(db: Db, owner: string) {
    for await (const batch of db.collection<TranscriptionBatch>(BATCHES).find({ ...repairableDrafts, owner })) {
        await completeReservation(db, batch);
    }
}

/** Called by cron before materialising jobs; reservations never require transactions. */
export async function repairTranscriptionBatchReservations(database?: Db) {
    const db = database || await integrationDb();
    const owners = await db.collection<TranscriptionBatch>(BATCHES).distinct('owner', repairableDrafts);
    for (const owner of owners) {
        try { await withOwnerLock(db, owner, () => repairOwner(db, owner)); }
        catch (error) { if (!(error instanceof ApiError && error.status === 409)) throw error; }
    }
}

export async function createTranscriptionImport(owner: string, database?: Db) {
    const db = database || await integrationDb();
    await actor(db, owner);
    const imported: TranscriptionImport = { _id: randomUUID(), owner, createdAt: new Date() };
    await db.collection<TranscriptionImport>(IMPORTS).insertOne(imported);
    return { importId: imported._id };
}

async function selectionFor(db: Db, owner: string, input: z.infer<typeof SelectionSchema>, current?: TranscriptionBatch): Promise<BatchSelection> {
    const user = await actor(db, owner);
    const recordings = await db.collection<Recording>(Collections.RECORDINGS).find({
        authSubject: owner, _id: { $in: input.recordingIds.map(id => new ObjectId(id)) },
        bulkImportId: { $type: 'string' }, transcriptionStatus: { $in: ['pending', 'failed'] },
        externalTranscriptionId: { $exists: false }, transcriptionAttemptId: { $exists: false },
        $or: [{ transcriptionBatchId: { $exists: false } }, ...(current ? [{ transcriptionBatchId: current._id }] : [])],
    }).toArray();
    if (recordings.length !== input.recordingIds.length) conflict('Some recordings are unavailable or already belong to a batch. Refresh and select again.');
    const dates = new Set(recordings.map(recording => recording.recordingDateKey ?? null));
    if (dates.size !== 1) invalid('Choose recordings from one recording date. Files without a recording date form a separate group.');
    const dateKey = [...dates][0];
    const [team, settings] = await Promise.all([getTeamSettings(db), db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).findOne({})]);
    const policy = providerPolicy(settings);
    const provider = team.enabled ? team.transcriptionProvider : input.provider || current?.provider || resolveTranscriptionProvider(user);
    selectedProvider(policy, provider);
    const companyModel = team.transcriptionModel || defaultModel(team.transcriptionProvider);
    if (team.enabled && (team.transcriptionMode === 'off' || (input.provider && input.provider !== provider) || (input.model && input.model !== companyModel))) {
        throw new ApiError(403, 'company_policy', 'Transcription settings are managed by your company administrator.');
    }
    if (!TranscriptionFactory.isProviderAvailable(provider)) invalid('Selected transcription provider is not configured.');
    const requestedModel = (team.enabled ? companyModel : input.model || (provider === current?.provider ? current.model : undefined) || (provider === resolveTranscriptionProvider(user) ? user.transcriptionSettings?.defaultModel : undefined)) || defaultModel(provider);
    const model = selectedProvider(policy, provider, requestedModel).model;
    if (!model) invalid('Choose a transcription model or configure the provider model before saving a batch.');
    return {
        recordingIds: recordings.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime() || b._id.toHexString().localeCompare(a._id.toHexString())).map(recording => recording._id.toHexString()),
        dateKey, name: input.name || current?.name || (dateKey ? `Recordings · ${dateKey}` : 'Recording date unavailable'),
        provider, model, totalDuration: recordings.reduce((sum, recording) => sum + recording.duration, 0),
    };
}

async function validateStart(db: Db, batch: TranscriptionBatch) {
    const user = await actor(db, batch.owner);
    const [team, settings, recordings, unsafe] = await Promise.all([
        getTeamSettings(db), db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).findOne({}),
        db.collection<Recording>(Collections.RECORDINGS).find({ authSubject: batch.owner, transcriptionBatchId: batch._id, _id: { $in: batch.recordingIds.map(id => new ObjectId(id)) } }, { projection: { fileSize: 1, duration: 1, transcriptionStatus: 1, transcriptionEnrichmentPending: 1 } }).toArray(),
        db.collection<BatchJob>(IntegrationCollections.jobs).countDocuments({ owner: batch.owner, batchId: batch._id, state: { $in: ['failed', 'needs_review'] } }),
    ]);
    const needsAudio = recordings.some(recording => recording.transcriptionStatus !== 'completed' && !recording.transcriptionEnrichmentPending);
    if (needsAudio && team.enabled && (team.transcriptionMode === 'off' || batch.provider !== team.transcriptionProvider || batch.model !== (team.transcriptionModel || defaultModel(team.transcriptionProvider)))) {
        throw new ApiError(403, 'company_policy', 'This batch no longer matches company transcription settings. Edit its provider and model before starting.');
    }
    if (needsAudio && !TranscriptionFactory.isProviderAvailable(batch.provider)) invalid('Selected transcription provider is not configured.');
    if (recordings.length !== batch.recordingIds.length) conflict('Some recordings in this batch are unavailable.');
    if (unsafe && batch.status !== 'needs_review') conflict('Review the failed recordings before resuming this batch.');
    const policy = providerPolicy(settings);
    const multiplier = needsAudio ? selectedProvider(policy, batch.provider, batch.model).multiplier : 1;
    let billable = 0;
    for (const recording of recordings) {
        if (recording.transcriptionStatus !== 'completed' && !recording.transcriptionEnrichmentPending) {
            if (!isTranscriptionFileSizeAllowed(recording.fileSize)) invalid(buildTranscriptionFileSizeError(recording.fileSize));
            if (billingEnabled() && !isKnownAudioDuration(recording.duration)) invalid('A recording duration could not be verified. Re-upload a supported audio file before starting managed transcription.');
            if (policy.mode === 'managed') {
                try { assertManagedTranscriptionLimits(batch.provider, batch.model, recording.duration, recording.fileSize); }
                catch (error) { invalid(error instanceof Error ? error.message : 'This recording is outside managed provider limits.'); }
            }
            billable += Math.ceil(calculateBilledDuration(recording.duration) * multiplier);
        }
    }
    const access = checkTranscriptionAccess(user, billable);
    if (!access.allowed) throw new ApiError(403, 'quota_exceeded', access.reason || 'Transcription limit exceeded.');
}

export async function createTranscriptionBatch(owner: string, body: unknown, database?: Db): Promise<BatchResponse> {
    const parsed = SelectionSchema.safeParse(body);
    if (!parsed.success) invalid(parsed.error.issues[0]?.message || 'Invalid batch selection.');
    const db = database || await integrationDb();
    return withOwnerLock(db, owner, async () => {
        await repairOwner(db, owner);
        const selection = await selectionFor(db, owner, parsed.data);
        const now = new Date();
        const batch: TranscriptionBatch = { ...selection, _id: new ObjectId().toHexString(), owner, recordingIds: [], status: 'draft', createdAt: now, updatedAt: now, reservationUpdate: selection };
        await db.collection<TranscriptionBatch>(BATCHES).insertOne(batch);
        if (!await completeReservation(db, batch)) conflict('Some recordings were reserved by another batch. Refresh and try again.');
        return batchResponse(db, { ...batch, ...selection });
    });
}

export async function updateTranscriptionBatch(owner: string, id: string, body: unknown, database?: Db): Promise<{ batch?: BatchResponse; success?: boolean }> {
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success || !/^[a-f\d]{24}$/i.test(id)) invalid(parsed.success ? 'Invalid batch ID.' : parsed.error.issues[0]?.message || 'Invalid batch action.');
    const input = parsed.data;
    const db = database || await integrationDb();
    return withOwnerLock(db, owner, async () => {
        await actor(db, owner);
        await repairOwner(db, owner);
        const batches = db.collection<TranscriptionBatch>(BATCHES);
        let batch = await batches.findOne({ _id: id, owner });
        if (!batch) throw new ApiError(404, 'not_found', 'Batch not found.');
        if (input.action === 'remove') {
            if (batch.status !== 'draft') conflict('Only an unstarted batch can be removed.');
            await batches.updateOne({ _id: id, owner, status: 'draft' }, { $set: { removing: true } });
            await completeReservation(db, { ...batch, removing: true });
            return { success: true };
        }
        if (input.action === 'edit') {
            if (batch.status !== 'draft') conflict('Batch membership is frozen after processing starts.');
            const selection = await selectionFor(db, owner, { recordingIds: input.recordingIds || batch.recordingIds, name: input.name, provider: input.provider, model: input.model }, batch);
            await batches.updateOne({ _id: id, owner, status: 'draft' }, { $set: { reservationUpdate: selection, updatedAt: new Date() } });
            if (!await completeReservation(db, { ...batch, reservationUpdate: selection })) conflict('Some recordings are unavailable. Refresh and select again.');
        } else if (input.action === 'pause') {
            if (!['running', 'paused'].includes(batch.status)) conflict('Only a running batch can be paused.');
            await batches.updateOne({ _id: id, owner, status: 'running' }, { $set: { status: 'paused', updatedAt: new Date() } });
        } else if (input.action === 'retry') {
            if (batch.status === 'running') return { batch: await batchResponse(db, batch) };
            if (batch.status !== 'needs_review') conflict('This batch has no failed work awaiting review.');
            if (!input.recordingIds) invalid('Select all unfinished recordings to retry.');
            const failures = await db.collection<BatchJob>(IntegrationCollections.jobs).find({ owner, batchId: id,
                state: { $in: ['failed', 'needs_review'] } }).toArray();
            if (failures.some(job => job.processingStatus && ['contact_admin', 'none'].includes(job.processingStatus.retryAction || ''))) {
                conflict('An unfinished processing result needs administrator review before it can resume.');
            }
            if (failures.some(job => job.processingStatus?.providerOutcome === 'unknown'
                || !job.processingStatus && job.state === 'needs_review') && !input.acknowledgeProviderOutcome) {
                invalid('Acknowledge the uncertain provider outcome before retrying.');
            }
            await validateStart(db, batch);
            const { resetBatchJobsForRetry } = await import('@/lib/integrations/jobs');
            await resetBatchJobsForRetry(owner, id, input.recordingIds, db);
            await batches.updateOne({ _id: id, owner, status: 'needs_review' }, { $set: { status: 'running', updatedAt: new Date() }, $unset: { error: '' } });
        } else {
            if (batch.status === 'completed') return { batch: await batchResponse(db, batch) };
            const allowed = input.action === 'start' ? ['draft', 'running'] : ['paused', 'running'];
            if (!allowed.includes(batch.status)) conflict(input.action === 'start' ? 'Only a saved batch can be started.' : 'Only a paused batch can be resumed.');
            if (batch.status !== 'running') {
                await validateStart(db, batch);
                await batches.updateOne({ _id: id, owner, status: batch.status }, { $set: { status: 'running', updatedAt: new Date() }, $unset: { error: '' } });
            }
        }
        batch = await batches.findOne({ _id: id, owner });
        if (!batch) throw new ApiError(404, 'not_found', 'Batch not found.');
        return { batch: await batchResponse(db, batch) };
    });
}

function encodeCursor(value: object) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function decodeCursor(value: string | null | undefined): Record<string, unknown> | null {
    if (!value) return null;
    try {
        if (value.length > 600) throw new Error();
        const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        return parsed as Record<string, unknown>;
    } catch { invalid('Invalid workspace page cursor.'); }
}

export async function listTranscriptionWorkspace(owner: string, options: { waitingAfter?: string | null; batchesAfter?: string | null } = {}, database?: Db): Promise<TranscriptionWorkspace> {
    const db = database || await integrationDb();
    await actor(db, owner);
    await withOwnerLock(db, owner, () => repairOwner(db, owner));
    const skipWaiting = options.waitingAfter === 'end';
    const skipBatches = options.batchesAfter === 'end';
    const waitingCursor = skipWaiting ? null : decodeCursor(options.waitingAfter);
    const batchesCursor = skipBatches ? null : decodeCursor(options.batchesAfter);
    const waitingBase = waitingFilter(owner);
    const waitingQuery: Filter<Recording> = { ...waitingBase };
    if (waitingCursor) {
        const { key, date, id } = waitingCursor;
        if ((key !== null && typeof key !== 'string') || typeof date !== 'string' || !Number.isFinite(new Date(date).getTime()) || typeof id !== 'string' || !ObjectId.isValid(id)) invalid('Invalid waiting recordings cursor.');
        const sameDate = { recordingDateKey: key as string | null };
        waitingQuery.$or = [
            ...(key !== null ? [{ recordingDateKey: null }, { recordingDateKey: { $lt: key as string } }] : []),
            { ...sameDate, recordedAt: { $lt: new Date(date) } },
            { ...sameDate, recordedAt: new Date(date), _id: { $lt: new ObjectId(id) } },
        ];
    }
    const batchesQuery: Filter<TranscriptionBatch> = { owner, removing: { $ne: true }, reservationUpdate: { $exists: false } };
    if (batchesCursor) {
        const { date, id } = batchesCursor;
        if (typeof date !== 'string' || !Number.isFinite(new Date(date).getTime()) || typeof id !== 'string' || !ObjectId.isValid(id)) invalid('Invalid batches cursor.');
        batchesQuery.$or = [{ createdAt: { $lt: new Date(date) } }, { createdAt: new Date(date), _id: { $lt: id } }];
    }
    const [waiting, batches, waitingTotal, batchesTotal, team, settings] = await Promise.all([
        skipWaiting ? Promise.resolve([] as Recording[]) : db.collection<Recording>(Collections.RECORDINGS).find(waitingQuery, { projection: RECORDING_METADATA_PROJECTION }).sort({ recordingDateKey: -1, recordedAt: -1, _id: -1 }).limit(WAITING_PAGE_SIZE + 1).toArray(),
        skipBatches ? Promise.resolve([] as TranscriptionBatch[]) : db.collection<TranscriptionBatch>(BATCHES).find(batchesQuery).sort({ createdAt: -1, _id: -1 }).limit(BATCH_PAGE_SIZE + 1).toArray(),
        db.collection<Recording>(Collections.RECORDINGS).countDocuments(waitingBase),
        db.collection<TranscriptionBatch>(BATCHES).countDocuments({ owner, removing: { $ne: true }, reservationUpdate: { $exists: false } }),
        getTeamSettings(db), db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).findOne({}),
    ]);
    const pageWaiting = waiting.slice(0, WAITING_PAGE_SIZE);
    const pageBatches = batches.slice(0, BATCH_PAGE_SIZE);
    const lastWaiting = pageWaiting.at(-1);
    const lastBatch = pageBatches.at(-1);
    const policy = providerPolicy(settings);
    return {
        waiting: pageWaiting.map(metadata), batches: await Promise.all(pageBatches.map(batch => batchResponse(db, batch))),
        providers: TranscriptionFactory.getAvailableProviders()
            .filter(provider => policy.multipliers[provider.id] !== undefined && (!team.enabled || (team.transcriptionMode !== 'off' && provider.id === team.transcriptionProvider)))
            .map(provider => ({ id: provider.id, name: provider.name, description: provider.description, multiplier: effectiveTranscriptionProvider(policy, provider.id).multiplier })),
        waitingNextCursor: waiting.length > WAITING_PAGE_SIZE && lastWaiting ? encodeCursor({ key: lastWaiting.recordingDateKey ?? null, date: lastWaiting.recordedAt.toISOString(), id: lastWaiting._id.toHexString() }) : null,
        batchesNextCursor: batches.length > BATCH_PAGE_SIZE && lastBatch ? encodeCursor({ date: lastBatch.createdAt.toISOString(), id: lastBatch._id }) : null,
        waitingTotal, batchesTotal,
    };
}
