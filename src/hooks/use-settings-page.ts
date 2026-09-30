import { useState, useRef, useEffect, useTransition, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useToast } from '@/components/toast-provider';
import { useUser } from '@/lib/auth/client';
import { useUserProfile } from '@/hooks/firebase/use-user-profile';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthActions } from '@/lib/auth/client';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { getGoogleAuthUrl } from '@/app/actions/google-auth';
import { syncGoogleContacts } from '@/app/actions/contacts';

// Extracted Hooks
import { useProfileSettings } from '@/hooks/settings/use-profile-settings';
import { useNotificationSettings } from '@/hooks/settings/use-notification-settings';
import { usePreferenceSettings } from '@/hooks/settings/use-preference-settings';

const passwordFormSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required for security.'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters long.'),
    confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
    message: "New passwords don't match",
    path: ['confirmPassword'],
});

export function useSettingsPage() {
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const showBilling = process.env.NEXT_PUBLIC_ENABLE_BILLING === 'true';
    const defaultTab = searchParams.get('tab') || 'profile';

    const { user, isUserLoading } = useUser();
    const { userProfile, isProfileLoading } = useUserProfile(user);
    const actions = useAuthActions();

    // Extracted Hooks Usage
    const {
        profileForm,
        isSavingProfile,
        handleUpdateProfile
    } = useProfileSettings(user, userProfile);

    const {
        notificationsState,
        setNotificationsState,
        isSavingNotifications,
        handleSaveNotifications,
        notificationsDirtyRef
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
        dataDirtyRef
    } = usePreferenceSettings(user, userProfile);

    // Password State
    const [isSavingPassword, setSavingPassword] = useState(false);
    const passwordForm = useForm<z.infer<typeof passwordFormSchema>>({
        resolver: zodResolver(passwordFormSchema),
        defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' }
    });

    // View State
    const [activeTab, setActiveTab] = useState(defaultTab);
    const [view, setView] = useState<'list' | 'detail'>('list');

    // Google Sync State
    const [isSyncing, startSyncTransition] = useTransition();
    const [showConnectDialog, setShowConnectDialog] = useState(false);
    const [hasConsented, setHasConsented] = useLocalStorage('google-contact-consent', false);
    const processedCodeRef = useRef<string | null>(null);

    // Auth protection
    useEffect(() => {
        if (!isUserLoading && !user) router.replace('/login');
    }, [user, isUserLoading, router]);

    // Google Sync Logic
    useEffect(() => {
        const code = searchParams.get('g_code');
        const state = searchParams.get('g_state');
        const error = searchParams.get('error');

        // 1. Handle Error
        if (error) {
            toast({ title: 'Google Sync Failed', description: error.replace(/\+/g, ' ') || 'Could not sync with your Google account.', status: 'danger' });
            // Clean URL
            const newParams = new URLSearchParams(searchParams.toString());
            newParams.delete('error');
            router.replace(`/settings?${newParams.toString()}`, { scroll: false });
            return;
        }

        // 2. Handle Sync
        if (code && state && !isSyncing) {
            // 3. De-duplicate using Ref and SessionStorage (for Strict Mode/Dev resilience)
            if (typeof window !== 'undefined') {
                const storageKey = `google_sync_${code}`;
                if (sessionStorage.getItem(storageKey)) {

                    // Ensure URL is clean if we skipped
                    const newParams = new URLSearchParams(searchParams.toString());
                    newParams.delete('g_code');
                    newParams.delete('g_state');
                    // Only replace if params exist to avoid loop
                    if (searchParams.has('g_code')) {
                        router.replace(`/settings?${newParams.toString()}`, { scroll: false });
                    }
                    return;
                }
                sessionStorage.setItem(storageKey, 'processing');
            }

            if (processedCodeRef.current === code) return;
            processedCodeRef.current = code; // Mark as processing immediately

            startSyncTransition(async () => {

                try {
                    // Start a timeout race to detect hangs
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Request timed out after 30s')), 30000)
                    );


                    const result = await Promise.race([
                        syncGoogleContacts(code),
                        timeoutPromise
                    ]) as Awaited<ReturnType<typeof syncGoogleContacts>>;


                    if (result.success) {
                        toast({ title: 'Sync Started', description: result.message || 'Contacts are syncing in the background.', status: 'success' });
                    } else {
                        toast({ title: 'Sync Failed', description: result.error, status: 'danger' });
                    }
                } catch (err) {
                    console.error('Google sync error:', err);
                    toast({ title: 'Sync Error', description: err instanceof Error ? err.message : 'Unexpected error', status: 'danger' });
                } finally {
                    // Clean URL AFTER action completes to prevent cancellation

                    const newParams = new URLSearchParams(searchParams.toString());
                    newParams.delete('g_code');
                    newParams.delete('g_state');
                    router.replace(`/settings?${newParams.toString()}`, { scroll: false });
                }
            });
        }
    }, [searchParams, isSyncing, router, toast]);

    // View Logic
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab) {
            setActiveTab(tab);
            setView('detail');
        }
    }, [searchParams]);

    const handleChangePassword = async (values: z.infer<typeof passwordFormSchema>) => {
        if (!user || !user.email) return;
        setSavingPassword(true);
        try {
            await actions.changePassword(values.currentPassword, values.newPassword);
            toast({ title: 'Password Changed', description: 'Please log in again.', status: 'success' });
            setTimeout(() => actions.signOut(), 3000);
        } catch (error: unknown) {
            const authError = error as { code?: string; message?: string };
            const msg = authError.code === 'auth/wrong-password' ? 'Incorrect password.' : authError.message;
            toast({ title: 'Password Change Failed', description: msg, status: 'danger' });
        } finally {
            setSavingPassword(false);
            passwordForm.reset();
        }
    };

    const handleConnectGoogle = () => {
        if (hasConsented) {
            getGoogleAuthUrl().then(({ url }) => window.location.href = url);
        } else {
            setShowConnectDialog(true);
        }
    };

    const onDialogConfirm = () => {
        setHasConsented(true);
        setShowConnectDialog(false);
        getGoogleAuthUrl().then(({ url }) => window.location.href = url);
    };

    const handleTabSelect = (tabId: string) => {
        setActiveTab(tabId);
        setView('detail');
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', tabId);
        router.replace(`/settings?${params.toString()}`);
    };

    const handleBack = () => setView('list');

    const tabs = useMemo(() => [
        { id: 'profile', label: 'Profile', icon: '👤' },
        { id: 'general', label: 'General', icon: '⚙️' },
        { id: 'data', label: 'Data', icon: '💾' },
        { id: 'notifications', label: 'Notifications', icon: '🔔' },
        ...(showBilling ? [{ id: 'billing', label: 'Billing', icon: '💳' }] : []),
    ], [showBilling]);

    return {
        // State
        user,
        userProfile,
        isLoading: isUserLoading || isProfileLoading,
        profileForm,
        passwordForm,
        generalState,
        setGeneralState,
        notificationsState,
        setNotificationsState,
        dataState,
        setDataState,
        activeTab,
        view,
        tabs,
        showBilling,
        isSyncing,
        showConnectDialog,
        setShowConnectDialog,

        // Saving States
        isSavingProfile,
        isSavingPassword,
        isSavingGeneral,
        isSavingNotifications,
        isSavingData,

        // Refs
        generalDirtyRef,
        notificationsDirtyRef,
        dataDirtyRef,

        // Handlers
        handleUpdateProfile,
        handleChangePassword,
        handleSaveGeneral,
        handleSaveNotifications,
        handleSaveData,
        handleConnectGoogle,
        onDialogConfirm,
        handleTabSelect,
        handleBack
    };
}
