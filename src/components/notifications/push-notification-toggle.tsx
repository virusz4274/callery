'use client';

import { Switch } from '@heroui/react';
import { BellOff, BellRing } from 'lucide-react';
import { useToast } from '@/components/toast-provider';
import { disablePushNotifications, enablePushNotifications } from './push/helpers';
import { usePushStatus } from './push/use-push-status';

/**
 * Push Notification toggle component.
 * Allows users to enable/disable browser push notifications.
 */
export function PushNotificationToggle() {
    const { toast } = useToast();
    const {
        isSupported,
        isEnabled,
        isLoading,
        permission,
        setIsEnabled,
        setIsLoading,
        setPermission,
    } = usePushStatus();

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

    const handleToggle = async (enabled: boolean) => {
        setIsLoading(true);

        try {
            if (enabled) {
                const result = await enablePushNotifications(vapidPublicKey);
                setPermission(result.permission);

                if (!result.isEnabled) {
                    toast({
                        title: 'Permission Denied',
                        description: 'You need to allow notifications in your browser settings.',
                        status: 'warning',
                    });
                    return;
                }

                setIsEnabled(true);
                toast({
                    title: 'Notifications Enabled',
                    description: 'You will now receive push notifications.',
                    status: 'success',
                });
                return;
            }

            await disablePushNotifications();
            setIsEnabled(false);
            toast({
                title: 'Notifications Disabled',
                description: 'You will no longer receive push notifications.',
                status: 'default',
            });
        } catch (error) {
            console.error('[Push Toggle] Error:', error);
            toast({
                title: 'Error',
                description: 'Failed to update notification settings. Please try again.',
                status: 'danger',
            });
        } finally {
            setIsLoading(false);
        }
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
                <span className="text-sm">Notifications blocked. Enable them in your browser settings.</span>
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
                        {isEnabled
                            ? "Enabled - You'll receive alerts even when the app is closed"
                            : 'Enable to get alerts even when the app is closed'}
                    </p>
                </div>
            </div>
            <Switch isSelected={isEnabled} onChange={handleToggle} isDisabled={isLoading} size="sm" />
        </div>
    );
}
