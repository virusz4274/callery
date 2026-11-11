'use server';

import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { recordingShares } from '@/lib/recording-shares';

async function currentOwner() {
    const owner = await getAuthSubjectFromSession();
    if (!owner) throw new Error('Sign in to manage share links.');
    return owner;
}

export async function createShareLink(recordingId: string, expiresAt: string) {
    return recordingShares.create(await currentOwner(), recordingId, expiresAt);
}

export async function listRecordingShares(recordingId: string) {
    return recordingShares.list(await currentOwner(), recordingId);
}

export async function revokeShareLink(shareId: string) {
    await recordingShares.revoke(await currentOwner(), shareId);
}
