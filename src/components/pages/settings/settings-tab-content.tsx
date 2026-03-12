import React from 'react';
import { Chip } from '@heroui/react';
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
    const activeTabConfig = state.tabs.find((tab) => tab.id === state.activeTab) || state.tabs[0];
    const ActiveTabIcon = activeTabConfig?.icon;

    const panelLabel =
        state.activeTab === 'overview'
            ? 'Snapshot'
            : state.activeTab === 'billing'
              ? 'Plan and invoices'
              : 'Editable preferences';

    return (
        <div
            className={cn(
                'min-h-[400px] w-full min-w-0 flex-1 transition-all duration-300 lg:min-h-[600px]',
                isMobileDetailView ? 'block' : 'hidden xl:block'
            )}
        >
            <div className="overflow-hidden rounded-[1.9rem] border border-default-200/80 bg-background/95 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
                <div className="border-b border-default-100/70 px-5 py-5 md:px-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="flex items-start gap-4">
                            {ActiveTabIcon && (
                                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[1.1rem] bg-accent/10 text-accent">
                                    <ActiveTabIcon className="h-5 w-5" />
                                </div>
                            )}

                            <div className="space-y-1">
                                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                    Active section
                                </div>
                                <h2 className="text-2xl font-bold tracking-[-0.03em] text-foreground">
                                    {activeTabConfig?.label}
                                </h2>
                                <p className="max-w-2xl text-sm leading-6 text-default-500 md:text-base">
                                    {activeTabConfig?.description}
                                </p>
                            </div>
                        </div>

                        <Chip variant="soft" color="default" className="rounded-full self-start">
                            {panelLabel}
                        </Chip>
                    </div>
                </div>

                <div className="px-5 py-5 md:px-6 md:py-6">
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
            </div>
        </div>
    );
}
