
'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileSettings } from './settings/profile-settings';
import { GeneralSettings } from './settings/general-settings';
import { DataSettings } from './settings/data-settings';
import { NotificationsSettings } from './settings/notifications-settings';
import { BillingSettings } from './settings/billing-settings';
import { ClientOnly } from './client-only';
import { useSearchParams } from 'next/navigation';
import React, { useState, useEffect } from 'react';
import { useUser, useUserProfile, useFirestore, useAuth } from '@/firebase';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { doc, updateDoc } from 'firebase/firestore';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Skeleton } from './ui/skeleton';
import { ingestFiles } from '@/app/actions/ingest-files';
import { getGoogleAuthUrl } from '@/app/actions/google-auth';
import { syncGoogleContacts } from '@/app/actions/contacts';
import { useLocalStorage } from '@/hooks/use-local-storage';

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
    const showBilling = process.env.NEXT_PUBLIC_FEATURE_BILLING_ENABLED === 'true';
    const searchParams = useSearchParams();
    const router = useSearchParams();
    const tab = searchParams.get('tab') || 'profile';

    const { user, isUserLoading } = useUser();
    const { userProfile, isProfileLoading } = useUserProfile(user);
    const firestore = useFirestore();
    const auth = useAuth();
    const { toast } = useToast();

    // State for all settings, centralized here
    const [profileState, setProfileState] = useState({ firstName: '', lastName: '' });
    const [generalState, setGeneralState] = useState({ timezone: '' });
    const [notificationsState, setNotificationsState] = useState({
        activityDigest: 'weekly' as 'off' | 'weekly' | 'monthly',
        ingestSuccess: true,
        ingestFail: true,
    });
    const [dataState, setDataState] = useState({ deletionPolicy: 'never' });

    // Loading states
    const [isSavingProfile, setSavingProfile] = useState(false);
    const [isSavingPassword, setSavingPassword] = useState(false);
    const [isSavingGeneral, setSavingGeneral] = useState(false);
    const [isSavingNotifications, setSavingNotifications] = useState(false);
    const [isSavingData, setSavingData] = useState(false);
    const [isIngesting, startIngestTransition] = React.useTransition();
    const [isSyncing, startSyncTransition] = React.useTransition();

    const [showConnectDialog, setShowConnectDialog] = useState(false);
    const [hasConsented, setHasConsented] = useLocalStorage('google-contact-consent', false);

    // Forms
    const profileForm = useForm<z.infer<typeof profileFormSchema>>({
        resolver: zodResolver(profileFormSchema),
        defaultValues: { firstName: '', lastName: '' },
    });
    const passwordForm = useForm<z.infer<typeof passwordFormSchema>>({
        resolver: zodResolver(passwordFormSchema),
        defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' }
    });

    useEffect(() => {
        if (userProfile) {
            setProfileState({
                firstName: userProfile.firstName || '',
                lastName: userProfile.lastName || '',
            });
            profileForm.reset({
                firstName: userProfile.firstName || '',
                lastName: userProfile.lastName || '',
            });
            setGeneralState({ timezone: userProfile.timezone || '' });
            setNotificationsState(userProfile.notificationSettings || notificationsState);
            setDataState({ deletionPolicy: userProfile.storageSettings?.deletionPolicy || 'never' });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userProfile, profileForm]);
    
     useEffect(() => {
        const code = searchParams.get('g_code');
        const state = searchParams.get('g_state');
        const error = searchParams.get('error');

        if (error) {
            toast({
                variant: 'destructive',
                title: 'Google Sync Failed',
                description: error.replace(/\+/g, ' ') || 'Could not sync with your Google account.',
            });
        } else if (code && state && !isSyncing) {
            startSyncTransition(async () => {
                toast({ title: 'Syncing Contacts...', description: 'Please wait while we fetch your Google contacts.' });
                const result = await syncGoogleContacts(code, state);
                if (result.success) {
                    toast({ title: 'Sync Successful', description: `${result.count} contacts were found and synced.` });
                } else {
                    toast({ variant: 'destructive', title: 'Sync Failed', description: result.error });
                }
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, toast, isSyncing]);


    const handleUpdateProfile = async (values: z.infer<typeof profileFormSchema>) => {
        if (!user) return;
        setSavingProfile(true);
        try {
            const userRef = doc(firestore, 'users', user.uid);
            await updateDoc(userRef, { firstName: values.firstName, lastName: values.lastName });
            toast({ title: 'Profile Updated', description: 'Your personal information has been saved.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
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
            toast({ title: 'Password Changed Successfully', description: 'You will be logged out for security. Please log in with your new password.' });
            setTimeout(() => auth.signOut(), 3000);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Password Change Failed', description: error.code === 'auth/wrong-password' ? 'The current password you entered is incorrect.' : error.message });
        } finally {
            setSavingPassword(false);
            passwordForm.reset();
        }
    };

    const handleSaveGeneral = async () => {
        if (!user || !generalState.timezone) return;
        setSavingGeneral(true);
        try {
            const userRef = doc(firestore, 'users', user.uid);
            await updateDoc(userRef, { timezone: generalState.timezone });
            toast({ title: 'Preferences Saved', description: 'Your localization settings have been updated.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Save Failed', description: error.message });
        } finally {
            setSavingGeneral(false);
        }
    };

    const handleSaveNotifications = async () => {
        if (!user) return;
        setSavingNotifications(true);
        try {
            const userRef = doc(firestore, 'users', user.uid);
            await updateDoc(userRef, { notificationSettings: notificationsState });
            toast({ title: 'Notifications Saved', description: 'Your notification preferences have been updated.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Save Failed', description: error.message });
        } finally {
            setSavingNotifications(false);
        }
    };
    
    const handleSaveData = async () => {
        if (!user) return;
        setSavingData(true);
        try {
            const userRef = doc(firestore, 'users', user.uid);
            await updateDoc(userRef, { 'storageSettings.deletionPolicy': dataState.deletionPolicy });
            toast({ title: 'Policy Saved', description: 'Your data retention policy has been updated.' });
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Save Failed', description: error.message });
        } finally {
            setSavingData(false);
        }
    };

    const handleIngest = () => {
        startIngestTransition(async () => {
            const result = await ingestFiles();
            if (result.error) {
                toast({ variant: 'destructive', title: 'Ingestion Error', description: result.error });
            } else if (result.processedCount > 0) {
                toast({ title: 'Ingestion Complete', description: `${result.processedCount} new recordings have been processed.` });
            } else {
                toast({ title: 'No New Files', description: "The 'injest' directory is empty." });
            }
        });
    };

    const redirectToGoogleAuth = async () => {
        const { url } = await getGoogleAuthUrl();
        window.location.href = url;
    };

    const handleConnectGoogle = () => {
        if (hasConsented) {
            redirectToGoogleAuth();
        } else {
            setShowConnectDialog(true);
        }
    };
    
    const onDialogConfirm = () => {
        setHasConsented(true);
        setShowConnectDialog(false);
        redirectToGoogleAuth();
    };

    const isLoading = isUserLoading || isProfileLoading;

    if (isLoading) {
        return (
             <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                    <p className="text-muted-foreground">Manage your account, data, and application preferences.</p>
                </div>
                 <div className="space-y-4">
                    <Skeleton className="h-10 w-full max-w-lg" />
                    <Skeleton className="h-64 w-full" />
                </div>
             </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground">Manage your account, data, and application preferences.</p>
            </div>
            <ClientOnly>
                <Tabs defaultValue={tab} className="w-full">
                    <TabsList className="h-auto flex-wrap justify-start">
                        <TabsTrigger value="profile">Profile</TabsTrigger>
                        <TabsTrigger value="general">General</TabsTrigger>
                        <TabsTrigger value="data">Data</TabsTrigger>
                        <TabsTrigger value="notifications">Notifications</TabsTrigger>
                        {showBilling && <TabsTrigger value="billing">Billing</TabsTrigger>}
                    </TabsList>
                    <TabsContent value="profile">
                        <ProfileSettings 
                            user={user}
                            profileForm={profileForm}
                            passwordForm={passwordForm}
                            onUpdateProfile={handleUpdateProfile}
                            onChangePassword={handleChangePassword}
                            isProfileSaving={isSavingProfile}
                            isPasswordSaving={isSavingPassword}
                        />
                    </TabsContent>
                    <TabsContent value="general">
                        <GeneralSettings
                           settings={generalState}
                           onSettingsChange={setGeneralState}
                           onSave={handleSaveGeneral}
                           isSaving={isSavingGeneral}
                        />
                    </TabsContent>
                    <TabsContent value="data">
                        <DataSettings 
                           userProfile={userProfile}
                           settings={dataState}
                           onSettingsChange={setDataState}
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
                    </TabsContent>
                    <TabsContent value="notifications">
                        <NotificationsSettings 
                            settings={notificationsState}
                            onSettingsChange={setNotificationsState}
                            onSave={handleSaveNotifications}
                            isSaving={isSavingNotifications}
                        />
                    </TabsContent>
                    {showBilling && (
                        <TabsContent value="billing">
                           <BillingSettings />
                        </TabsContent>
                    )}
                </Tabs>
            </ClientOnly>
        </div>
    );
}
