'use client';

import { useIsMobile } from '@/hooks/use-mobile';
import { useSettingsPage } from '@/hooks/use-settings-page';
import { SettingsHeader } from './settings/settings-header';
import { SettingsLoadingState } from './settings/settings-loading-state';
import { SettingsSidebar } from './settings/settings-sidebar';
import { SettingsTabContent } from './settings/settings-tab-content';

export function SettingsPage() {
    const isMobile = useIsMobile();
    const state = useSettingsPage();

    if (state.isLoading) {
        return <SettingsLoadingState />;
    }

    const isDetailView = state.view === 'detail';

    return (
        <div className="w-full h-full min-h-screen relative">
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl opacity-40 animate-pulse" />
                <div className="absolute bottom-[-10%] left-[-5%] w-[600px] h-[600px] rounded-full bg-secondary/5 blur-3xl opacity-40" />
            </div>

            <div className="max-w-[1600px] mx-auto space-y-6 sm:space-y-8">
                <SettingsHeader
                    activeTab={state.activeTab}
                    isMobile={isMobile}
                    tabs={state.tabs}
                    view={state.view}
                    onBack={state.handleBack}
                />

                <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
                    <SettingsSidebar
                        activeTab={state.activeTab}
                        tabs={state.tabs}
                        view={state.view}
                        onSelectTab={state.handleTabSelect}
                    />

                    <SettingsTabContent
                        isMobileDetailView={isDetailView}
                        state={state}
                    />
                </div>
            </div>
        </div>
    );
}
