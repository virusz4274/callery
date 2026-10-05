import { timingSafeEqual } from 'node:crypto';

/**
 * Timing-safe comparison of an Authorization header bearer token against the
 * expected secret. Accepts both `Bearer TOKEN` and bare `TOKEN`.
 */
export function isAuthorizedCronRequest(authHeader: string | null, expectedSecret: string): boolean {
    if (!authHeader || !expectedSecret) {
        return false;
    }
    const provided = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!provided) {
        return false;
    }
    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(expectedSecret);
    if (providedBuf.length !== expectedBuf.length) {
        return false;
    }
    return timingSafeEqual(providedBuf, expectedBuf);
}
