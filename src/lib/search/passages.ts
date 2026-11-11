import { createHash } from 'node:crypto';
import { ObjectId, type Db } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { Recording } from '@/lib/db/types';
import type { AiCallCheckpoint, AiPlannedCall } from '@/lib/transcription/ai-work-plan';
import type { AiUsage } from '@/services/ai/types';
import type { InitializationIndexGroup } from '@/lib/db/index-definitions';
import type { EmbeddingProfile, TranscriptPassage } from './types';

export const PASSAGES_COLLECTION = 'recording_passages';
export const PASSAGE_VECTOR_INDEX = 'recording_passages_vector_search';
export const SEARCH_INDEX_GROUPS: InitializationIndexGroup[] = [{ collection: PASSAGES_COLLECTION, indexes: [
    { key: { owner: 1, recordingId: 1, generation: 1, ordinal: 1 }, unique: true, name: 'passage_identity' },
    { key: { owner: 1, profileId: 1, recordedAt: -1 }, name: 'passage_owner_profile' },
    { key: { recordingId: 1, generation: 1 }, name: 'passage_generation' },
] }];

export interface RecordingPassage extends TranscriptPassage {
    _id: string;
    owner: string;
    recordingId: string;
    generation: string;
    transcriptRevision: string;
    profileId: string;
    profile: EmbeddingProfile;
    contactId: string | null;
    recordedAt: Date;
    isArchived: boolean;
    published: boolean;
    vector?: number[];
    attempt?: { requestHash: string; reservationId: string; attempts: number };
    response?: { requestHash: string; reservationId: string; attempts: number; usage?: AiUsage };
}

export function passageId(owner: string, recordingId: string, generation: string, ordinal: number): string {
    return createHash('sha256').update(JSON.stringify([owner, recordingId, generation, ordinal])).digest('hex');
}

/** Only preparation may insert rows; provider completion always updates an existing row. */
export async function preparePassageRows(owner: string, recordingId: string,
    generation: string, revision: string, profile: EmbeddingProfile, passages: TranscriptPassage[], database?: Db): Promise<void> {
    const db = database ?? await getMongoDb();
    const current = await db.collection<Recording>(Collections.RECORDINGS).findOne({ _id: new ObjectId(recordingId), authSubject: owner,
        'searchIndex.generation': generation, 'searchIndex.transcriptRevision': revision });
    if (!current) throw new Error('The recording changed before search indexing.');
    if (passages.length) await db.collection<RecordingPassage>(PASSAGES_COLLECTION).bulkWrite(passages.map(passage => ({ updateOne: {
        filter: { _id: passageId(owner, recordingId, generation, passage.ordinal) },
        update: { $setOnInsert: { ...passage, owner, recordingId, generation, transcriptRevision: revision, profileId: profile.id,
            profile, published: false, contactId: current.contactId?.toString() ?? null, recordedAt: current.recordedAt, isArchived: Boolean(current.isArchived) } }, upsert: true,
    } })), { ordered: true });
    if (!await db.collection<Recording>(Collections.RECORDINGS).findOne({ _id: new ObjectId(recordingId), authSubject: owner,
        'searchIndex.generation': generation, 'searchIndex.transcriptRevision': revision })) {
        await db.collection<RecordingPassage>(PASSAGES_COLLECTION).deleteMany({ owner, recordingId, generation });
        throw new Error('The recording changed during search preparation.');
    }
    await syncGenerationMetadata(owner, recordingId, generation, db);
}

function passageMetadata(recording: Pick<Recording, 'contactId' | 'recordedAt' | 'isArchived'>) {
    return { contactId: recording.contactId?.toString() ?? null, recordedAt: recording.recordedAt, isArchived: Boolean(recording.isArchived) };
}
/** A recording write can occur between the metadata read and passage write.
 * Recheck and repair that interleaving before making the generation searchable. */
async function syncGenerationMetadata(owner: string, recordingId: string, generation: string, db: Db): Promise<void> {
    const filter = { _id: new ObjectId(recordingId), authSubject: owner, 'searchIndex.generation': generation };
    for (let attempt = 0; attempt < 3; attempt++) {
        const before = await db.collection<Recording>(Collections.RECORDINGS).findOne(filter);
        if (!before) throw new Error('The recording changed during passage metadata publication.');
        const metadata = passageMetadata(before);
        await db.collection<RecordingPassage>(PASSAGES_COLLECTION).updateMany({ owner, recordingId, generation }, { $set: metadata });
        const after = await db.collection<Recording>(Collections.RECORDINGS).findOne(filter);
        if (!after) throw new Error('The recording changed during passage metadata publication.');
        if (JSON.stringify(metadata) === JSON.stringify(passageMetadata(after))) return;
    }
    throw new Error('Recording metadata changed repeatedly. Resume search indexing.');
}

