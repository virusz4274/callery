import { ObjectId } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { UpdateRecordingInput, Recording } from '@/lib/db/types';
import type { TranscriptionExecution } from './manual';

/** Fence late provider responses and checkpoints after another attempt took over. */
export async function updateTranscriptionAttempt(owner: string, id: string, execution: TranscriptionExecution, patch: UpdateRecordingInput) {
    const db = await getMongoDb();
    if (!await db.collection<{ _id: string; jobId?: string; attemptId?: string }>('transcription_dispatch').findOne({
        _id: 'transcription', jobId: execution.jobId, attemptId: execution.attemptId,
    })) throw new Error('This transcription attempt is no longer active.');
    const result = await db.collection(Collections.RECORDINGS).updateOne({
        _id: new ObjectId(id), authSubject: owner,
        transcriptionJobId: execution.jobId, transcriptionAttemptId: execution.attemptId,
    }, { $set: { ...patch, updatedAt: new Date() } });
    if (!result.matchedCount) throw new Error('A newer transcription attempt owns this recording.');
}

/** One recording CAS includes payload and checkpoint. Concurrent/old responses
 * cannot overwrite a new transcript or issue the same planned call twice. */
export async function updateEnrichmentCheckpoint(owner: string, id: string, previous: Pick<Recording, 'aiWorkRevision' | 'fullTranscript' | 'transcriptionResultAttemptId'>,
    patch: UpdateRecordingInput, execution?: TranscriptionExecution): Promise<number> {
    const db = await getMongoDb();
    if (execution && !await db.collection<{ _id: string; jobId?: string; attemptId?: string }>('transcription_dispatch').findOne({
        _id: 'transcription', jobId: execution.jobId, attemptId: execution.attemptId,
    })) throw new Error('This transcription attempt is no longer active.');
    const result = await db.collection<Recording>(Collections.RECORDINGS).updateOne({
        _id: new ObjectId(id), authSubject: owner,
        ...(execution ? { transcriptionJobId: execution.jobId, transcriptionAttemptId: execution.attemptId } : {}),
        ...(previous.aiWorkRevision === undefined ? { aiWorkRevision: { $exists: false } } : { aiWorkRevision: previous.aiWorkRevision }),
        fullTranscript: previous.fullTranscript,
        ...(previous.transcriptionResultAttemptId ? { transcriptionResultAttemptId: previous.transcriptionResultAttemptId } : {}),
    }, { $set: { ...patch, updatedAt: new Date() }, $inc: { aiWorkRevision: 1 } });
    if (!result.matchedCount) throw new Error('A newer processing checkpoint or transcript owns this recording. Reload before continuing.');
    return (previous.aiWorkRevision || 0) + 1;
}

/** A pre-dispatch callback can finish only its original provider correlation. */
export async function updateLegacyTranscriptionResult(owner: string, id: string,
    previous: Pick<Recording, 'externalTranscriptionId' | 'transcriptionResultAttemptId'>, patch: UpdateRecordingInput) {
    const db = await getMongoDb();
    const result = await db.collection<Recording>(Collections.RECORDINGS).updateOne({
        _id: new ObjectId(id), authSubject: owner, transcriptionAttemptId: { $exists: false },
        ...(previous.externalTranscriptionId ? { externalTranscriptionId: previous.externalTranscriptionId } : { externalTranscriptionId: { $exists: false } }),
        ...(previous.transcriptionResultAttemptId ? { transcriptionResultAttemptId: previous.transcriptionResultAttemptId } : { transcriptionResultAttemptId: { $exists: false } }),
    }, { $set: { ...patch, updatedAt: new Date() } });
    if (!result.matchedCount) throw new Error('A newer transcription attempt owns this recording.');
}

/** Accept an authenticated late provider response without acquiring a paid-work slot.
 * The queue reacquires that slot before enrichment; no ASR is submitted here. */
export async function updateDeferredTranscriptionResult(owner: string, id: string, previous: Pick<Recording, 'externalTranscriptionId' | 'transcriptionResultAttemptId'>,
    execution: TranscriptionExecution, patch: UpdateRecordingInput) {
    const db = await getMongoDb();
    const result = await db.collection<Recording>(Collections.RECORDINGS).updateOne({
        _id: new ObjectId(id), authSubject: owner, transcriptionJobId: execution.jobId, transcriptionAttemptId: execution.attemptId,
        ...(previous.externalTranscriptionId ? { externalTranscriptionId: previous.externalTranscriptionId } : { externalTranscriptionId: { $exists: false } }),
        ...(previous.transcriptionResultAttemptId ? { transcriptionResultAttemptId: previous.transcriptionResultAttemptId } : { transcriptionResultAttemptId: { $exists: false } }),
    }, { $set: { ...patch, updatedAt: new Date() } });
    if (!result.matchedCount) throw new Error('A newer transcription attempt owns this recording.');
}
