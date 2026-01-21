import { useState, useRef, useEffect } from 'react';
import { authFetch } from '@/lib/api-client';
import { useToast } from '@/components/toast-provider';
import type { User as UserProfile } from '@/lib/types';

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
            await authFetch('/api/user/profile', {
                method: 'PATCH',
                body: JSON.stringify({ notificationSettings: notificationsState })
            });
            toast({ title: 'Notifications Saved', status: 'success' });
            notificationsDirtyRef.current = false;
        } catch {
            toast({ title: 'Save Failed', status: 'danger' });
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
