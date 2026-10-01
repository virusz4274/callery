import { useState, useCallback } from 'react';
import { authFetch } from '@/lib/api-client';
import { useToast } from '@/components/toast-provider';
import type { User as UserProfile } from '@/lib/types';

export type NotificationsState = {
    activityDigest: 'off' | 'weekly' | 'monthly';
    ingestSuccess: boolean;
    ingestFail: boolean;
};

export function useNotificationSettings(userProfile: UserProfile | null) {
    const { toast } = useToast();
    const [notificationsState, setNotificationsState] = useState<NotificationsState>({
        activityDigest: 'weekly',
        ingestSuccess: true,
        ingestFail: true,
    });
    const [isSavingNotifications, setSavingNotifications] = useState(false);
    const [notificationsDirty, setNotificationsDirty] = useState(false);

    // Render-time adjustment: seed from the loaded profile until the user edits.
    const profileKey = JSON.stringify(userProfile?.notificationSettings ?? null);
    const [prevProfileKey, setPrevProfileKey] = useState(profileKey);
    if (prevProfileKey !== profileKey) {
        setPrevProfileKey(profileKey);
        if (userProfile?.notificationSettings && !notificationsDirty) {
            setNotificationsState(userProfile.notificationSettings);
        }
    }

    // Any caller edit marks the form dirty so later profile loads can't
    // clobber it.
    const updateNotificationsState = useCallback((value: React.SetStateAction<NotificationsState>) => {
        setNotificationsDirty(true);
        setNotificationsState(value);
    }, []);

    const handleSaveNotifications = async () => {
        setSavingNotifications(true);
        try {
            const response = await authFetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationSettings: notificationsState })
            });
            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.error || 'Failed to save notifications');
            }
            toast({ title: 'Notifications Saved', status: 'success' });
            setNotificationsDirty(false);
        } catch (error) {
            toast({
                title: 'Save Failed',
                description: error instanceof Error ? error.message : 'Please try again.',
                status: 'danger',
            });
        } finally {
            setSavingNotifications(false);
        }
    };

    return {
        notificationsState,
        setNotificationsState: updateNotificationsState,
        isSavingNotifications,
        handleSaveNotifications,
        notificationsDirty
    };
}
