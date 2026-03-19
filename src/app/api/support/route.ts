import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFirebaseUidFromSession, getUserFromRequest } from '@/lib/auth-utils';
import {
    consumeRateLimit,
    getClientIpFromRequest,
    isOriginAllowed,
} from '@/lib/rate-limit';
import { getPublicAppOrigin } from '@/lib/public-url';
import {
    createSupportMessage,
    markSupportMessageFailed,
} from '@/lib/db/support-messages';
import { enqueueSupportEmailJob } from '@/lib/async-job-queue';

const supportMessageSchema = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    subject: z.string().trim().min(3).max(200),
    message: z.string().trim().min(10).max(5000),
    companyWebsite: z.string().trim().max(200).optional(),
});

export async function POST(request: NextRequest) {
    try {
        const allowedOrigin = getPublicAppOrigin(request);
        const requestOrigin = request.headers.get('origin');
        if (!isOriginAllowed(requestOrigin, allowedOrigin)) {
            return NextResponse.json(
                { error: 'Origin not allowed' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const parsed = supportMessageSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                {
                    error: 'Invalid request payload',
                    fieldErrors: parsed.error.flatten().fieldErrors,
                },
                { status: 400 }
            );
        }

        if (parsed.data.companyWebsite?.trim()) {
            return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
        }

        let firebaseUid = await getUserFromRequest(request);
        if (!firebaseUid) {
            firebaseUid = await getFirebaseUidFromSession();
        }

        const ipAddress = getClientIpFromRequest(request);
        const rateLimit = await consumeRateLimit({
            key: `support:${ipAddress}`,
            limit: 5,
            windowMs: 15 * 60 * 1000,
        });

        if (!rateLimit.allowed) {
            const retryAfterSeconds = Math.max(
                1,
                Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000)
            );

            return NextResponse.json(
                { error: 'Too many support requests. Please wait a few minutes and try again.' },
                {
                    status: 429,
                    headers: {
                        'Retry-After': retryAfterSeconds.toString(),
                    },
                }
            );
        }

        const now = new Date();
        const { companyWebsite, ...messageData } = parsed.data;
        void companyWebsite;

        const shouldQueueEmail = Boolean(process.env.SUPPORT_EMAIL?.trim());
        const doc = await createSupportMessage({
            firebaseUid: firebaseUid || null,
            ...messageData,
            userAgent: request.headers.get('user-agent') || undefined,
            ipAddress,
            deliveryStatus: shouldQueueEmail ? 'queued' : 'skipped',
            deliveryAttempts: 0,
            createdAt: now,
        });

        if (shouldQueueEmail) {
            try {
                await enqueueSupportEmailJob(doc._id.toString(), firebaseUid || null);
            } catch (queueError) {
                const errorMessage = queueError instanceof Error
                    ? queueError.message
                    : 'Failed to queue support email';
                console.error('[Support API] Support email queueing failed:', queueError);
                await markSupportMessageFailed(doc._id.toString(), {
                    deliveryAttempts: 0,
                    errorMessage,
                });
            }
        }

        return NextResponse.json(
            {
                success: true,
                id: doc._id.toString(),
            },
            {
                headers: {
                    'X-RateLimit-Remaining': rateLimit.remaining.toString(),
                },
            }
        );
    } catch (error) {
        console.error('[Support API] Failed to create support request:', error);
        return NextResponse.json({ error: 'Failed to submit support request' }, { status: 500 });
    }
}
