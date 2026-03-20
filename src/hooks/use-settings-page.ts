import { zodResolver } from '@hookform/resolvers/zod';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { useToast } from '@/components/toast-provider';
import { useUserProfile } from '@/hooks/firebase/use-user-profile';
import { useGoogleSync } from '@/hooks/settings/use-google-sync';
import { useNotificationSettings } from '@/hooks/settings/use-notification-settings';
import { usePreferenceSettings } from '@/hooks/settings/use-preference-settings';
import { useProfileSettings } from '@/hooks/settings/use-profile-settings';
import { useExportJob } from '@/hooks/settings/use-export-job';
import { buildSettingsPath, buildSettingsTabs, passwordFormSchema, type SettingsTab } from '@/hooks/settings/use-settings-page-utils';
import { buildCurrentPath, buildLoginRedirectHref } from '@/lib/auth-redirect';
import { useAuth, useUser } from '@/lib/firebase/provider';

export type { SettingsTab } from '@/hooks/settings/use-settings-page-utils';

export function useSettingsPage() {
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const auth = useAuth();

    const showBilling = process.env.NEXT_PUBLIC_ENABLE_BILLING === 'true';
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
        notificationsDirtyRef,
    } = useNotificationSettings(userProfile);

    const {
        generalState,
        setGeneralState,
        isSavingGeneral,
        handleSaveGeneral,
        generalDirtyRef,
        dataState,
        setDataState,
        isSavingData,
        handleSaveData,
        dataDirtyRef,
    } = usePreferenceSettings(user, userProfile);

    const [isSavingPassword, setSavingPassword] = useState(false);
    const handledBillingStateRef = useRef<string | null>(null);
    const passwordForm = useForm<z.infer<typeof passwordFormSchema>>({
        resolver: zodResolver(passwordFormSchema),
        defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    });

    const [activeTab, setActiveTab] = useState(defaultTab);
    const [view, setView] = useState<'list' | 'detail'>('list');

    const {
        isSyncing,
        showConnectDialog,
        setShowConnectDialog,
        handleConnectGoogle,
        onDialogConfirm,
    } = useGoogleSync({ googleSync: userProfile?.googleSync, refetchProfile: refetchUserProfile, searchParams, router, toast });

    const { exportJob, isExportStarting, handleStartExport } = useExportJob(toast);

    useEffect(() => {
        if (!isUserLoading && !user) {
            router.replace(buildLoginRedirectHref(buildCurrentPath('/settings', searchParams.toString())));
        }
    }, [isUserLoading, router, searchParams, user]);

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab) {
            setActiveTab(tab === 'overview' ? 'profile' : tab === 'data' ? 'sources' : tab);
            setView('detail');
        }
    }, [searchParams]);

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
            setActiveTab('billing');
            setView('detail');
        }

        if (success) {
            toast({
                title: 'Payment Successful',
                description: 'Your billing details have been updated.',
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
        if (!user || !user.email) {
            return;
        }

        setSavingPassword(true);
        try {
            const credential = EmailAuthProvider.credential(user.email, values.currentPassword);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, values.newPassword);
            toast({ title: 'Password Changed', description: 'Please log in again.', status: 'success' });
            setTimeout(() => auth.signOut(), 3000);
        } catch (error: unknown) {
            const firebaseError = error as { code?: string; message?: string };
            const message = firebaseError.code === 'auth/wrong-password' ? 'Incorrect password.' : firebaseError.message;
            toast({ title: 'Password Change Failed', description: message, status: 'danger' });
        } finally {
            setSavingPassword(false);
            passwordForm.reset();
        }
    };

    const handleTabSelect = (tabId: string) => {
        setActiveTab(tabId);
        setView('detail');

        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', tabId);
        router.replace(buildSettingsPath(params));
    };

    const tabs = useMemo<SettingsTab[]>(
        () => buildSettingsTabs(showBilling),
        [showBilling]
    );

    const updateGeneralState = useCallback(
        (newSettings: { timezone: string }) => {
            generalDirtyRef.current = true;
            setGeneralState(newSettings);
        },
        [generalDirtyRef, setGeneralState]
    );

    const updateDataState = useCallback(
        (newSettings: typeof dataState) => {
            dataDirtyRef.current = true;
            setDataState(newSettings);
        },
        [dataDirtyRef, setDataState]
    );

    const updateNotificationsState = useCallback(
        (newSettings: {
            activityDigest: 'off' | 'weekly' | 'monthly';
            ingestSuccess: boolean;
            ingestFail: boolean;
        }) => {
            notificationsDirtyRef.current = true;
            setNotificationsState(newSettings);
        },
        [notificationsDirtyRef, setNotificationsState]
    );

    return {
        user,
        userProfile,
        isLoading: isUserLoading || isProfileLoading,
        profileForm,
        passwordForm,
        generalState,
        setGeneralState,
        updateGeneralState,
        notificationsState,
        setNotificationsState,
        updateNotificationsState,
        dataState,
        setDataState,
        updateDataState,
        activeTab,
        view,
        tabs,
        showBilling,
        isSyncing,
        showConnectDialog,
        setShowConnectDialog,
        isSavingProfile,
        isSavingPassword,
        isSavingGeneral,
        isSavingNotifications,
        isSavingData,
        generalDirtyRef,
        notificationsDirtyRef,
        dataDirtyRef,
        handleUpdateProfile,
        handleChangePassword,
        handleSaveGeneral,
        handleSaveNotifications,
        handleSaveData,
        handleConnectGoogle,
        onDialogConfirm,
        handleTabSelect,
        handleBack: () => setView('list'),
        exportJob,
        isExportStarting,
        handleStartExport,
    };
}
