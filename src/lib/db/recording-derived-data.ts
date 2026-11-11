import { ObjectId, type Db } from 'mongodb';
import { Collections } from '@/lib/mongodb';

/** Fence enrichment before erasing derived content, retaining the recording if cleanup fails. */
export async function removeRecordingDerivedData(recordingIds: string[], owner: string | undefined, db: Db): Promise<void> {
    if (!recordingIds.length) return;
    const ids = recordingIds.map(id => new ObjectId(id));
    await db.collection(Collections.RECORDINGS).updateMany({ _id: { $in: ids }, ...(owner ? { authSubject: owner } : {}) }, {
        $unset: { searchIndex: '' }, $inc: { aiWorkRevision: 1 },
    });
    await db.collection('recording_passages').deleteMany({ recordingId: { $in: recordingIds }, ...(owner ? { owner } : {}) });
    await db.collection('recording_shares').deleteMany({ recordingId: { $in: ids }, ...(owner ? { owner } : {}) });
}

export async function removeAccountDerivedData(owner: string, db: Db): Promise<void> {
    await db.collection(Collections.RECORDINGS).updateMany({ authSubject: owner }, { $unset: { searchIndex: '' }, $inc: { aiWorkRevision: 1 } });
    await db.collection('recording_passages').deleteMany({ owner });
    await db.collection('recording_shares').deleteMany({ owner });
}
