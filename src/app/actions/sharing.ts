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
