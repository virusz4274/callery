import { createHmac } from 'node:crypto';

/** Separate signing keys keep upload, sharing and sync tokens non-interchangeable. */
export function featureSigningKey(name: string, purpose: string): Uint8Array {
    const dedicated = process.env[name];
    if (dedicated) return new TextEncoder().encode(dedicated);
    const shared = process.env.APP_SIGNING_SECRET || process.env.BETTER_AUTH_SECRET;
    if (!shared) throw new Error(`Missing ${name} or APP_SIGNING_SECRET. See .env.example.`);
    return createHmac('sha256', shared).update(`vosift:${purpose}:v1`).digest();
}
