import { Button } from '@heroui/react';
import { ChevronLeft } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import type { SettingsTab } from '@/hooks/use-settings-page';

type SettingsHeaderProps = {
    activeTab: string;
    isMobile: boolean;
    tabs: SettingsTab[];
    view: 'list' | 'detail';
    onBack: () => void;
};

export function SettingsHeader({ activeTab, isMobile, tabs, view, onBack }: SettingsHeaderProps) {
    const activeTabConfig = tabs.find((tab) => tab.id === activeTab) || tabs[0];
    const showDetail = view === 'detail' && isMobile;

    return (
        <div className="space-y-3">
            {view === 'detail' && (
                <Button variant="ghost" size="sm" onPress={onBack} className="-ml-2 min-h-11 md:hidden" aria-label="Back to settings">
                    <ChevronLeft className="size-4" />All settings
                </Button>
            )}
            <PageHeader
                title={showDetail ? activeTabConfig?.label || 'Settings' : 'Settings'}

            />
        </div>
    );
}
