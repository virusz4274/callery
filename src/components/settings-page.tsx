

'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileSettings } from './settings/profile-settings';
import { GeneralSettings } from './settings/general-settings';
import { DataSettings } from './settings/data-settings';
import { NotificationsSettings } from './settings/notifications-settings';
import { BillingSettings } from './settings/billing-settings';
import { ClientOnly } from './client-only';
import { useSearchParams } from 'next/navigation';

export function SettingsPage() {
    const showBilling = process.env.NEXT_PUBLIC_FEATURE_BILLING_ENABLED === 'true';
    const searchParams = useSearchParams();
    const tab = searchParams.get('tab') || 'profile';

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
                        <ProfileSettings />
                    </TabsContent>
                    <TabsContent value="general">
                        <GeneralSettings />
                    </TabsContent>
                    <TabsContent value="data">
                        <DataSettings />
                    </TabsContent>
                    <TabsContent value="notifications">
                        <NotificationsSettings />
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
