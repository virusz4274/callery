'use server';

import { generateShareToken } from '@/lib/sharing';
import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { findUserByFirebaseUid } from '@/lib/db/users';
import { getRecordingById } from '@/lib/db/recordings';
import { getConfiguredPublicAppOrigin } from '@/lib/public-url';

function sanitizeClipSeconds(value: number | undefined): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return undefined;
    }

    return Math.floor(value);
}

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
    const token = await generateShareToken({ recordingId }, expiresIn);

    // 4. Return Full URL
    // Public link generation requires an explicit configured origin.
    const baseUrl = getConfiguredPublicAppOrigin();
    return `${baseUrl}/s/${token}`;
}

export async function createShareLinkForClip(
    recordingId: string,
    expiresIn: string,
    clipStartSeconds?: number,
    clipEndSeconds?: number
) {
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) throw new Error('Unauthorized');

    const recording = await getRecordingById(recordingId, firebaseUid);
    if (!recording) throw new Error('Recording not found or access denied');

    const clipStart = sanitizeClipSeconds(clipStartSeconds);
    const clipEnd = sanitizeClipSeconds(clipEndSeconds);

    if (typeof clipEnd === 'number' && typeof clipStart === 'number' && clipEnd <= clipStart) {
        throw new Error('Clip end must be greater than clip start');
    }

    if (typeof clipStart === 'number' && clipStart >= recording.duration) {
        throw new Error('Clip start must be within the recording duration');
    }

    if (typeof clipEnd === 'number' && clipEnd > recording.duration) {
        throw new Error('Clip end must be within the recording duration');
    }

    const token = await generateShareToken(
        {
            recordingId,
            clipStartSeconds: clipStart,
            clipEndSeconds: clipEnd,
        },
        expiresIn
    );

    return `${getConfiguredPublicAppOrigin()}/s/${token}`;
}
