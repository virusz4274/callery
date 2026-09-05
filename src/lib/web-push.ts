import webpush, { PushSubscription as WebPushSubscription } from 'web-push';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
    if (vapidConfigured) {
        return true;
    }

    const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = env.VAPID_PRIVATE_KEY;

    webpush.setVapidDetails(
        'mailto:' + env.VAPID_CONTACT_EMAIL,
        publicKey,
        privateKey
    );
    vapidConfigured = true;
    return true;
}

/**
 * Send a Web Push notification to a single subscription.
 */
export async function sendWebPushNotification(
    subscription: WebPushSubscription,
    payload: { title: string; body: string; icon?: string; url?: string }
): Promise<{ success: boolean; endpoint: string; error?: string }> {
    if (!ensureVapidConfigured()) {
        return {
            success: false,
            endpoint: subscription.endpoint,
            error: 'VAPID keys are not configured',
        };
    }

    try {
        await webpush.sendNotification(
            subscription,
            JSON.stringify(payload)
        );
        return { success: true, endpoint: subscription.endpoint };
    } catch (error: unknown) {
        logger.error('[Web Push] Failed to send notification:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, endpoint: subscription.endpoint, error: errorMessage };
    }
}

/**
 * Get the public VAPID key for client-side subscription.
 */
export function getVapidPublicKey(): string {
    return env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
}
