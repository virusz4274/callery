import { ObjectId } from 'mongodb';
import type { Recording } from './db/types';
import type { ShareLinkResponse } from './recording-share-types';
import { generateShareToken, verifyShareToken } from './sharing';

export interface RecordingShare {
    _id: ObjectId;
    owner: string;
    recordingId: ObjectId;
    createdAt: Date;
    expiresAt: Date;
    revokedAt?: Date;
}

export interface RecordingShareDependencies {
    now(): Date;
    publicOrigin(): string;
    teamEnabled(): Promise<boolean>;
    ownerActive(owner: string): Promise<boolean>;
    recording(owner: string, recordingId: string): Promise<Recording | null>;
    grant(id: string): Promise<RecordingShare | null>;
    insert(grant: RecordingShare): Promise<void>;
    list(owner: string, recordingId: string): Promise<RecordingShare[]>;
    revoke(id: string, owner: string, revokedAt: Date): Promise<void>;
}

/** Share policy is shared by owner actions, public pages, and every audio request. */
export function createRecordingShareService(deps: RecordingShareDependencies) {
    async function ownerRecording(owner: string, recordingId: string) {
        if (await deps.teamEnabled()) throw new Error('Public sharing is disabled for company recordings.');
        if (!await deps.ownerActive(owner)) throw new Error('This account cannot share recordings.');
        if (!ObjectId.isValid(recordingId)) throw new Error('Recording not found.');
        const recording = await deps.recording(owner, recordingId);
        if (!recording || recording.authSubject !== owner) throw new Error('Recording not found.');
        return recording;
    }

    async function response(grant: RecordingShare): Promise<ShareLinkResponse> {
        const token = await generateShareToken({ shareId: grant._id.toString(),
            issuedAt: Math.floor(grant.createdAt.getTime() / 1000), expiresAt: Math.floor(grant.expiresAt.getTime() / 1000) });
        return { id: grant._id.toString(), url: `${deps.publicOrigin()}/s/${token}`,
            createdAt: grant.createdAt.toISOString(), expiresAt: grant.expiresAt.toISOString(),
            ...(grant.revokedAt ? { revokedAt: grant.revokedAt.toISOString() } : {}),
            status: grant.revokedAt ? 'revoked' : grant.expiresAt <= deps.now() ? 'expired' : 'active' };
    }

    return {
        async create(owner: string, recordingId: string, expiresAt: string): Promise<ShareLinkResponse> {
            await ownerRecording(owner, recordingId);
            const now = deps.now();
            const parsed = typeof expiresAt === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(expiresAt) ? Date.parse(expiresAt) : NaN;
            const expiry = new Date(Math.floor(parsed / 1000) * 1000);
            if (!Number.isFinite(parsed) || expiry <= now) throw new Error('Choose an expiration date and time in the future.');
            // Validate the public origin and signing configuration before saving a grant.
            const grant: RecordingShare = { _id: new ObjectId(), owner, recordingId: new ObjectId(recordingId),
                createdAt: new Date(Math.floor(now.getTime() / 1000) * 1000), expiresAt: expiry };
            const result = await response(grant);
            await deps.insert(grant);
            return result;
        },
        async list(owner: string, recordingId: string): Promise<ShareLinkResponse[]> {
            await ownerRecording(owner, recordingId);
            return Promise.all((await deps.list(owner, recordingId)).map(response));
        },
        async revoke(owner: string, shareId: string): Promise<void> {
            if (!ObjectId.isValid(shareId)) throw new Error('Share link not found.');
            const grant = await deps.grant(shareId);
            if (!grant || grant.owner !== owner) throw new Error('Share link not found.');
            await ownerRecording(owner, grant.recordingId.toString());
            if (!grant.revokedAt) await deps.revoke(shareId, owner, deps.now());
        },
        async resolve(token: string): Promise<{ grant: RecordingShare; recording: Recording } | null> {
            const now = deps.now();
            const claims = await verifyShareToken(token, now);
            if (!claims || await deps.teamEnabled()) return null;
            const grant = await deps.grant(claims.shareId);
            if (!grant || grant.revokedAt || grant.expiresAt <= now ||
                Math.floor(grant.createdAt.getTime() / 1000) !== claims.issuedAt ||
                Math.floor(grant.expiresAt.getTime() / 1000) !== claims.expiresAt || !await deps.ownerActive(grant.owner)) return null;
            const recording = await deps.recording(grant.owner, grant.recordingId.toString());
            if (!recording || recording.authSubject !== grant.owner) return null;
            return { grant, recording };
        },
    };
}
