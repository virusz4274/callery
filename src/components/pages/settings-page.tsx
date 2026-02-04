
'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProfileSettings } from '@/components/settings/profile-settings';
import { GeneralSettings } from '@/components/settings/general-settings';
import { DataSettings } from '@/components/settings/data-settings';
import { NotificationsSettings } from '@/components/settings/notifications-settings';
import { BillingSettings } from '@/components/settings/billing-settings';
import { ClientOnly } from '@/components/client-only';
import { Skeleton } from '@heroui/react';
import { useSettingsPage } from '@/hooks/use-settings-page';

export function SettingsPage() {
    const {
        user,
        userProfile,
        isLoading,
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
        handleBack,
        exportJob,
        isExportStarting,
        handleStartExport
    } = useSettingsPage();

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

                                    // Export
                                    exportJob={exportJob}
                                    isExportStarting={isExportStarting}
                                    onStartExport={handleStartExport}
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
                            {showBilling && activeTab === 'billing' && user && userProfile && (
                                <BillingSettings
                                    invoices={[]}
                                    isLoading={false}
                                    userProfile={userProfile}
                                />
                            )}
                        </ClientOnly>
                    </div>
                </div>
            </div>
        </div>
    );
}
