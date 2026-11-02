import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { z } from 'zod';
import { useToast } from '@/components/toast-provider';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useGoogleSync } from '@/hooks/settings/use-google-sync';
import { useNotificationSettings } from '@/hooks/settings/use-notification-settings';
import { usePreferenceSettings } from '@/hooks/settings/use-preference-settings';
import { useProfileSettings } from '@/hooks/settings/use-profile-settings';
import { useExportJob } from '@/hooks/settings/use-export-job';
import { buildSettingsPath, buildSettingsTabs, passwordFormSchema, type SettingsTab } from '@/hooks/settings/use-settings-page-utils';
import { buildCurrentPath, buildLoginRedirectHref } from '@/lib/auth-redirect';
import { useAuthActions, useUser } from '@/lib/auth/client';
import { publicEnv } from '@/lib/public-env';
import { useSettingsForm } from '@/hooks/settings/use-settings-form';

export type { SettingsTab } from '@/hooks/settings/use-settings-page-utils';

export function useSettingsPage() {
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const auth = useAuthActions();

    const showBilling = publicEnv.NEXT_PUBLIC_ENABLE_BILLING;
    const requestedTab = searchParams.get('tab') || 'profile';
    const defaultTab = requestedTab === 'overview'
        ? 'profile'
        : requestedTab === 'data'
            ? 'sources'
            : requestedTab;

    const { user, isUserLoading } = useUser();
    const { userProfile, isProfileLoading, refetch: refetchUserProfile } = useUserProfile(user);

    const { profileForm, isSavingProfile, handleUpdateProfile } = useProfileSettings(user, userProfile);

    const {
        notificationsState,
        setNotificationsState,
        isSavingNotifications,
        handleSaveNotifications,
    } = useNotificationSettings(user, userProfile);

    const {
        generalState,
        setGeneralState,
        isSavingGeneral,
        handleSaveGeneral,
        dataState,
        setDataState,
        isSavingData,
        handleSaveData,
    } = usePreferenceSettings(user, userProfile);

    const [isSavingPassword, setSavingPassword] = useState(false);
    const handledBillingStateRef = useRef<string | null>(null);
    const { form: passwordForm } = useSettingsForm<z.infer<typeof passwordFormSchema>>(user?.id, {
        currentPassword: '', newPassword: '', confirmPassword: '',
    }, {
        resolver: zodResolver(passwordFormSchema),
    });
    const passwordSubject = useRef(user?.id);
    useEffect(() => { passwordSubject.current = user?.id; }, [user?.id]);

    const activeTab = defaultTab;
    const view = searchParams.has('tab') ? 'detail' as const : 'list' as const;

    const {
        isSyncing,
        isDisconnecting,
        showConnectDialog,
        setShowConnectDialog,
        handleConnectGoogle,
        handleDisconnectGoogle,
        onDialogConfirm,
    } = useGoogleSync({ googleSync: userProfile?.googleSync, refetchProfile: refetchUserProfile, searchParams, router, toast });

    const { exportJob, isExportStarting, handleStartExport, handleRetryExport } = useExportJob(toast);

    useEffect(() => {
        if (!isUserLoading && !user) {
            router.replace(buildLoginRedirectHref(buildCurrentPath('/settings', searchParams.toString())));
        }
    }, [isUserLoading, router, searchParams, user]);

    useEffect(() => {
        const success = searchParams.get('success');
        const canceled = searchParams.get('canceled');

        if (!success && !canceled) {
            handledBillingStateRef.current = null;
            return;
        }

        const flashKey = `${success || ''}|${canceled || ''}`;
        if (handledBillingStateRef.current === flashKey) {
            return;
        }
        handledBillingStateRef.current = flashKey;

        const newParams = new URLSearchParams(searchParams.toString());
        newParams.delete('success');
        newParams.delete('canceled');

        if (showBilling) {
            newParams.set('tab', 'billing');
        }

        if (success) {
            toast({
                title: 'Payment Successful',
                status: 'success',
            });
        }

        if (canceled) {
            toast({
                title: 'Checkout Canceled',
                description: 'No changes were made to your subscription.',
                status: 'warning',
            });
        }

        router.replace(buildSettingsPath(newParams));
    }, [router, searchParams, showBilling, toast]);

    const handleChangePassword = async (values: z.infer<typeof passwordFormSchema>) => {
        if (!user || !user.email || isSavingPassword) {
            return;
        }
        const subject = user.id;
        setSavingPassword(true);
        try {
            await auth.changePassword(values.currentPassword, values.newPassword);
            if (passwordSubject.current !== subject) return;
            toast({ title: 'Password Changed', description: 'Please log in again.', status: 'success' });
            setTimeout(() => { if (passwordSubject.current === subject) void auth.signOut(); }, 3000);
        } catch (error: unknown) {
            if (passwordSubject.current !== subject) return;
            const message = error instanceof Error ? error.message : 'Password change failed.';
            toast({ title: 'Password Change Failed', description: message, status: 'danger' });
        } finally {
            setSavingPassword(false);
            if (passwordSubject.current === subject) passwordForm.reset(undefined, { keepDirtyValues: false });
        }
    };

    const handleTabSelect = (tabId: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', tabId);
        window.history.pushState({ vosiftSettingsSection: true }, '', buildSettingsPath(params));
    };

    const tabs = useMemo<SettingsTab[]>(
        () => buildSettingsTabs(showBilling),
        [showBilling]
    );

    return {
        user,
        userProfile,
        isLoading: isUserLoading || isProfileLoading,
        profileForm,
        passwordForm,
        generalState,
        setGeneralState,
        updateGeneralState: setGeneralState,
        notificationsState,
        setNotificationsState,
        updateNotificationsState: setNotificationsState,
        dataState,
        setDataState,
        updateDataState: setDataState,
        activeTab,
        view,
        tabs,
        showBilling,
        isSyncing,
        isDisconnecting,
        showConnectDialog,
        setShowConnectDialog,
        isSavingProfile,
        isSavingPassword,
        isSavingGeneral,
        isSavingNotifications,
        isSavingData,
        handleUpdateProfile,
        handleChangePassword,
        handleSaveGeneral,
        handleSaveNotifications,
        handleSaveData: () => handleSaveData(activeTab === 'retention' ? 'retention' : 'processing'),
        handleConnectGoogle,
        handleDisconnectGoogle,
        onDialogConfirm,
        handleTabSelect,
        handleBack: () => {
            if (window.history.state?.vosiftSettingsSection) { window.history.back(); return; }
            const params = new URLSearchParams(searchParams.toString());
            params.delete('tab');
            window.history.replaceState(null, '', buildSettingsPath(params));
        },
        exportJob,
        isExportStarting,
        handleStartExport,
        handleRetryExport,
    };
}
