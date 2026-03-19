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

export async function consumeRateLimit(input: {
    key: string;
    limit: number;
    windowMs: number;
}): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    const db = await getMongoDb();
    const now = new Date();
    const resetAt = new Date(now.getTime() + input.windowMs);
    const buckets = db.collection<RateLimitBucket>(Collections.RATE_LIMIT_BUCKETS);

    const existing = await buckets.findOneAndUpdate(
        {
            _id: input.key,
            expiresAt: { $gt: now },
        },
        {
            $inc: {
                count: 1,
            },
            $set: {
                updatedAt: now,
            },
        },
        {
            returnDocument: 'after',
        }
    );

    if (existing) {
        return {
            allowed: existing.count <= input.limit,
            remaining: Math.max(0, input.limit - existing.count),
            resetAt: existing.expiresAt,
        };
    }

    await buckets.updateOne(
        { _id: input.key },
        {
            $set: {
                count: 1,
                expiresAt: resetAt,
                updatedAt: now,
            },
            $setOnInsert: {
                createdAt: now,
            },
        },
        { upsert: true }
    );

    return {
        allowed: true,
        remaining: Math.max(0, input.limit - 1),
        resetAt,
    };
}
