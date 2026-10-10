import { NextRequest } from 'next/server';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { RateLimitBucket } from '@/lib/db/types';

export function getClientIpFromRequest(request: NextRequest): string {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
        return forwardedFor.split(',')[0]?.trim() || 'unknown';
    }

    const realIp = request.headers.get('x-real-ip');
    if (realIp) {
        return realIp.trim();
    }

    return 'unknown';
}

export function isOriginAllowed(originHeader: string | null, allowedOrigin: string): boolean {
    if (!originHeader) {
        return true;
    }

    try {
        return new URL(originHeader).origin === allowedOrigin;
    } catch {
        return false;
    }
}

export async function consumeRateLimit(input: { key: string; limit: number; windowMs: number }, database?: import('mongodb').Db): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    const db = database || await getMongoDb();
    const now = new Date();
    const buckets = db.collection<RateLimitBucket>(Collections.RATE_LIMIT_BUCKETS);
    const expired = { $lte: [{ $ifNull: ['$expiresAt', new Date(0)] }, now] };
    const pipeline = [{ $set: {
        count: { $cond: [expired, 1, { $add: [{ $ifNull: ['$count', 0] }, 1] }] },
        expiresAt: { $cond: [expired, new Date(now.getTime() + input.windowMs), '$expiresAt'] },
        createdAt: { $ifNull: ['$createdAt', now] }, updatedAt: now,
    } }];
    // Concurrent first requests can race on an upsert. Retry the losing insert
    // as an atomic update rather than resetting a window another request created.
    let result: RateLimitBucket | null = null;
    for (let attempt = 0; attempt < 3 && !result; attempt++) {
        try { result = await buckets.findOneAndUpdate({ _id: input.key }, pipeline, { upsert: true, returnDocument: 'after' }); }
        catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
    }
    if (!result) throw new Error('Rate limiter unavailable');
    return { allowed: result.count <= input.limit, remaining: Math.max(0, input.limit - result.count), resetAt: result.expiresAt };
}