export async function publishPassageGeneration(owner: string, recordingId: string, generation: string, expectedCount: number): Promise<void> {
    const db = await getMongoDb(), rows = db.collection<RecordingPassage>(PASSAGES_COLLECTION);
    await syncGenerationMetadata(owner, recordingId, generation, db);
    const filter = { owner, recordingId, generation, vector: { $exists: true }, response: { $exists: true } };
    if (await rows.countDocuments(filter) !== expectedCount) throw new Error('Search generation has unfinished passage responses.');
    const result = await rows.updateMany(filter, { $set: { published: true } });
    if (result.matchedCount !== expectedCount) throw new Error('Search generation changed during publication.');
    await syncGenerationMetadata(owner, recordingId, generation, db);
}

export async function savedPassageResponse(id: string, owner: string, request: AiPlannedCall, checkpoint: AiCallCheckpoint): Promise<RecordingPassage | null> {
    const row = await (await getMongoDb()).collection<RecordingPassage>(PASSAGES_COLLECTION).findOne({ _id: id, owner,
        'response.requestHash': requestHash(request), 'response.reservationId': checkpoint.reservationId, 'response.attempts': checkpoint.attempts });
    return row?.vector ? row : null;
}
export function requestHash(request: AiPlannedCall): string {
    return createHash('sha256').update(JSON.stringify(request)).digest('hex');
}
export async function claimPassageAttempt(id: string, owner: string, request: AiPlannedCall, checkpoint: AiCallCheckpoint): Promise<void> {
    const result = await (await getMongoDb()).collection<RecordingPassage>(PASSAGES_COLLECTION).updateOne({ _id: id, owner,
        $or: [{ attempt: { $exists: false } }, { 'attempt.attempts': { $lt: checkpoint.attempts } },
            { 'attempt.reservationId': checkpoint.reservationId, 'attempt.requestHash': requestHash(request) }],
    }, { $set: { attempt: { requestHash: requestHash(request), reservationId: checkpoint.reservationId, attempts: checkpoint.attempts } } });
    if (!result.matchedCount) throw new Error('A newer attempt or deletion owns this search passage.');
}
export async function savePassageResponse(id: string, owner: string, request: AiPlannedCall,
    checkpoint: AiCallCheckpoint, vector: number[], usage?: AiUsage): Promise<void> {
    const result = await (await getMongoDb()).collection<RecordingPassage>(PASSAGES_COLLECTION).updateOne({ _id: id, owner,
        'attempt.reservationId': checkpoint.reservationId, 'attempt.attempts': checkpoint.attempts, 'attempt.requestHash': requestHash(request) }, {
        $set: { vector, response: { requestHash: requestHash(request), reservationId: checkpoint.reservationId, attempts: checkpoint.attempts, usage } },
    });
    if (!result.matchedCount) throw new Error('The passage was deleted before its embedding response could be saved.');
}

export async function removeRecordingPassages(recordingIds: string[], owner?: string, database?: Db): Promise<void> {
    if (!recordingIds.length) return;
    await (database ?? await getMongoDb()).collection(PASSAGES_COLLECTION).deleteMany({ recordingId: { $in: recordingIds }, ...(owner ? { owner } : {}) });
}
/** The caller supplies a previously observed generation, never a broad not-current filter. */
export async function removePassageGeneration(owner: string, recordingId: string, generation: string, database?: Db): Promise<void> {
    await (database ?? await getMongoDb()).collection(PASSAGES_COLLECTION).deleteMany({ owner, recordingId, generation });
}
export async function removeAccountPassages(owner: string, database?: Db): Promise<void> {
    await (database ?? await getMongoDb()).collection(PASSAGES_COLLECTION).deleteMany({ owner });
}
/** Called from centralized metadata/contact reconciliation writes. Authorization still rechecks recordings on retrieval. */
export async function syncRecordingPassageMetadata(recording: Pick<Recording, '_id' | 'authSubject' | 'contactId' | 'recordedAt' | 'isArchived'>, database?: Db): Promise<void> {
    await (database ?? await getMongoDb()).collection(PASSAGES_COLLECTION).updateMany({ owner: recording.authSubject, recordingId: recording._id.toString() }, {
        $set: passageMetadata(recording),
    });
}
