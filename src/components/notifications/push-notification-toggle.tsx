"use client";

import { useState } from 'react';
import { Button, Skeleton, Switch } from '@heroui/react';
import { useToast } from '@/components/toast-provider';
import { disablePushNotifications, enablePushNotifications } from './push/helpers';
import { usePushStatus } from './push/use-push-status';
import { publicEnv } from '@/lib/public-env';

export function PushNotificationToggle() {
    const { toast } = useToast();
    const { isSupported, isEnabled, isLoading, permission, error, refresh, setIsEnabled, setPermission } = usePushStatus();
    const [isUpdating, setIsUpdating] = useState(false);
    const handleToggle = async (enabled: boolean) => {
        if (isUpdating) return;
        setIsUpdating(true);
        try {
            if (enabled) {
                const result = await enablePushNotifications(publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
                setPermission(result.permission);
                if (!result.isEnabled) {
                    toast({ title: 'Notifications not enabled', description: 'Allow notifications in your browser settings.', status: 'warning' });
                    return;
                }
                setIsEnabled(true);
                toast({ title: 'Browser notifications enabled', status: 'success' });
            } else {
                await disablePushNotifications();
                setIsEnabled(false);
                toast({ title: 'Browser notifications disabled', status: 'default' });
            }
        } catch (error) {
            console.error('[Push Toggle] Error:', error);
            toast({ title: 'Could not update browser notifications', description: 'Please try again.', status: 'danger' });
        } finally {
            setIsUpdating(false);
        }
    };
    if (isLoading) return <Skeleton className="h-20 rounded-xl" aria-label="Checking browser notifications" />;
    if (error) return <div role="alert" className="rounded-xl border border-danger/20 p-4">
        <p className="text-sm">Could not check browser notifications.</p>
        <Button variant="ghost" className="mt-1 min-h-11" onPress={() => void refresh()}>Retry</Button>
    </div>;
    if (!isSupported) return <p className="rounded-xl border border-border p-4 text-sm text-muted">This browser does not support push notifications. You can still view alerts in the app.</p>;
    if (permission === 'denied') return <div className="space-y-1 rounded-xl border border-warning/20 p-4">
        <p className="text-sm font-medium">Blocked by your browser</p>
        <p className="text-sm text-muted">Allow notifications in your browser settings to enable push alerts.</p>
    </div>;
    return <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
        <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">Push alerts {isEnabled ? 'on' : 'off'}</p>
            <p className="text-sm text-muted">Receive alerts outside the app on this browser.</p>
        </div>
        <Switch className="min-h-11 shrink-0" aria-label="Browser push notifications" isSelected={isEnabled} isDisabled={isUpdating} onChange={handleToggle}>
            <Switch.Content className="min-h-11 min-w-11 justify-center"><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content>
        </Switch>
    </div>;
}
