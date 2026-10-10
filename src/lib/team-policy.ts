import { ObjectId, type Db } from 'mongodb';
import { Collections, getMongoDb } from './mongodb';
import { getSystemSettings, findUserByAuthSubject } from './db/users';
import { getRecordingById } from './db/recordings';
import { hydrateRecordingContacts } from './db/recordings/hydrate-contacts';
import type { Recording, User } from './db/types';
import { DEFAULT_TEAM_SETTINGS, canAccessTeamRecording, canDeleteTeamRecording, type TeamSettings } from './team-config';

export async function getTeamSettings(db?: Db): Promise<TeamSettings> {
    const settings = db ? await db.collection(Collections.SYSTEM_SETTINGS).findOne({}) : await getSystemSettings();
    return { ...DEFAULT_TEAM_SETTINGS, ...settings?.team };
}

/** Caller identity must come from the authenticated session, never an input field. */
export async function getRecordingForActor(id: string, actorSubject: string): Promise<Recording | null> {
    if (!ObjectId.isValid(id)) return null;
    const [team, actor] = await Promise.all([getTeamSettings(), findUserByAuthSubject(actorSubject)]);
    if (!actor || actor.disabled || actor.softDelete?.isDeleted || actor.teamInvitationPending) return null;
    if (!team.enabled || actor.role !== 'admin') return getRecordingById(id, actorSubject);
    const db = await getMongoDb();
    const recording = await db.collection<Recording>(Collections.RECORDINGS).findOne({ _id: new ObjectId(id) });
    if (!recording || !canAccessTeamRecording(team, actor.role, actorSubject, recording.authSubject)) return null;
    return (await hydrateRecordingContacts(recording.authSubject, [recording]))[0];
}

export async function assertRecordingDeletionAllowed(actorSubject: string): Promise<void> {
    const [team, actor] = await Promise.all([getTeamSettings(), findUserByAuthSubject(actorSubject)]);
    if (!actor || actor.disabled || actor.softDelete?.isDeleted || actor.teamInvitationPending) throw new Error('Unauthorized');
    if (!canDeleteTeamRecording(team, actor.role)) throw new Error('Only the company administrator can delete backed-up recordings.');
}

export async function resolveExportSubject(actorSubject: string, targetUserId?: string): Promise<string> {
    const actor = await findUserByAuthSubject(actorSubject);
    if (!actor || actor.disabled || actor.softDelete?.isDeleted || actor.teamInvitationPending) throw new Error('Unauthorized');
    if (!targetUserId) return actorSubject;
    const team = await getTeamSettings();
    if (!team.enabled || actor.role !== 'admin') throw new Error('Unauthorized');
    if (!ObjectId.isValid(targetUserId)) throw new Error('Invalid employee');
    const db = await getMongoDb();
    const target = await db.collection<User>(Collections.USERS).findOne({ _id: new ObjectId(targetUserId) });
    if (!target) throw new Error('Employee not found');
    return target.authSubject;
}

export async function playbackUrlLifetime(): Promise<number> {
    return (await getTeamSettings()).enabled ? 300 : 3600;
}

/** Serialise access changes and activation on standalone MongoDB, without transactions. */
export async function withTeamAccessLock<T>(work: () => Promise<T>, database?: Db): Promise<T> {
    const db = database || await getMongoDb();
    // An uninitialised personal database cannot activate team mode.
    if (!await db.collection(Collections.SYSTEM_SETTINGS).findOne({})) return work();
    const token = new ObjectId().toString();
    const now = new Date();
    const locked = await db.collection(Collections.SYSTEM_SETTINGS).findOneAndUpdate({
        $or: [{ teamAccessLock: { $exists: false } }, { 'teamAccessLock.until': { $lte: now } }],
    }, { $set: { teamAccessLock: { token, until: new Date(now.getTime() + 60_000) } } });
    if (!locked) throw new Error('Another access change is in progress. Please retry.');
    const heartbeat = setInterval(() => {
        void db.collection(Collections.SYSTEM_SETTINGS).updateOne({ 'teamAccessLock.token': token }, {
            $set: { 'teamAccessLock.until': new Date(Date.now() + 60_000) },
        }).catch(() => { /* Retry on the next tick; an abandoned lease expires automatically. */ });
    }, 20_000);
    heartbeat.unref();
    try { return await work(); }
    finally {
        clearInterval(heartbeat);
        await db.collection(Collections.SYSTEM_SETTINGS).updateOne({ 'teamAccessLock.token': token }, { $unset: { teamAccessLock: '' } });
    }
}

export async function assertNotLastAdmin(user: User): Promise<void> {
    if (user.role !== 'admin' || user.disabled || user.softDelete?.isDeleted) return;
    const db = await getMongoDb();
    const remaining = await db.collection<User>(Collections.USERS).countDocuments({
        role: 'admin', disabled: { $ne: true }, 'softDelete.isDeleted': { $ne: true },
        teamInvitationPending: { $ne: true }, _id: { $ne: user._id },
    });
    if (!remaining) throw new Error('Keep at least one active administrator.');
}

export async function revokeUserSessions(subject: string): Promise<void> {
    const db = await getMongoDb();
    const ids: (string | ObjectId)[] = [subject];
    if (ObjectId.isValid(subject)) ids.push(new ObjectId(subject));
    await db.collection('session').deleteMany({ userId: { $in: ids } });
}
