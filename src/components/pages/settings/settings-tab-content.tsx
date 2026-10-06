import { cn } from '@/lib/utils';
import { ClientOnly } from '@/components/client-only';
import { BillingSettings } from '@/components/settings/billing-settings';
import { DataSettings } from '@/components/settings/data-settings';
import { GeneralSettings } from '@/components/settings/general-settings';
import { NotificationsSettings } from '@/components/settings/notifications-settings';
import { ProfileSettings } from '@/components/settings/profile-settings';
import type { useSettingsPage } from '@/hooks/use-settings-page';

type SettingsPageState = ReturnType<typeof useSettingsPage>;

type SettingsTabContentProps = {
    isMobileDetailView: boolean;
    state: SettingsPageState;
};

export function SettingsTabContent({ isMobileDetailView, state }: SettingsTabContentProps) {
    const activeTabConfig = state.tabs.find((tab) => tab.id === state.activeTab) || state.tabs[0];
    const ActiveTabIcon = activeTabConfig?.icon;

    return (
        <div
            className={cn(
                'w-full min-w-0 flex-1',
                isMobileDetailView ? 'block' : 'hidden lg:block'
            )}
        >
            <div className="space-y-5">
                <div className="hidden lg:block">
                    <div className="flex items-center gap-4">
                        {ActiveTabIcon && (
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                                <ActiveTabIcon className="h-5 w-5" />
                            </div>
                        )}
                        <h2 className="text-lg font-semibold tracking-tight text-foreground">
                            {activeTabConfig?.label}
                        </h2>
                    </div>
                </div>

                <div className="space-y-6">
                    <ClientOnly>
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

                        {['sources', 'processing', 'retention', 'export'].includes(state.activeTab) && (
                            <DataSettings
                                mode={state.activeTab as 'sources' | 'processing' | 'retention' | 'export'}
                                userProfile={state.userProfile}
                                settings={state.dataState}
                                onSettingsChange={state.updateDataState}
                                onSave={state.handleSaveData}
                                isSaving={state.isSavingData}
                                onConnectGoogle={state.handleConnectGoogle}
                                onDisconnectGoogle={state.handleDisconnectGoogle}
                                isSyncing={state.isSyncing}
                                isDisconnecting={state.isDisconnecting}
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
            </div>
        </div>
    );
}
