import { jwtVerify, SignJWT } from 'jose';
import { featureSigningKey } from '@/lib/signing-key';

export interface ShareTokenClaims {
    shareId: string;
    issuedAt: number;
    expiresAt: number;
}

const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);

/** A token identifies one revocable grant; it never grants access by itself. */
export async function generateShareToken(claims: ShareTokenClaims): Promise<string> {
    if (!validId(claims.shareId) || !Number.isSafeInteger(claims.issuedAt) ||
        !Number.isSafeInteger(claims.expiresAt) || claims.expiresAt <= claims.issuedAt) {
        throw new Error('Invalid share grant.');
    }
    return new SignJWT({ shareId: claims.shareId })
        .setProtectedHeader({ alg: 'HS256' })
        .setAudience('vosift:share')
        .setIssuedAt(claims.issuedAt)
        .setExpirationTime(claims.expiresAt)
        .sign(featureSigningKey('SHARE_LINK_SECRET', 'share'));
}

export async function verifyShareToken(token: string, now = new Date()): Promise<ShareTokenClaims | null> {
    try {
        const { payload } = await jwtVerify(token, featureSigningKey('SHARE_LINK_SECRET', 'share'), {
            algorithms: ['HS256'], audience: 'vosift:share', currentDate: now,
        });
        if (!validId(payload.shareId) || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) ||
            payload.exp! <= payload.iat! || payload.iat! > Math.floor(now.getTime() / 1000) ||
            Object.keys(payload).some(key => !['shareId', 'iat', 'exp', 'aud'].includes(key))) return null;
        return { shareId: payload.shareId, issuedAt: payload.iat!, expiresAt: payload.exp! };
    } catch {
        return null;
    }
}
