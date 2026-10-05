import {
    getCurrentPushSubscription,
    getNotificationPermission,
    isPushSupported,
    removeSubscriptionFromServer,
    requestNotificationPermission,
    saveSubscriptionToServer,
    subscribeToPush,
    unsubscribeFromPush,
} from '@/lib/push-client';

export type PushStatus = {
    isEnabled: boolean;
    isSupported: boolean;
    permission: NotificationPermission | 'unsupported';
};

export async function getPushStatus(): Promise<PushStatus> {
    const supported = isPushSupported();
    if (!supported) {
        return {
            isEnabled: false,
            isSupported: false,
            permission: 'unsupported',
        };
    }

    const permission = getNotificationPermission();
    const subscription = permission === 'granted' ? await getCurrentPushSubscription() : null;

    return {
        isEnabled: Boolean(subscription),
        isSupported: true,
        permission,
    };
}

export async function enablePushNotifications(vapidPublicKey: string) {
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
        return {
            isEnabled: false,
            permission,
        };
    }

    const subscription = await subscribeToPush(vapidPublicKey);
    if (!subscription) {
        throw new Error('Failed to subscribe to push');
    }

    const saved = await saveSubscriptionToServer(subscription);
    if (!saved) {
        throw new Error('Failed to save subscription');
    }

    return {
        isEnabled: true,
        permission,
    };
}

export async function disablePushNotifications() {
    const subscription = await getCurrentPushSubscription();
    if (subscription) {
        await removeSubscriptionFromServer(subscription.endpoint);
        await unsubscribeFromPush();
    }
}
