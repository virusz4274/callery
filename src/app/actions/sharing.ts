'use server';

import { generateShareToken } from '@/lib/sharing';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { findUserByAuthSubject } from '@/lib/db/users';
import { getRecordingById } from '@/lib/db/recordings';
import { getConfiguredPublicAppOrigin } from '@/lib/public-url';
import { getTeamSettings } from '@/lib/team-policy';

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
    if ((await getTeamSettings()).enabled) throw new Error('Public sharing is disabled for company recordings.');
    // 1. Authenticate
    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) throw new Error('Unauthorized');

    const user = await findUserByAuthSubject(authSubject);
    if (!user) throw new Error('User not found');

    // 2. Verify Ownership
    const recording = await getRecordingById(recordingId, authSubject);
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
    if ((await getTeamSettings()).enabled) throw new Error('Public sharing is disabled for company recordings.');
    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) throw new Error('Unauthorized');

    const recording = await getRecordingById(recordingId, authSubject);
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
