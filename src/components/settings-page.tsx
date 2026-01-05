
'use client';

import { useToast } from '@/components/toast-provider';

import { Tabs } from '@heroui/react';
import { authFetch } from '@/lib/api-client';
import { ProfileSettings } from './settings/profile-settings';
import { GeneralSettings } from './settings/general-settings';
import { DataSettings } from './settings/data-settings';
import { NotificationsSettings } from './settings/notifications-settings';
import { BillingSettings } from './settings/billing-settings';
import { ClientOnly } from './client-only';
import { useSearchParams, useRouter } from 'next/navigation';
import React, { useState, useEffect } from 'react';
import { useUser, useAuth } from '@/lib/firebase/provider';
import { useUserProfile } from '@/hooks/firebase/use-user-profile';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { ingestFiles } from '@/app/actions/ingest-files';
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

    // State, Loading, Forms (Same as before)
    const [profileState, setProfileState] = useState({ firstName: '', lastName: '' });
    const [generalState, setGeneralState] = useState({ timezone: '' });
    const [notificationsState, setNotificationsState] = useState({
        activityDigest: 'weekly' as 'off' | 'weekly' | 'monthly',
        ingestSuccess: true,
        ingestFail: true,
    });
    const [dataState, setDataState] = useState({ deletionPolicy: 'never' });

    const [isSavingProfile, setSavingProfile] = useState(false);
    const [isSavingPassword, setSavingPassword] = useState(false);
    const [isSavingGeneral, setSavingGeneral] = useState(false);
    const [isSavingNotifications, setSavingNotifications] = useState(false);
    const [isSavingData, setSavingData] = useState(false);
    const [isIngesting, startIngestTransition] = React.useTransition();
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

    // Effects (Same as before)
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

            setProfileState({
                firstName: userProfile.firstName || '',
                lastName: userProfile.lastName || '',
            });

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
                setDataState({ deletionPolicy: userProfile.storageSettings?.deletionPolicy || 'never' });
            }
        }
    }, [userProfile, profileForm]); // Removed specific refs dependencies as they are refs

    const router = useRouter();
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
                const result = await syncGoogleContacts(code, state);
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
            await authFetch('/api/user/profile', { method: 'PATCH', body: JSON.stringify({ storageSettings: { deletionPolicy: dataState.deletionPolicy } }) });
            toast({ title: 'Policy Saved', status: 'success' });
            dataDirtyRef.current = false;
        } catch { toast({ title: 'Save Failed', status: 'danger' }); } finally { setSavingData(false); }
    };

    const handleIngest = () => {
        startIngestTransition(async () => {
            const result = await ingestFiles();
            if (result.error) {
                toast({ title: 'Ingest Error', description: result.error, status: 'danger' });
            } else {
                toast({ title: 'Ingest Complete', description: `Ingested ${result.processedCount} files.`, status: 'success' });
            }
        });
    };

    // Google Auth helpers
    const redirectToGoogleAuth = async () => { const { url } = await getGoogleAuthUrl(); window.location.href = url; };
    const handleConnectGoogle = () => { hasConsented ? redirectToGoogleAuth() : setShowConnectDialog(true); };
    const onDialogConfirm = () => { setHasConsented(true); setShowConnectDialog(false); redirectToGoogleAuth(); };

    const isLoading = isUserLoading || isProfileLoading;

    const tabs = [
        { id: 'profile', label: 'Profile', icon: '👤' },
        { id: 'general', label: 'General', icon: '⚙️' },
        { id: 'data', label: 'Data', icon: '💾' },
        { id: 'notifications', label: 'Notifications', icon: '🔔' },
        ...(showBilling ? [{ id: 'billing', label: 'Billing', icon: '💳' }] : []),
    ];

    const [activeTab, setActiveTab] = useState(defaultTab);

    // Sync active tab with URL if needed, or just initialize. 
    // For now, we prefer internal state to avoid excessive URL updates or simple syncing.
    useEffect(() => {
        if (defaultTab && tabs.some(t => t.id === defaultTab)) {
            setActiveTab(defaultTab);
        }
    }, [defaultTab]);




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

    return (
        <div className="w-full h-full min-h-screen p-6 relative">
            {/* Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl opacity-40 animate-pulse" />
                <div className="absolute bottom-[-10%] left-[-5%] w-[600px] h-[600px] rounded-full bg-secondary/5 blur-3xl opacity-40" />
            </div>

            <div className="max-w-[1600px] mx-auto space-y-8">
                <div className="flex flex-col gap-2">
                    <h1 className="text-4xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                        Settings
                    </h1>
                    <p className="text-default-500 text-lg">Manage your account, data, and application preferences.</p>
                </div>

                <div className="flex flex-col lg:flex-row gap-8 items-start">
                    {/* Sidebar Navigation */}
                    <aside className="w-full lg:w-72 flex-shrink-0">
                        <div className="sticky top-6 flex flex-col gap-2 p-2 rounded-2xl bg-card/30 backdrop-blur-md border border-default-200/50">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left group ${activeTab === tab.id
                                        ? 'bg-primary/10 text-primary font-medium shadow-sm'
                                        : 'text-default-500 hover:text-foreground hover:bg-default-100'
                                        }`}
                                >
                                    <span className="text-xl group-hover:scale-110 transition-transform">{tab.icon}</span>
                                    <span>{tab.label}</span>
                                    {activeTab === tab.id && (
                                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </aside>

                    {/* Main Content Area */}
                    <main className="flex-1 w-full min-w-0">
                        <div className="bg-card/70 backdrop-blur-xl border border-default-200/50 shadow-xl rounded-3xl p-6 lg:p-8 min-h-[600px] transition-all duration-300">
                            <ClientOnly>
                                <div className={activeTab === 'profile' ? 'block' : 'hidden'}>
                                    <ProfileSettings
                                        user={user!}
                                        profileForm={profileForm}
                                        passwordForm={passwordForm}
                                        onUpdateProfile={handleUpdateProfile}
                                        onChangePassword={handleChangePassword}
                                        isProfileSaving={isSavingProfile}
                                        isPasswordSaving={isSavingPassword}
                                    />
                                </div>
                                <div className={activeTab === 'general' ? 'block' : 'hidden'}>
                                    <GeneralSettings
                                        settings={generalState}
                                        onSettingsChange={(newSettings) => {
                                            generalDirtyRef.current = true;
                                            setGeneralState(newSettings);
                                        }}
                                        onSave={handleSaveGeneral}
                                        isSaving={isSavingGeneral}
                                    />
                                </div>
                                <div className={activeTab === 'data' ? 'block' : 'hidden'}>
                                    <DataSettings
                                        userProfile={userProfile}
                                        settings={dataState}
                                        onSettingsChange={(newSettings) => {
                                            dataDirtyRef.current = true;
                                            setDataState(newSettings);
                                        }}
                                        onSave={handleSaveData}
                                        isSaving={isSavingData}
                                        onIngest={handleIngest}
                                        isIngesting={isIngesting}
                                        onConnectGoogle={handleConnectGoogle}
                                        isSyncing={isSyncing}
                                        showConnectDialog={showConnectDialog}
                                        onDialogConfirm={onDialogConfirm}
                                        onOpenChangeDialog={setShowConnectDialog}
                                    />
                                </div>
                                <div className={activeTab === 'notifications' ? 'block' : 'hidden'}>
                                    <NotificationsSettings
                                        settings={notificationsState}
                                        onSettingsChange={(newSettings) => {
                                            notificationsDirtyRef.current = true;
                                            setNotificationsState(newSettings);
                                        }}
                                        onSave={handleSaveNotifications}
                                        isSaving={isSavingNotifications}
                                    />
                                </div>
                                {showBilling && (
                                    <div className={activeTab === 'billing' ? 'block' : 'hidden'}>
                                        <BillingSettings invoices={[]} isLoading={false} />
                                    </div>
                                )}
                            </ClientOnly>
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}

