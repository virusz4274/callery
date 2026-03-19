'use client';

/**
 * Client-side utilities for Web Push subscription management.
 */

const PUSH_SERVICE_WORKER_URL = '/push-sw.js';

function getRegistrationScriptUrl(registration: ServiceWorkerRegistration): string | null {
    return registration.active?.scriptURL
        || registration.waiting?.scriptURL
        || registration.installing?.scriptURL
        || null;
}

function isPushServiceWorkerScript(scriptUrl: string | null): boolean {
    if (!scriptUrl) {
        return false;
    }

    try {
        return new URL(scriptUrl, window.location.origin).pathname === PUSH_SERVICE_WORKER_URL;
    } catch {
        return false;
    }
}

/**
 * Check if the browser supports Web Push notifications.
 */
export function isPushSupported(): boolean {
    return (
        typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window
    );
}

export async function ensurePushServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        throw new Error('Service workers are not supported');
    }

    const registrations = await navigator.serviceWorker.getRegistrations();
    const existingPushRegistration = registrations.find((registration) =>
        isPushServiceWorkerScript(getRegistrationScriptUrl(registration))
    );

    await Promise.all(
        registrations
            .filter((registration) => !isPushServiceWorkerScript(getRegistrationScriptUrl(registration)))
            .map((registration) => registration.unregister())
    );

    if (existingPushRegistration) {
        if (existingPushRegistration.active) {
            return existingPushRegistration;
        }

        return navigator.serviceWorker.ready;
    }

    await navigator.serviceWorker.register(PUSH_SERVICE_WORKER_URL, { scope: '/' });
    return navigator.serviceWorker.ready;
}

/**
 * Get the current notification permission status.
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
    if (!isPushSupported()) return 'unsupported';
    return Notification.permission;
}

/**
 * Request notification permission from the user.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
    if (!isPushSupported()) {
        throw new Error('Push notifications not supported');
    }
    return await Notification.requestPermission();
}

/**
 * Subscribe the user to Web Push notifications.
 * Returns the PushSubscription object if successful.
 */
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription | null> {
    if (!isPushSupported()) {
        throw new Error('Push notifications not supported');
    }

    if (!vapidPublicKey) {
        console.error('[Push] VAPID public key is missing!');
        throw new Error('VAPID public key is not configured');
    }

    console.log('[Push] Waiting for service worker...');
    const registration = await ensurePushServiceWorkerRegistration();
    console.log('[Push] Service worker ready:', registration);

    // Check if already subscribed
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
        console.log('[Push] Already subscribed:', existingSubscription.endpoint);
        return existingSubscription;
    }

    // Convert VAPID key to Uint8Array
    console.log('[Push] Subscribing with VAPID key...');
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

    const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
    });

    console.log('[Push] Subscribed successfully:', subscription.endpoint);
    return subscription;
}

/**
 * Unsubscribe from Web Push notifications.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
    if (!isPushSupported()) return false;

    const registration = await ensurePushServiceWorkerRegistration();
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
        return await subscription.unsubscribe();
    }

    return false;
}

/**
 * Get the current push subscription if any.
 */
export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
    if (!isPushSupported()) return null;

    const registration = await ensurePushServiceWorkerRegistration();
    return await registration.pushManager.getSubscription();
}

/**
 * Convert a VAPID public key from base64url to Uint8Array.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
}

/**
 * Send the subscription to our backend API.
 */
export async function saveSubscriptionToServer(subscription: PushSubscription): Promise<boolean> {
    const subscriptionJson = subscription.toJSON();

    const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            endpoint: subscriptionJson.endpoint,
            keys: subscriptionJson.keys,
        }),
    });

    return response.ok;
}

/**
 * Remove the subscription from our backend API.
 */
export async function removeSubscriptionFromServer(endpoint: string): Promise<boolean> {
    const response = await fetch('/api/notifications/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
    });

    return response.ok;
}
