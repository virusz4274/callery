import { timingSafeEqual } from 'node:crypto';

/**
 * Timing-safe comparison of an Authorization header bearer token against the
 * expected secret. Requires the Bearer authentication scheme.
 */
export function isAuthorizedCronRequest(authHeader: string | null, expectedSecret: string): boolean {
    if (!authHeader || !expectedSecret) {
        return false;
    }
    const provided = authHeader.match(/^Bearer\s+(.+)$/i)?.[1].trim();
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
