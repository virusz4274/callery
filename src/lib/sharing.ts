import { jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { featureSigningKey } from '@/lib/signing-key';


function getSigningKey() {
    return featureSigningKey('SHARE_LINK_SECRET', 'share');
}

export interface SharedLinkPayload extends JWTPayload {
    recordingId: string;
    clipStartSeconds?: number;
    clipEndSeconds?: number;
}

function sanitizeClipSeconds(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return undefined;
    }

    return Math.floor(value);
}

/**
 * Generate a signed JWT for a recording.
 * @param payload The recording payload to share.
 * @param expiresIn Expiration time string (e.g., '1h', '7d').
 */
export async function generateShareToken(payload: SharedLinkPayload, expiresIn: string = '24h'): Promise<string> {
    const key = getSigningKey();
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setAudience('vosift:share')
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
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'], audience: 'vosift:share' });
        if (typeof payload.recordingId !== 'string' || !payload.recordingId) {
            return null;
        }

        const clipStartSeconds = sanitizeClipSeconds(payload.clipStartSeconds);
        const clipEndSeconds = sanitizeClipSeconds(payload.clipEndSeconds);
        if (
            typeof clipStartSeconds === 'number' &&
            typeof clipEndSeconds === 'number' &&
            clipEndSeconds <= clipStartSeconds
        ) {
            return null;
        }

        return {
            recordingId: payload.recordingId,
            clipStartSeconds,
            clipEndSeconds,
        };
    } catch (error) {
        return null;
    }
}
