import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

import { featureSigningKey } from '@/lib/signing-key';


function getTokenSigningKey() {
    return featureSigningKey('MOBILE_SYNC_SESSION_SECRET', 'sync');
}

export interface MobileSyncSessionPayload extends JWTPayload {
    authSubject: string;
}

export async function createMobileSyncSessionToken(authSubject: string): Promise<string> {
    return new SignJWT({ authSubject })
        .setProtectedHeader({ alg: 'HS256' })
        .setAudience('vosift:sync')
        .setIssuedAt()
        .setExpirationTime('24h')
        .sign(getTokenSigningKey());
}

export async function verifyMobileSyncSessionToken(token: string): Promise<MobileSyncSessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, getTokenSigningKey(), { algorithms: ['HS256'], audience: 'vosift:sync' });
        if (typeof payload.authSubject !== 'string' || !payload.authSubject) {
            return null;
        }

        return {
            authSubject: payload.authSubject,
        };
    } catch {
        return null;
    }
}
