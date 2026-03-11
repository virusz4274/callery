import { useState, useRef, useEffect } from 'react';
import { authFetch } from '@/lib/api-client';
import { useToast } from '@/components/toast-provider';
import type { User as UserProfile } from '@/lib/types';

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
    try {
        const data = (await response.json()) as { error?: string };
        return data.error || fallback;
    } catch {
        return fallback;
    }
}

export function useNotificationSettings(userProfile: UserProfile | null) {
    const { toast } = useToast();
    const [notificationsState, setNotificationsState] = useState({
        activityDigest: 'weekly' as 'off' | 'weekly' | 'monthly',
        ingestSuccess: true,
        ingestFail: true,
    });
    const [isSavingNotifications, setSavingNotifications] = useState(false);
    const notificationsDirtyRef = useRef(false);

    useEffect(() => {
        if (userProfile?.notificationSettings && !notificationsDirtyRef.current) {
            setNotificationsState(userProfile.notificationSettings);
        }
    }, [userProfile]);

    const handleSaveNotifications = async () => {
        setSavingNotifications(true);
        try {
            const response = await authFetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationSettings: notificationsState })
            });
            if (!response.ok) {
                throw new Error(await getErrorMessage(response, 'Failed to save notification settings'));
            }
            toast({ title: 'Notifications Saved', status: 'success' });
            notificationsDirtyRef.current = false;
        } catch (error) {
            toast({
                title: 'Save Failed',
                description: error instanceof Error ? error.message : 'Failed to save notification settings',
                status: 'danger',
            });
        } finally {
            setSavingNotifications(false);
        }
    };

    return {
        notificationsState,
        setNotificationsState,
        isSavingNotifications,
        handleSaveNotifications,
        notificationsDirtyRef
    };
}
