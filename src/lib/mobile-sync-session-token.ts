import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

import { env } from '@/lib/env';

const TOKEN_SECRET = env.MOBILE_SYNC_SESSION_SECRET;

function getTokenSigningKey() {
    if (!TOKEN_SECRET) {
        throw new Error('Missing MOBILE_SYNC_SESSION_SECRET');
    }

    return new TextEncoder().encode(TOKEN_SECRET);
}

export interface MobileSyncSessionPayload extends JWTPayload {
    firebaseUid: string;
}

export async function createMobileSyncSessionToken(firebaseUid: string): Promise<string> {
    return new SignJWT({ firebaseUid })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h')
        .sign(getTokenSigningKey());
}

export async function verifyMobileSyncSessionToken(token: string): Promise<MobileSyncSessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, getTokenSigningKey());
        if (typeof payload.firebaseUid !== 'string' || !payload.firebaseUid) {
            return null;
        }

        return {
            firebaseUid: payload.firebaseUid,
        };
    } catch {
        return null;
    }
}
