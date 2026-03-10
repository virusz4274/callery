'use client';

import { Button } from '@heroui/react';
import { BellRing, Loader2 } from 'lucide-react';
import { useToast } from '@/components/toast-provider';
import { enablePushNotifications } from './push/helpers';
import { usePushStatus } from './push/use-push-status';

export function EnablePushButton() {
    const { toast } = useToast();
    const { isSupported, isEnabled, isLoading, setIsEnabled, setIsLoading } = usePushStatus();
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

    const handleEnable = async () => {
        setIsLoading(true);
        try {
            const result = await enablePushNotifications(vapidPublicKey);
            if (!result.isEnabled) {
                toast({
                    title: 'Permission Denied',
                    description: 'Please allow notifications in browser settings.',
                    status: 'warning',
                });
                return;
            }

            setIsEnabled(true);
            toast({
                title: 'Notifications Enabled!',
                description: 'You will receive push notifications.',
                status: 'success',
            });
        } catch (error) {
            console.error('[Enable Push] Error:', error);
            toast({
                title: 'Error',
                description: 'Failed to enable notifications.',
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
            className="text-xs h-7 px-2"
        >
            {isLoading ? <Loader2 className="size-3 animate-spin" /> : <BellRing className="size-3 mr-1" />}
            Enable Push
        </Button>
    );
}
