import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { findUserByAuthSubject, updateUser } from '@/lib/db/users';
import { PushSubscriptionEntry } from '@/lib/db/types';
import { PushSubscribeBodySchema } from '@/lib/schemas';
import { logger } from '@/lib/logger';

/**
 * POST /api/notifications/subscribe
 * Save a Web Push subscription for the current user.
 */
export async function POST(request: NextRequest) {
    try {
        const authSubject = await getAuthSubjectFromSession();
        if (!authSubject) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await findUserByAuthSubject(authSubject);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const SubscribePayload = PushSubscribeBodySchema.extend({
            userAgent: z.string().max(512).optional(),
        });
        const rawBody = await request.json().catch(() => null);
        const parsed = SubscribePayload.safeParse(rawBody);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 });
        }

        const { endpoint, keys, userAgent } = parsed.data;

        const newSubscription: PushSubscriptionEntry = {
            type: 'web',
            endpoint,
            keys: {
                p256dh: keys.p256dh,
                auth: keys.auth,
            },
            userAgent: userAgent || request.headers.get('user-agent') || undefined,
            createdAt: new Date(),
        };

        // Get existing subscriptions and filter out this endpoint if it already exists
        const existingSubscriptions = user.pushSubscriptions || [];
        const filteredSubscriptions = existingSubscriptions.filter(
            (sub) => sub.endpoint !== endpoint
        );

        // Add the new/updated subscription
        await updateUser(user.authSubject, {
            pushSubscriptions: [...filteredSubscriptions, newSubscription],
        });

        return NextResponse.json({ success: true, message: 'Subscription saved' });
    } catch (error) {
        logger.error('[Push Subscribe] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/notifications/subscribe
 * Remove a Web Push subscription for the current user.
 */
export async function DELETE(request: NextRequest) {
    try {
        const authSubject = await getAuthSubjectFromSession();
        if (!authSubject) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await findUserByAuthSubject(authSubject);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const UnsubscribePayload = z.object({
            endpoint: z.string().url().max(1024),
        });
        const rawBody = await request.json().catch(() => null);
        const parsed = UnsubscribePayload.safeParse(rawBody);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Endpoint required' }, { status: 400 });
        }
        const { endpoint } = parsed.data;

        const existingSubscriptions = user.pushSubscriptions || [];
        const filteredSubscriptions = existingSubscriptions.filter(
            (sub) => sub.endpoint !== endpoint
        );

        await updateUser(user.authSubject, {
            pushSubscriptions: filteredSubscriptions,
        });

        return NextResponse.json({ success: true, message: 'Subscription removed' });
    } catch (error) {
        logger.error('[Push Unsubscribe] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
