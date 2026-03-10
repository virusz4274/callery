import React from 'react';
import { cn } from '@/lib/utils';
import { ClientOnly } from '@/components/client-only';
import { BillingSettings } from '@/components/settings/billing-settings';
import { DataSettings } from '@/components/settings/data-settings';
import { GeneralSettings } from '@/components/settings/general-settings';
import { NotificationsSettings } from '@/components/settings/notifications-settings';
import { OverviewSettings } from '@/components/settings/overview-settings';
import { ProfileSettings } from '@/components/settings/profile-settings';
import type { useSettingsPage } from '@/hooks/use-settings-page';

type SettingsPageState = ReturnType<typeof useSettingsPage>;

type SettingsTabContentProps = {
    isMobileDetailView: boolean;
    state: SettingsPageState;
};

export function SettingsTabContent({ isMobileDetailView, state }: SettingsTabContentProps) {
    return (
        <div
            className={cn(
                'flex-1 w-full min-w-0 transition-all duration-300 min-h-[400px] lg:min-h-[600px]',
                'p-1 lg:pl-8',
                isMobileDetailView ? 'block' : 'hidden lg:block'
            )}
        >
            <ClientOnly>
                {state.activeTab === 'overview' && <OverviewSettings />}

                {state.activeTab === 'profile' && (
                    <ProfileSettings
                        user={state.user!}
                        profileForm={state.profileForm}
                        passwordForm={state.passwordForm}
                        onUpdateProfile={state.handleUpdateProfile}
                        onChangePassword={state.handleChangePassword}
                        isProfileSaving={state.isSavingProfile}
                        isPasswordSaving={state.isSavingPassword}
                    />
                )}

                {state.activeTab === 'general' && (
                    <GeneralSettings
                        settings={state.generalState}
                        onSettingsChange={state.updateGeneralState}
                        onSave={state.handleSaveGeneral}
                        isSaving={state.isSavingGeneral}
                    />
                )}

                {state.activeTab === 'data' && (
                    <DataSettings
                        userProfile={state.userProfile}
                        settings={state.dataState}
                        onSettingsChange={state.updateDataState}
                        onSave={state.handleSaveData}
                        isSaving={state.isSavingData}
                        onConnectGoogle={state.handleConnectGoogle}
                        isSyncing={state.isSyncing}
                        showConnectDialog={state.showConnectDialog}
                        onDialogConfirm={state.onDialogConfirm}
                        onOpenChangeDialog={state.setShowConnectDialog}
                        exportJob={state.exportJob}
                        isExportStarting={state.isExportStarting}
                        onStartExport={state.handleStartExport}
                    />
                )}

                {state.activeTab === 'notifications' && (
                    <NotificationsSettings
                        settings={state.notificationsState}
                        onSettingsChange={state.updateNotificationsState}
                        onSave={state.handleSaveNotifications}
                        isSaving={state.isSavingNotifications}
                    />
                )}

                {state.showBilling && state.activeTab === 'billing' && state.user && state.userProfile && (
                    <BillingSettings userProfile={state.userProfile} />
                )}
            </ClientOnly>
        </div>
    );
}
