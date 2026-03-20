'use client';

import { Button } from '@heroui/react';
import { BellRing, Loader2 } from 'lucide-react';
import { useToast } from '@/components/toast-provider';
import { enablePushNotifications } from './push/helpers';
import { usePushStatus } from './push/use-push-status';
import { publicEnv } from '@/lib/public-env';

export function EnablePushButton() {
    const { toast } = useToast();
    const { isSupported, isEnabled, isLoading, setIsEnabled, setIsLoading } = usePushStatus();
    const vapidPublicKey = publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    const handleEnable = async () => {
        setIsLoading(true);
        try {
            const result = await enablePushNotifications(vapidPublicKey);
            if (!result.isEnabled) {
                toast({
                    title: 'Permission denied',
                    description: 'Please allow notifications in your browser settings.',
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
        } catch (error) {
            console.error('[Enable Push] Error:', error);
            toast({
                title: 'Enable push failed',
                description: 'Please try again.',
                status: 'danger',
            });
        } finally {
            setIsLoading(false);
        }
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
            className="h-8 gap-2 rounded-full px-3 text-xs font-medium"
            aria-label="Enable browser push notifications"
        >
            {isLoading ? <Loader2 className="size-3 animate-spin" /> : <BellRing className="size-3.5" />}
            Enable push
        </Button>
    );
}
