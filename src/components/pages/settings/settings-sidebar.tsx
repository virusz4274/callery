import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SettingsTab } from '@/hooks/use-settings-page';

type SettingsSidebarProps = {
    activeTab: string;
    tabs: SettingsTab[];
    view: 'list' | 'detail';
    onSelectTab: (tabId: string) => void;
};

export function SettingsSidebar({ activeTab, tabs, view, onSelectTab }: SettingsSidebarProps) {
    return (
        <div
            className={cn(
                'w-full lg:w-72 flex-shrink-0 flex flex-col gap-2 p-2 rounded-2xl bg-card/30 backdrop-blur-md border border-default-200/50 h-fit lg:sticky lg:top-6 transition-all',
                view === 'detail' ? 'hidden lg:flex' : 'flex'
            )}
        >
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => onSelectTab(tab.id)}
                    className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left',
                        activeTab === tab.id
                            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 font-medium'
                            : 'hover:bg-default-100 text-foreground/80 hover:text-foreground'
                    )}
                >
                    <span className={cn('text-xl transition-transform', activeTab === tab.id && 'scale-110')}>{tab.icon}</span>
                    <span className="text-lg">{tab.label}</span>
                    <ChevronRight
                        className={cn('w-5 h-5 ml-auto opacity-50 lg:hidden', activeTab === tab.id && 'opacity-100')}
                    />
                </button>
            ))}
        </div>
    );
}
