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
        <div className="relative min-h-screen">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(circle_at_top_left,rgba(38,132,255,0.14),transparent_32%),radial-gradient(circle_at_top_right,rgba(13,148,136,0.12),transparent_28%)]" />

            <div className="mx-auto max-w-[1600px] space-y-6 sm:space-y-8">
                <SettingsHeader
                    activeTab={state.activeTab}
                    isMobile={isMobile}
                    tabs={state.tabs}
                    view={state.view}
                    onBack={state.handleBack}
                />

                <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start">
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
