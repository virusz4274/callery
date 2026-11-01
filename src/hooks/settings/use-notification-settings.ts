import { useState } from 'react';
import type { AppUser } from '@/lib/auth/types';
import { useToast } from '@/components/toast-provider';
import type { User as UserProfile } from '@/lib/types';
import { useSettingsForm } from './use-settings-form';
import { useProfileSave } from './use-profile-save';

export function useNotificationSettings(user: AppUser | null, userProfile: UserProfile | null) {
    const { toast } = useToast();
    const saveProfile = useProfileSave(user?.id);
    const { form, state: notificationsState, setState: setNotificationsState } = useSettingsForm<UserProfile['notificationSettings']>(user?.id,
        userProfile?.notificationSettings || { activityDigest: 'weekly', ingestSuccess: true, ingestFail: true });
    const [isSavingNotifications, setSavingNotifications] = useState(false);

    const handleSaveNotifications = async () => {
        if (!user || isSavingNotifications) return;
        const submitted = form.getValues();
        setSavingNotifications(true);
        try {
            if (!await saveProfile({ notificationSettings: submitted })) return;
            form.reset(submitted, { keepDirtyValues: false });
            toast({ title: 'Notifications Saved', status: 'success' });
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
    };
}
