import 'server-only';
import { ObjectId, type Db } from 'mongodb';
import { Collections, getMongoDb } from './mongodb';
import type { Recording, User } from './db/types';
import { getConfiguredPublicAppOrigin } from './public-url';
import { getTeamSettings } from './team-policy';
import { createRecordingShareService, type RecordingShare } from './recording-share-service';
import { RECORDING_SHARES } from './recording-share-indexes';

export { RECORDING_SHARES, SHARING_INDEX_GROUPS } from './recording-share-indexes';

export const recordingShares = createRecordingShareService({
    now: () => new Date(),
    publicOrigin: getConfiguredPublicAppOrigin,
    teamEnabled: async () => (await getTeamSettings()).enabled,
    ownerActive: async owner => {
        const user = await (await getMongoDb()).collection<User>(Collections.USERS).findOne({ authSubject: owner });
        return Boolean(user && !user.disabled && !user.softDelete?.isDeleted && !user.teamInvitationPending);
    },
    recording: async (owner, id) => (await getMongoDb()).collection<Recording>(Collections.RECORDINGS)
        .findOne({ _id: new ObjectId(id), authSubject: owner }),
    grant: async id => (await getMongoDb()).collection<RecordingShare>(RECORDING_SHARES).findOne({ _id: new ObjectId(id) }),
    insert: async grant => { await (await getMongoDb()).collection<RecordingShare>(RECORDING_SHARES).insertOne(grant); },
    list: async (owner, recordingId) => (await getMongoDb()).collection<RecordingShare>(RECORDING_SHARES)
        .find({ owner, recordingId: new ObjectId(recordingId) }).sort({ createdAt: -1, _id: -1 }).toArray(),
    revoke: async (id, owner, revokedAt) => { await (await getMongoDb()).collection<RecordingShare>(RECORDING_SHARES)
        .updateOne({ _id: new ObjectId(id), owner, revokedAt: { $exists: false } }, { $set: { revokedAt } }); },
});

export async function deleteRecordingShares(recordingIds: string[], owner?: string, database?: Db): Promise<void> {
    if (!recordingIds.length) return;
    await (database || await getMongoDb()).collection<RecordingShare>(RECORDING_SHARES).deleteMany({
        recordingId: { $in: recordingIds.map(id => new ObjectId(id)) }, ...(owner ? { owner } : {}),
    });
}

export async function deleteOwnerShares(owner: string, database?: Db): Promise<void> {
    await (database || await getMongoDb()).collection<RecordingShare>(RECORDING_SHARES).deleteMany({ owner });
}
