import { randomUUID } from 'node:crypto';
import { ObjectId, MongoServerError, type Db } from 'mongodb';
import { Collections } from '@/lib/mongodb';
import type { Recording, User } from '@/lib/db/types';
import { startManualTranscription, type ManualTranscriptionOptions } from '@/lib/transcription/manual';
import { startAutoTranscriptionForRecording } from '@/app/actions/upload/transcription';
import { IntegrationCollections, integrationDb } from './database';
import { ApiError, fingerprint } from './contracts';

interface IngestionJob { _id: string; owner: string; recordingId: string; options: ManualTranscriptionOptions; automatic: boolean; state: 'pending' | 'running' | 'submitted' | 'failed'; createdAt: Date; leaseUntil: Date; leaseOwner?: string; error?: string }
export async function enqueueTranscription(owner: string, recordingId: string, options: ManualTranscriptionOptions, id: string, automatic = false, database?: Db) {
    const db = database || await integrationDb();
    const jobs = db.collection<IngestionJob>(IntegrationCollections.jobs);
    let job: IngestionJob | null;
    try {
        job = await jobs.findOneAndUpdate({ _id: id }, { $setOnInsert: { owner, recordingId, options, automatic, state: 'pending', createdAt: new Date(), leaseUntil: new Date(0) } }, { upsert: true, returnDocument: 'after' });
    } catch (error) {
        if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
        job = await jobs.findOne({ _id: id });
    }
    if (!job || job.owner !== owner || job.recordingId !== recordingId || job.automatic !== automatic || fingerprint(job.options) !== fingerprint(options)) throw new ApiError(409, 'transcription_conflict', 'A transcription with different options is already queued.');
    return { jobId: id, recordingId, state: 'queued' };
}
export async function requestTranscription(owner: string, recording: Recording, options: ManualTranscriptionOptions) {
    if (recording.transcriptionStatus === 'processing' || recording.transcriptionStatus === 'completed') throw new ApiError(409, 'transcription_conflict', 'Recording is processing or already transcribed.');
    const db = await integrationDb();
    const validation = await startManualTranscription(owner, recording._id.toString(), options, false, true);
    if (validation.error) throw new ApiError(403, 'transcription_blocked', validation.error);
    // One pending job per recording. Failed explicit jobs can be requested again.
    const id = `manual:${recording._id}`;
    const existing = await db.collection<IngestionJob>(IntegrationCollections.jobs).findOne({ _id: id, state: { $in: ['pending', 'running'] } });
    if (existing) {
        if (fingerprint(existing.options) !== fingerprint(options)) throw new ApiError(409, 'transcription_conflict', 'A transcription with different options is already queued.');
        return { jobId: id, recordingId: recording._id.toString(), state: 'queued' };
    }
    await db.collection<IngestionJob>(IntegrationCollections.jobs).deleteOne({ _id: id, state: { $in: ['failed', 'submitted'] } });
    return enqueueTranscription(owner, recording._id.toString(), options, id);
}
export async function processTranscriptionJobs(limit = 5, database?: Db) {
    const db = database || await integrationDb(); const jobs = db.collection<IngestionJob>(IntegrationCollections.jobs);
    // An expired running lease means execution may have reached a provider. Do
    // not silently resubmit it and risk a second provider charge.
    const stale = await jobs.find({ state: 'running', leaseUntil: { $lte: new Date() } }).limit(limit).toArray();
    for (const job of stale) {
        const recording = await db.collection<Recording>(Collections.RECORDINGS).findOne({ _id: new ObjectId(job.recordingId), authSubject: job.owner });
        const known = recording?.externalTranscriptionId || recording?.transcriptionStatus === 'completed';
        await jobs.updateOne({ _id: job._id, state: 'running', leaseUntil: { $lte: new Date() } }, { $set: { state: known ? 'submitted' : 'failed', error: known ? 'Provider submission recovered.' : 'Provider outcome uncertain. Review before explicitly retrying.' } });
        if (!known && recording?.transcriptionStatus === 'processing') await db.collection<Recording>(Collections.RECORDINGS).updateOne({ _id: recording._id, transcriptionStatus: 'processing', externalTranscriptionId: { $exists: false } }, { $set: { transcriptionStatus: 'failed', updatedAt: new Date() } });
    }
    let processed = 0; const deadline = Date.now() + 270_000;
    for (let index = 0; index < limit; index++) {
        if (Date.now() >= deadline) break;
        const lease = randomUUID();
        const job = await jobs.findOneAndUpdate({ state: 'pending' }, { $set: { state: 'running', leaseOwner: lease, leaseUntil: new Date(Date.now() + 10 * 60_000) } }, { sort: { createdAt: 1 }, returnDocument: 'after' });
        if (!job) break;
        const heartbeat = setInterval(() => { void jobs.updateOne({ _id: job._id, leaseOwner: lease }, { $set: { leaseUntil: new Date(Date.now() + 10 * 60_000) } }).catch(() => {}); }, 30_000); heartbeat.unref();
        try {
            const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: job.owner });
            if (!user || user.disabled || user.softDelete?.isDeleted || user.teamInvitationPending) throw new ApiError(403, 'account_unavailable', 'Account unavailable.');
            const recording = await db.collection<Recording>(Collections.RECORDINGS).findOne({ _id: new ObjectId(job.recordingId), authSubject: job.owner });
            if (!recording) throw new ApiError(404, 'not_found', 'Recording unavailable.');
            if (recording.transcriptionStatus === 'completed' || recording.transcriptionStatus === 'processing') {
                await jobs.updateOne({ _id: job._id, leaseOwner: lease }, { $set: { state: 'submitted', leaseUntil: new Date(0) }, $unset: { leaseOwner: '' } });
                continue;
            }
            if (job.automatic) await startAutoTranscriptionForRecording(job.owner, job.recordingId);
            else {
                const result = await startManualTranscription(job.owner, job.recordingId, job.options, true);
                if (result.error) throw new ApiError(400, 'transcription_failed', result.error);
            }
            await jobs.updateOne({ _id: job._id, leaseOwner: lease }, { $set: { state: 'submitted', leaseUntil: new Date(0) }, $unset: { leaseOwner: '' } });
        } catch {
            await jobs.updateOne({ _id: job._id, leaseOwner: lease }, { $set: { state: 'failed', error: 'Transcription failed or was blocked by current account/company policy.', leaseUntil: new Date(0) }, $unset: { leaseOwner: '' } });
        } finally { clearInterval(heartbeat); }
        processed++;
    }
    return processed;
}

export async function recordingJobStatus(owner: string, recordingId: string) {
    const job = await (await integrationDb()).collection<IngestionJob>(IntegrationCollections.jobs).findOne({ owner, recordingId }, { sort: { createdAt: -1 } });
    return job ? { state: job.state, error: job.error ?? null } : null;
}
