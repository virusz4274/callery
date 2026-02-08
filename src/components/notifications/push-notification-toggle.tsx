'use client';

import { useState, useEffect } from 'react';
import { Button, Switch } from '@heroui/react';
import { BellRing, BellOff, Loader2 } from 'lucide-react';
import {
    isPushSupported,
    getNotificationPermission,
    requestNotificationPermission,
    subscribeToPush,
    unsubscribeFromPush,
    getCurrentPushSubscription,
    saveSubscriptionToServer,
    removeSubscriptionFromServer,
} from '@/lib/push-client';
import { useToast } from '@/components/toast-provider';

/**
 * Push Notification toggle component.
 * Allows users to enable/disable browser push notifications.
 */
export function PushNotificationToggle() {
    const [isSupported, setIsSupported] = useState(false);
    const [isEnabled, setIsEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
    const { toast } = useToast();

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

    useEffect(() => {
        const checkStatus = async () => {
            const supported = isPushSupported();
            setIsSupported(supported);

            if (supported) {
                const perm = getNotificationPermission();
                setPermission(perm);

                if (perm === 'granted') {
                    const subscription = await getCurrentPushSubscription();
                    setIsEnabled(!!subscription);
                }
            }

            setIsLoading(false);
        };

        checkStatus();
    }, []);

    const handleToggle = async (enabled: boolean) => {
        setIsLoading(true);

        try {
            if (enabled) {
                // Request permission if not already granted
                if (permission !== 'granted') {
                    const newPermission = await requestNotificationPermission();
                    setPermission(newPermission);

                    if (newPermission !== 'granted') {
                        toast({
                            title: 'Permission Denied',
                            description: 'You need to allow notifications in your browser settings.',
                            status: 'warning',
                        });
                        setIsLoading(false);
                        return;
                    }
                }

                // Subscribe to push
                const subscription = await subscribeToPush(vapidPublicKey);

                if (subscription) {
                    const saved = await saveSubscriptionToServer(subscription);
                    if (saved) {
                        setIsEnabled(true);
                        toast({
                            title: 'Notifications Enabled',
                            description: 'You will now receive push notifications.',
                            status: 'success',
                        });
                    } else {
                        throw new Error('Failed to save subscription');
                    }
                }
            } else {
                // Unsubscribe
                const subscription = await getCurrentPushSubscription();
                if (subscription) {
                    await removeSubscriptionFromServer(subscription.endpoint);
                    await unsubscribeFromPush();
                }
                setIsEnabled(false);
                toast({
                    title: 'Notifications Disabled',
                    description: 'You will no longer receive push notifications.',
                    status: 'default',
                });
            }
        } catch (error) {
            console.error('[Push Toggle] Error:', error);
            toast({
                title: 'Error',
                description: 'Failed to update notification settings. Please try again.',
                status: 'danger',
            });
        }

        setIsLoading(false);
    };

    if (!isSupported) {
        return (
            <div className="flex items-center gap-3 text-muted-foreground">
                <BellOff className="size-5" />
                <span className="text-sm">Push notifications not supported in this browser</span>
            </div>
        );
    }

    if (permission === 'denied') {
        return (
            <div className="flex items-center gap-3 text-warning">
                <BellOff className="size-5" />
                <span className="text-sm">
                    Notifications blocked. Enable them in your browser settings.
                </span>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                {isEnabled ? (
                    <BellRing className="size-5 text-success" />
                ) : (
                    <BellOff className="size-5 text-default-400" />
                )}
                <div>
                    <p className="text-sm font-medium">Push Notifications</p>
                    <p className="text-xs text-muted-foreground">
                        {isEnabled ? "Enabled - You'll receive alerts even when the app is closed" : 'Enable to get alerts even when the app is closed'}
                    </p>
                </div>
            </div>
            <Switch
                isSelected={isEnabled}
                onChange={handleToggle}
                isDisabled={isLoading}
                size="sm"
            />
        </div>
    );
}

/**
 * Simple button to enable push notifications (for notification center header).
 */
export function EnablePushButton() {
    const [isSupported, setIsSupported] = useState(false);
    const [isEnabled, setIsEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

    useEffect(() => {
        const checkStatus = async () => {
            const supported = isPushSupported();
            setIsSupported(supported);

            if (supported) {
                const perm = getNotificationPermission();
                if (perm === 'granted') {
                    const subscription = await getCurrentPushSubscription();
                    setIsEnabled(!!subscription);
                }
            }

            setIsLoading(false);
        };

        checkStatus();
    }, []);

    const handleEnable = async () => {
        setIsLoading(true);

        try {
            const permission = await requestNotificationPermission();
            if (permission !== 'granted') {
                toast({
                    title: 'Permission Denied',
                    description: 'Please allow notifications in browser settings.',
                    status: 'warning',
                });
                setIsLoading(false);
                return;
            }

            const subscription = await subscribeToPush(vapidPublicKey);
            if (subscription) {
                await saveSubscriptionToServer(subscription);
                setIsEnabled(true);
                toast({
                    title: 'Notifications Enabled!',
                    description: 'You will receive push notifications.',
                    status: 'success',
                });
            }
        } catch (error) {
            console.error('[Enable Push] Error:', error);
            toast({
                title: 'Error',
                description: 'Failed to enable notifications.',
                status: 'danger',
            });
        }

        setIsLoading(false);
    };

    if (!isSupported || isEnabled) {
        return null;
    }

    return (
        <Button
            size="sm"
            variant="ghost"
            onPress={handleEnable}
            isPending={isLoading}
            className="text-xs h-7 px-2"
        >
            {isLoading ? (
                <Loader2 className="size-3 animate-spin" />
            ) : (
                <BellRing className="size-3 mr-1" />
            )}
            Enable Push
        </Button>
    );
}
