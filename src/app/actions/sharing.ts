'use server';

import { generateShareToken } from '@/lib/sharing';
import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { findUserByFirebaseUid } from '@/lib/db/users';
import { getRecordingById } from '@/lib/db/recordings';

/**
 * Create a shareable link for a recording.
 */
export async function createShareLink(recordingId: string, expiresIn: string) {
    // 1. Authenticate
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) throw new Error('Unauthorized');

    const user = await findUserByFirebaseUid(firebaseUid);
    if (!user) throw new Error('User not found');

    // 2. Verify Ownership
    const recording = await getRecordingById(recordingId, firebaseUid);
    if (!recording) throw new Error('Recording not found or access denied');

    // 3. Generate Token
    const token = await generateShareToken(recordingId, expiresIn);

    // 4. Return Full URL
    // Use NEXT_PUBLIC_APP_URL if available, otherwise assume local/vercel defaults
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9000';
    return `${baseUrl}/s/${token}`;
}

export async function createShareLinkForClip(
    recordingId: string,
    expiresIn: string,
    clipStartSeconds?: number,
    clipEndSeconds?: number
) {
    const baseUrl = await createShareLink(recordingId, expiresIn);
    const url = new URL(baseUrl);

    if (typeof clipStartSeconds === 'number' && Number.isFinite(clipStartSeconds) && clipStartSeconds >= 0) {
        url.searchParams.set('clipStart', Math.floor(clipStartSeconds).toString());
    }

    if (typeof clipEndSeconds === 'number' && Number.isFinite(clipEndSeconds) && clipEndSeconds >= 0) {
        url.searchParams.set('clipEnd', Math.floor(clipEndSeconds).toString());
    }

    return url.toString();
}
