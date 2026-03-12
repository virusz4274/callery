'use client';

import { Switch } from '@heroui/react';
import { BellOff, BellRing } from 'lucide-react';
import { useToast } from '@/components/toast-provider';
import { disablePushNotifications, enablePushNotifications } from './push/helpers';
import { usePushStatus } from './push/use-push-status';

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
                        title: 'Permission denied',
                        description: 'Allow notifications in your browser settings to turn alerts on.',
                        status: 'warning',
                    });
                    return;
                }

                setIsEnabled(true);
                toast({
                    title: 'Notifications enabled',
                    description: 'Push alerts are now active for this browser.',
                    status: 'success',
                });
                return;
            }

            await disablePushNotifications();
            setIsEnabled(false);
            toast({
                title: 'Notifications disabled',
                description: 'This browser will no longer receive push alerts.',
                status: 'default',
            });
        } catch (error) {
            console.error('[Push Toggle] Error:', error);
            toast({
                title: 'Notification update failed',
                description: 'Please try again in a moment.',
                status: 'danger',
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return <div className="h-24 animate-pulse rounded-[1.4rem] border border-default-200/80 bg-default-100/70" />;
    }

    if (!isSupported) {
        return (
            <div className="rounded-[1.4rem] border border-default-200/80 bg-default-50/70 p-4">
                <div className="flex items-start gap-3 text-default-500">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-default-100">
                        <BellOff className="size-5" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Push notifications are not supported</p>
                        <p className="text-sm leading-6 text-default-500">
                            This browser does not support web push, so alerts will stay inside the in-app notification center.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (permission === 'denied') {
        return (
            <div className="rounded-[1.4rem] border border-warning/20 bg-warning/5 p-4">
                <div className="flex items-start gap-3 text-warning">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-warning/10">
                        <BellOff className="size-5" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Notifications are blocked</p>
                        <p className="text-sm leading-6 text-default-500">
                            Re-enable notification permission in your browser settings if you want call and workflow alerts outside the app.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-[1.4rem] border border-default-200/80 bg-background/95 p-4 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.35)]">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${isEnabled ? 'bg-success/10 text-success' : 'bg-default-100 text-default-400'}`}>
                        {isEnabled ? <BellRing className="size-5" /> : <BellOff className="size-5" />}
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">Browser push alerts</p>
                        <p className="text-sm leading-6 text-default-500">
                            {isEnabled
                                ? 'Active for this browser. Alerts can arrive even when the app is closed.'
                                : 'Turn this on if you want processing, sync, and admin alerts outside the app.'}
                        </p>
                    </div>
                </div>
                <Switch
                    aria-label="Toggle browser push alerts"
                    isSelected={isEnabled}
                    onChange={handleToggle}
                    isDisabled={isLoading}
                    size="sm"
                />
            </div>
        </div>
    );
}
