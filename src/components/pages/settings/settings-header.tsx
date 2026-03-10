import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SettingsTab } from '@/hooks/use-settings-page';

type SettingsHeaderProps = {
    activeTab: string;
    isMobile: boolean;
    tabs: SettingsTab[];
    view: 'list' | 'detail';
    onBack: () => void;
};

export function SettingsHeader({ activeTab, isMobile, tabs, view, onBack }: SettingsHeaderProps) {
    const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label || 'Settings';

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <button
                    onClick={onBack}
                    className={cn(
                        'lg:hidden p-2 -ml-2 rounded-full hover:bg-default-100 transition-colors',
                        view === 'list' ? 'hidden' : 'flex'
                    )}
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>

                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                    {view === 'detail' && isMobile ? activeTabLabel : 'Settings'}
                </h1>
            </div>

            <p className={cn('text-default-500 text-base sm:text-lg', view === 'detail' && 'hidden lg:block')}>
                Manage your account, data, and application preferences.
            </p>
        </div>
    );
}
