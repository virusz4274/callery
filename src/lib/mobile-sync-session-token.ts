import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const TOKEN_SECRET =
    process.env.MOBILE_SYNC_SESSION_SECRET ||
    process.env.UPLOAD_SESSION_SECRET ||
    process.env.SHARE_LINK_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV === 'development' ? 'dev-mobile-sync-session-secret-change-in-prod' : '');

function getTokenSigningKey() {
    if (!TOKEN_SECRET) {
        throw new Error('Missing MOBILE_SYNC_SESSION_SECRET (or fallback secret)');
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
