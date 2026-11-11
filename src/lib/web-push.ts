import webpush, { PushSubscription as WebPushSubscription } from 'web-push';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

let vapidConfigured = false;

export interface WebPushPayload {
    title: string;
    body: string;
    icon?: string;
    url?: string;
}

export interface WebPushDeliveryResult {
    success: boolean;
    endpoint: string;
    statusCode?: number;
    error?: string;
}

function responseStatus(error: unknown): number | undefined {
    const status = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
    return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
}

function ensureVapidConfigured(): boolean {
    if (vapidConfigured) {
        return true;
    }

    const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey || !env.VAPID_CONTACT_EMAIL) return false;

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
    payload: WebPushPayload
): Promise<WebPushDeliveryResult> {
    try {
        if (!ensureVapidConfigured()) return { success: false, endpoint: subscription.endpoint, error: 'Web push is not configured' };
        const response = await webpush.sendNotification(
            subscription,
            JSON.stringify(payload)
        );
        return { success: true, endpoint: subscription.endpoint, statusCode: response.statusCode };
    } catch (error: unknown) {
        const statusCode = responseStatus(error);
        // Provider errors can contain endpoint URLs, response bodies and request
        // credentials. Only the HTTP status belongs in application logs.
        logger.warn('[Web Push] Delivery failed.', statusCode ? { statusCode } : {});
        return { success: false, endpoint: subscription.endpoint, ...(statusCode ? { statusCode } : {}),
            error: statusCode ? `Web push provider returned HTTP ${statusCode}.` : 'Web push delivery failed.' };
    }
}

/**
 * Get the public VAPID key for client-side subscription.
 */
export function getVapidPublicKey(): string {
    return env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
}
