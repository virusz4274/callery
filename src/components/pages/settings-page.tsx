
'use client';

import { useToast } from '@/components/toast-provider';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
// Tabs removed as we use custom list now.
import { authFetch } from '@/lib/api-client';
import { ProfileSettings } from '@/components/settings/profile-settings';
import { GeneralSettings } from '@/components/settings/general-settings';
import { DataSettings } from '@/components/settings/data-settings';
import { NotificationsSettings } from '@/components/settings/notifications-settings';
import { BillingSettings } from '@/components/settings/billing-settings';
import { ClientOnly } from '@/components/client-only';
import { useSearchParams, useRouter } from 'next/navigation';
import React, { useState, useEffect } from 'react';
import { useUser, useAuth } from '@/lib/firebase/provider';
import { useUserProfile } from '@/hooks/firebase/use-user-profile';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

import { getGoogleAuthUrl } from '@/app/actions/google-auth';
import { syncGoogleContacts } from '@/app/actions/contacts';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { Skeleton } from '@heroui/react';

const profileFormSchema = z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
});

const passwordFormSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required for security.'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters long.'),
    confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
    message: "New passwords don't match",
    path: ['confirmPassword'],
});

export function SettingsPage() {
    const { toast } = useToast();
    const showBilling = process.env.NEXT_PUBLIC_FEATURE_BILLING_ENABLED === 'true';
    const searchParams = useSearchParams();
    const defaultTab = searchParams.get('tab') || 'profile';

    const { user, isUserLoading } = useUser();
    const { userProfile, isProfileLoading } = useUserProfile(user);
    const auth = useAuth();

    // State, Loading, Forms
    // Removed unused profileState

    const [generalState, setGeneralState] = useState({ timezone: '' });
    const [notificationsState, setNotificationsState] = useState({
        activityDigest: 'weekly' as 'off' | 'weekly' | 'monthly',
        ingestSuccess: true,
        ingestFail: true,
    });
    const [dataState, setDataState] = useState({
        deletionPolicy: 'never',
        transcriptionSettings: { autoTranscribe: true }
    });

    const [isSavingProfile, setSavingProfile] = useState(false);
    const [isSavingPassword, setSavingPassword] = useState(false);
    const [isSavingGeneral, setSavingGeneral] = useState(false);
    const [isSavingNotifications, setSavingNotifications] = useState(false);
    const [isSavingData, setSavingData] = useState(false);

    const [isSyncing, startSyncTransition] = React.useTransition();

    const [showConnectDialog, setShowConnectDialog] = useState(false);
    const [hasConsented, setHasConsented] = useLocalStorage('google-contact-consent', false);

    const profileForm = useForm<z.infer<typeof profileFormSchema>>({
        resolver: zodResolver(profileFormSchema),
        defaultValues: { firstName: '', lastName: '' },
    });
    const passwordForm = useForm<z.infer<typeof passwordFormSchema>>({
        resolver: zodResolver(passwordFormSchema),
        defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' }
    });

    // Effects
    const lastProfileRef = React.useRef('');

    // Dirty Start Tracking
    const generalDirtyRef = React.useRef(false);
    const notificationsDirtyRef = React.useRef(false);
    const dataDirtyRef = React.useRef(false);

    // Effects


    useEffect(() => {
        if (userProfile) {
            // Check if profile actually changed to avoid overwriting user input on re-renders
            const profileHash = JSON.stringify({
                firstName: userProfile.firstName,
                lastName: userProfile.lastName,
                timezone: userProfile.timezone,
                notifications: userProfile.notificationSettings,
                storage: userProfile.storageSettings
            });

            if (profileHash === lastProfileRef.current) {
                return;
            }
            lastProfileRef.current = profileHash;

            // Removed setProfileState calls as state was unused

            // Only reset form if we have fresh data differing from what we last saw AND user hasn't started typing
            if (!profileForm.formState.isDirty) {
                profileForm.reset({
                    firstName: userProfile.firstName || '',
                    lastName: userProfile.lastName || '',
                });
            }

            // Only update if not dirty
            if (!generalDirtyRef.current) {
                setGeneralState({ timezone: userProfile.timezone || '' });
            }

            if (userProfile.notificationSettings && !notificationsDirtyRef.current) {
                setNotificationsState(userProfile.notificationSettings);
            }

            if (!dataDirtyRef.current) {
                setDataState({
                    deletionPolicy: userProfile.storageSettings?.deletionPolicy || 'never',
                    transcriptionSettings: userProfile.transcriptionSettings || { autoTranscribe: true }
                });
            }
        }
    }, [userProfile, profileForm]); // Removed specific refs dependencies as they are refs

    const router = useRouter();

    // Protect the page - redirect to login if not authenticated
    useEffect(() => {
        if (!isUserLoading && !user) {
            router.replace('/login');
        }
    }, [user, isUserLoading, router]);
    const processedCodeRef = React.useRef<string | null>(null);

    useEffect(() => {
        const code = searchParams.get('g_code');
        const state = searchParams.get('g_state');
        const error = searchParams.get('error');

        if (error) {
            toast({ title: 'Google Sync Failed', description: error.replace(/\+/g, ' ') || 'Could not sync with your Google account.', status: 'danger' });
            // Clean up error params
            const newParams = new URLSearchParams(searchParams.toString());
            newParams.delete('error');
            router.replace(`/settings?${newParams.toString()}`);
        } else if (code && state && !isSyncing) {
            // Prevent double-execution for the same code
            if (processedCodeRef.current === code) return;
            processedCodeRef.current = code;

            startSyncTransition(async () => {
                const result = await syncGoogleContacts(code);
                if (result.success) {
                    toast({ title: 'Sync Successful', description: `${result.count} contacts were found and synced.`, status: 'success' });
                } else {
                    toast({ title: 'Sync Failed', description: result.error, status: 'danger' });
                }

                // Clean up URL parameters to prevent re-execution on refresh
                const newParams = new URLSearchParams(searchParams.toString());
                newParams.delete('g_code');
                newParams.delete('g_state');
                router.replace(`/settings?${newParams.toString()}`);
            });
        }
    }, [searchParams, isSyncing, router, toast]);

    // ... (imports)

    // ... (inside component)

    // Handlers
    const handleUpdateProfile = async (values: z.infer<typeof profileFormSchema>) => {
        if (!user) return;
        setSavingProfile(true);
        try {
            const response = await authFetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstName: values.firstName, lastName: values.lastName }),
            });
            if (!response.ok) throw new Error('Failed to update profile');
            toast({ title: 'Profile Updated', status: 'success' });
            // Profile form handles its own dirty state via react-hook-form
        } catch (error: unknown) {
            toast({ title: 'Update Failed', description: error instanceof Error ? error.message : 'Unknown error', status: 'danger' });
        } finally {
            setSavingProfile(false);
        }
    };

    const handleChangePassword = async (values: z.infer<typeof passwordFormSchema>) => {
        if (!user || !user.email) return;
        setSavingPassword(true);
        try {
            const credential = EmailAuthProvider.credential(user.email, values.currentPassword);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, values.newPassword);
            toast({ title: 'Password Changed', description: 'Please log in again.', status: 'success' });
            setTimeout(() => auth.signOut(), 3000);
        } catch (error: unknown) {
            const firebaseError = error as { code?: string; message?: string };
            const msg = firebaseError.code === 'auth/wrong-password' ? 'Incorrect password.' : firebaseError.message;
            toast({ title: 'Password Change Failed', description: msg, status: 'danger' });
        } finally {
            setSavingPassword(false);
            passwordForm.reset();
        }
    };

    const handleSaveGeneral = async () => {
        if (!user || !generalState.timezone) return;
        setSavingGeneral(true);
        try {
            await authFetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timezone: generalState.timezone }),
            });
            toast({ title: 'Preferences Saved', status: 'success' });
            generalDirtyRef.current = false;
        } catch { toast({ title: 'Save Failed', status: 'danger' }); } finally { setSavingGeneral(false); }
    };

    const handleSaveNotifications = async () => {
        setSavingNotifications(true);
        try {
            await authFetch('/api/user/profile', { method: 'PATCH', body: JSON.stringify({ notificationSettings: notificationsState }) });
            toast({ title: 'Notifications Saved', status: 'success' });
            notificationsDirtyRef.current = false;
        } catch { toast({ title: 'Save Failed', status: 'danger' }); } finally { setSavingNotifications(false); }
    };

    const handleSaveData = async () => {
        setSavingData(true);
        try {
            await authFetch('/api/user/profile', {
                method: 'PATCH',
                body: JSON.stringify({
                    storageSettings: { deletionPolicy: dataState.deletionPolicy },
                    transcriptionSettings: dataState.transcriptionSettings
                })
            });
            toast({ title: 'Policy Saved', status: 'success' });
            dataDirtyRef.current = false;
        } catch { toast({ title: 'Save Failed', status: 'danger' }); } finally { setSavingData(false); }
    };



    // Google Auth helpers
    const redirectToGoogleAuth = async () => { const { url } = await getGoogleAuthUrl(); window.location.href = url; };
    const handleConnectGoogle = () => {
        if (hasConsented) {
            redirectToGoogleAuth();
        } else {
            setShowConnectDialog(true);
        }
    };
    const onDialogConfirm = () => { setHasConsented(true); setShowConnectDialog(false); redirectToGoogleAuth(); };

    const isLoading = isUserLoading || isProfileLoading;

    // Use useMemo for tabs to avoid dependency warnings if passed to useEffect
    const tabs = React.useMemo(() => [
        { id: 'profile', label: 'Profile', icon: '👤' },
        { id: 'general', label: 'General', icon: '⚙️' },
        { id: 'data', label: 'Data', icon: '💾' },
        { id: 'notifications', label: 'Notifications', icon: '🔔' },
        ...(showBilling ? [{ id: 'billing', label: 'Billing', icon: '💳' }] : []),
    ], [showBilling]);

    const [activeTab, setActiveTab] = useState(defaultTab);
    const [view, setView] = useState<'list' | 'detail'>('list');

    // Sync active tab with URL if needed, or just initialize. 
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && tabs.some(t => t.id === tab)) {
            setActiveTab(tab);
            // If we have a tab in URL on load, we assume user might want to see it, 
            // but for "Settings" main link usually no tab is present, or default 'profile'.
            // If component mounts and there is a specific non-default tab, or if user navigated,
            // we should probably show detail on mobile if it's deeply linked.
            // Let's decide: if URL has tab, show detail? 
            // But 'profile' is default. If URL is just /settings, default is profile.
            // We only want to show list by default on mobile unless specifically requested?
            // Actually, for better UX on mobile, 'Settings' should land on List.
            // If I specifically go to /settings?tab=data, I definitely want to see Data.
            if (tab) {
                setView('detail');
            }
        }
    }, [searchParams, tabs]);

    const handleTabSelect = (tabId: string) => {
        setActiveTab(tabId);
        setView('detail');
        // Optional: shallow push to URL
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', tabId);
        router.replace(`/settings?${params.toString()}`);
    };

    const handleBack = () => {
        setView('list');
        // Optional: clear tab from URL? Maybe not needed for state, but cleaner for history.
        // router.replace('/settings'); 
    };

    // ... existing loading state ...

    if (isLoading) {
        return (
            <div className="w-full p-6 space-y-6">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                    <p className="text-default-500">Manage your account preferences and application settings.</p>
                </div>
                <div className="flex flex-col lg:flex-row gap-6">
                    <div className="w-full lg:w-64 space-y-2">
                        {[1, 2, 3, 4].map((i) => (
                            <Skeleton key={i} className="h-10 w-full rounded-lg" />
                        ))}
                    </div>
                    <div className="flex-1">
                        <Skeleton className="h-[500px] w-full rounded-2xl" />
                    </div>
                </div>
            </div>
        )
    }

    // New Master-Detail Layout
    return (
        <div className="w-full h-full min-h-screen p-4 sm:p-6 relative">
            {/* Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl opacity-40 animate-pulse" />
                <div className="absolute bottom-[-10%] left-[-5%] w-[600px] h-[600px] rounded-full bg-secondary/5 blur-3xl opacity-40" />
            </div>

            <div className="max-w-[1600px] mx-auto space-y-6 sm:space-y-8">
                {/* Header */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        {/* Mobile Back Button - Only visible on mobile detail view */}
                        <button
                            onClick={handleBack}
                            className={cn(
                                "lg:hidden p-2 -ml-2 rounded-full hover:bg-default-100 transition-colors",
                                view === 'list' ? "hidden" : "flex"
                            )}
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </button>

                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                            {view === 'detail' && window.innerWidth < 1024 ? tabs.find(t => t.id === activeTab)?.label || 'Settings' : 'Settings'}
                        </h1>
                    </div>
                    {/* Hide description on mobile detail view to save space? Or keep it? */}
                    <p className={cn("text-default-500 text-base sm:text-lg", view === 'detail' && "hidden lg:block")}>
                        Manage your account, data, and application preferences.
                    </p>
                </div>

                <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">

                    {/* Sidebar / Menu List */}
                    <div className={cn(
                        "w-full lg:w-72 flex-shrink-0 flex flex-col gap-2 p-2 rounded-2xl bg-card/30 backdrop-blur-md border border-default-200/50 h-fit lg:sticky lg:top-6 transition-all",
                        // Mobile Logic: Show only if view is list, or on desktop always show
                        view === 'detail' ? "hidden lg:flex" : "flex"
                    )}>
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => handleTabSelect(tab.id)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left",
                                    activeTab === tab.id
                                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 font-medium"
                                        : "hover:bg-default-100 text-foreground/80 hover:text-foreground"
                                )}
                            >
                                <span className={cn("text-xl transition-transform", activeTab === tab.id && "scale-110")}>{tab.icon}</span>
                                <span className="text-lg">{tab.label}</span>
                                {/* Mobile Arrow for drill-down feel */}
                                <ChevronRight className={cn("w-5 h-5 ml-auto opacity-50 lg:hidden", activeTab === tab.id && "opacity-100")} />
                            </button>
                        ))}
                    </div>

                    {/* Content Panel */}
                    <div className={cn(
                        "flex-1 w-full min-w-0 transition-all duration-300 min-h-[400px] lg:min-h-[600px]",
                        "p-1 lg:pl-8", // Minimal padding on mobile (let inner cards handle it), left padding on desktop for spacing
                        // Mobile Logic: Show only if view is detail, or on desktop always show
                        view === 'list' ? "hidden lg:block" : "block"
                    )}>
                        <ClientOnly>
                            {activeTab === 'profile' && (
                                <ProfileSettings
                                    user={user!}
                                    profileForm={profileForm}
                                    passwordForm={passwordForm}
                                    onUpdateProfile={handleUpdateProfile}
                                    onChangePassword={handleChangePassword}
                                    isProfileSaving={isSavingProfile}
                                    isPasswordSaving={isSavingPassword}
                                />
                            )}
                            {activeTab === 'general' && (
                                <GeneralSettings
                                    settings={generalState}
                                    onSettingsChange={(newSettings: { timezone: string }) => {
                                        generalDirtyRef.current = true;
                                        setGeneralState(newSettings);
                                    }}
                                    onSave={handleSaveGeneral}
                                    isSaving={isSavingGeneral}
                                />
                            )}
                            {activeTab === 'data' && (
                                <DataSettings
                                    userProfile={userProfile}
                                    settings={dataState}
                                    onSettingsChange={(newSettings: { deletionPolicy: string; transcriptionSettings: { autoTranscribe: boolean } }) => {
                                        dataDirtyRef.current = true;
                                        setDataState(newSettings);
                                    }}
                                    onSave={handleSaveData}
                                    isSaving={isSavingData}

                                    onConnectGoogle={handleConnectGoogle}
                                    isSyncing={isSyncing}
                                    showConnectDialog={showConnectDialog}
                                    onDialogConfirm={onDialogConfirm}
                                    onOpenChangeDialog={setShowConnectDialog}
                                />
                            )}
                            {activeTab === 'notifications' && (
                                <NotificationsSettings
                                    settings={notificationsState}
                                    onSettingsChange={(newSettings: { activityDigest: 'off' | 'weekly' | 'monthly'; ingestSuccess: boolean; ingestFail: boolean }) => {
                                        notificationsDirtyRef.current = true;
                                        setNotificationsState(newSettings);
                                    }}
                                    onSave={handleSaveNotifications}
                                    isSaving={isSavingNotifications}
                                />
                            )}
                            {showBilling && activeTab === 'billing' && (
                                <BillingSettings invoices={[]} isLoading={false} />
                            )}
                        </ClientOnly>
                    </div>
                </div>
            </div>
        </div>
    );
}
