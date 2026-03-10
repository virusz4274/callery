import webpush, { PushSubscription as WebPushSubscription } from 'web-push';

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
    if (vapidConfigured) {
        return true;
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey) {
        return false;
    }

    webpush.setVapidDetails(
        'mailto:' + (process.env.VAPID_CONTACT_EMAIL || 'admin@vosift.com'),
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
        console.error('[Web Push] Failed to send notification:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, endpoint: subscription.endpoint, error: errorMessage };
    }
}

/**
 * Get the public VAPID key for client-side subscription.
 */
export function getVapidPublicKey(): string {
    return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
}
