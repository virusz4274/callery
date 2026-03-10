import { SignJWT, jwtVerify } from 'jose';

const SECRET_KEY = process.env.SHARE_LINK_SECRET
    || process.env.NEXTAUTH_SECRET
    || (process.env.NODE_ENV === 'development' ? 'dev-secret-key-change-in-prod' : '');

function getSigningKey() {
    if (!SECRET_KEY) {
        throw new Error('Missing SHARE_LINK_SECRET (or NEXTAUTH_SECRET) for share links');
    }
    return new TextEncoder().encode(SECRET_KEY);
}

export interface SharedLinkPayload {
    recordingId: string;
}

/**
 * Generate a signed JWT for a recording.
 * @param recordingId The ID of the recording to share.
 * @param expiresIn Expiration time string (e.g., '1h', '7d').
 */
export async function generateShareToken(recordingId: string, expiresIn: string = '24h'): Promise<string> {
    const key = getSigningKey();
    return await new SignJWT({ recordingId })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(key);
}

/**
 * Verify a share token and return the payload.
 * Throws an error if invalid or expired.
 */
export async function verifyShareToken(token: string): Promise<SharedLinkPayload | null> {
    try {
        const key = getSigningKey();
        const { payload } = await jwtVerify(token, key);
        return payload as unknown as SharedLinkPayload;
    } catch (error) {
        return null;
    }
}
