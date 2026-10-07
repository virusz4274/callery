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
        <div className="mobile-settings min-w-0">
            <div className="space-y-4 md:space-y-6">
                    <SettingsHeader
                        activeTab={state.activeTab}
                        isMobile={isMobile}
                        tabs={state.tabs}
                        view={state.view}
                        onBack={state.handleBack}
                    />

                <div className="grid min-w-0 gap-6 md:grid-cols-[224px_minmax(0,1fr)] md:items-start">
                    <SettingsSidebar
                        activeTab={state.activeTab}
                        tabs={state.tabs}
                        view={state.view}
                        onSelectTab={state.handleTabSelect}
                    />

                    <SettingsTabContent isMobileDetailView={isDetailView} state={state} />
                </div>
            </div>
        </div>
    );
}
