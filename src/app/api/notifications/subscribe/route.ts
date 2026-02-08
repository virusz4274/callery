import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { findUserByFirebaseUid, updateUser } from '@/lib/db/users';
import { PushSubscriptionEntry } from '@/lib/db/types';

/**
 * POST /api/notifications/subscribe
 * Save a Web Push subscription for the current user.
 */
export async function POST(request: NextRequest) {
    try {
        const firebaseUid = await getFirebaseUidFromSession();
        if (!firebaseUid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await findUserByFirebaseUid(firebaseUid);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const body = await request.json();
        const { endpoint, keys, userAgent } = body;

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 });
        }

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
        await updateUser(user.firebaseUid, {
            pushSubscriptions: [...filteredSubscriptions, newSubscription],
        });

        return NextResponse.json({ success: true, message: 'Subscription saved' });
    } catch (error) {
        console.error('[Push Subscribe] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/notifications/subscribe
 * Remove a Web Push subscription for the current user.
 */
export async function DELETE(request: NextRequest) {
    try {
        const firebaseUid = await getFirebaseUidFromSession();
        if (!firebaseUid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await findUserByFirebaseUid(firebaseUid);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const body = await request.json();
        const { endpoint } = body;

        if (!endpoint) {
            return NextResponse.json({ error: 'Endpoint required' }, { status: 400 });
        }

        const existingSubscriptions = user.pushSubscriptions || [];
        const filteredSubscriptions = existingSubscriptions.filter(
            (sub) => sub.endpoint !== endpoint
        );

        await updateUser(user.firebaseUid, {
            pushSubscriptions: filteredSubscriptions,
        });

        return NextResponse.json({ success: true, message: 'Subscription removed' });
    } catch (error) {
        console.error('[Push Unsubscribe] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
