import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { getAuthSubjectFromSession, getUserFromRequest } from '@/lib/auth-utils';
import {
    consumeRateLimit,
    getClientIpFromRequest,
    isOriginAllowed,
} from '@/lib/rate-limit';
import { getPublicAppOrigin } from '@/lib/public-url';
import {
    createSupportMessage,
    markSupportMessageFailed,
    markSupportMessageSending,
    markSupportMessageSent,
} from '@/lib/db/support-messages';
import { logger } from '@/lib/logger';
import { sendSupportMessageNotification } from '@/lib/support-email';
import { env } from '@/lib/env';
import { siteProfile } from '@/lib/site-profile';
import { emailProvider } from '@/lib/config';

const supportMessageSchema = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    subject: z.string().trim().min(3).max(200),
    message: z.string().trim().min(10).max(5000),
    // Honeypot: must be present and empty. Bots either omit the field or fill it.
    companyWebsite: z.string().max(0),
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

        let authSubject = await getUserFromRequest(request);
        if (!authSubject) {
            authSubject = await getAuthSubjectFromSession();
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

        const supportEmail = siteProfile.supportEmail?.trim() || env.SUPPORT_EMAIL?.trim();
        const shouldSendEmail = Boolean(supportEmail) && emailProvider() !== 'none';
        const doc = await createSupportMessage({
            authSubject: authSubject || null,
            ...messageData,
            userAgent: request.headers.get('user-agent') || undefined,
            ipAddress,
            deliveryStatus: shouldSendEmail ? 'pending' : 'skipped',
            deliveryAttempts: 0,
            createdAt: now,
        });

        if (shouldSendEmail && supportEmail) {
            after(async () => {
                try {
                    await markSupportMessageSending(doc._id.toString(), 1);
                    await sendSupportMessageNotification(doc, supportEmail);
                    await markSupportMessageSent(doc._id.toString(), 1);
                } catch (emailError) {
                    const errorMessage = emailError instanceof Error
                        ? emailError.message
                        : 'Failed to send support email';

                    logger.error('[Support API] Support email delivery failed:', emailError);
                    await markSupportMessageFailed(doc._id.toString(), {
                        deliveryAttempts: 1,
                        errorMessage,
                    });
                }
            });
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
        logger.error('[Support API] Failed to create support request:', error);
        return NextResponse.json({ error: 'Failed to submit support request' }, { status: 500 });
    }
}
