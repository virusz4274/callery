import { jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { featureSigningKey } from '@/lib/signing-key';


function getSigningKey() {
    return featureSigningKey('SHARE_LINK_SECRET', 'share');
}

export interface SharedClipBounds {
    clipStartSeconds?: number;
    clipEndSeconds?: number;
}

export interface SharedLinkPayload extends JWTPayload, SharedClipBounds {
    recordingId: string;
}

function clipSeconds(value: unknown): number | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error('Clip bounds must be finite, nonnegative numbers.');
    }
    return value;
}

/** Invalid supplied bounds must never silently turn a clip into a full share. */
export function parseShareClipBounds(input: { clipStartSeconds?: unknown; clipEndSeconds?: unknown }): SharedClipBounds {
    const start = clipSeconds(input.clipStartSeconds);
    const end = clipSeconds(input.clipEndSeconds);
    if (end !== undefined && end <= (start ?? 0)) {
        throw new Error('Clip end must be greater than clip start.');
    }
    return {
        ...(start !== undefined ? { clipStartSeconds: start } : {}),
        ...(end !== undefined ? { clipEndSeconds: end } : {}),
    };
}

export function resolveShareClipBounds(input: SharedClipBounds, duration: number): { start: number; end: number } | null {
    const bounds = parseShareClipBounds(input);
    if (bounds.clipStartSeconds === undefined && bounds.clipEndSeconds === undefined) return null;
    const start = bounds.clipStartSeconds ?? 0;
    const end = bounds.clipEndSeconds ?? duration;
    if (!Number.isFinite(duration) || duration <= 0 || start >= duration || end > duration || end <= start) {
        throw new Error('Clip bounds must be within the recording duration.');
    }
    return { start, end };
}

/**
 * Generate a signed JWT for a recording.
 * @param payload The recording payload to share.
 * @param expiresIn Expiration time string (e.g., '1h', '7d').
 */
export async function generateShareToken(payload: SharedLinkPayload, expiresIn: string = '24h'): Promise<string> {
    const key = getSigningKey();
    const bounds = parseShareClipBounds(payload);
    return await new SignJWT({ recordingId: payload.recordingId, ...bounds })
        .setProtectedHeader({ alg: 'HS256' })
        .setAudience('vosift:share')
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(key);
}

/**
 * Verify a share token and return the payload.
 * Returns null if invalid or expired.
 */
export async function verifyShareToken(token: string): Promise<SharedLinkPayload | null> {
    try {
        const key = getSigningKey();
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'], audience: 'vosift:share' });
        if (typeof payload.recordingId !== 'string' || !payload.recordingId) {
            return null;
        }

        const bounds = parseShareClipBounds({ clipStartSeconds: payload.clipStartSeconds, clipEndSeconds: payload.clipEndSeconds });

        return {
            recordingId: payload.recordingId,
            ...bounds,
        };
    } catch (error) {
        return null;
    }
}
