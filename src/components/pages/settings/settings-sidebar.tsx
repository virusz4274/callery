import React from 'react';
import { Card, Chip } from '@heroui/react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import type { SettingsTab } from '@/hooks/use-settings-page';

type SettingsSidebarProps = {
    activeTab: string;
    tabs: SettingsTab[];
    view: 'list' | 'detail';
    onSelectTab: (tabId: string) => void;
};

export function SettingsSidebar({ activeTab, tabs, view, onSelectTab }: SettingsSidebarProps) {
    const isMobile = useIsMobile();

    return (
        <div
            className={cn(
                'w-full lg:w-[300px] xl:w-[320px] flex-shrink-0 transition-all',
                view === 'detail' ? 'hidden lg:block' : 'block'
            )}
        >
            <Card className="overflow-hidden rounded-[1.5rem] border border-default-200/80 bg-background/95 shadow-[0_20px_54px_-42px_rgba(15,23,42,0.45)] lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100dvh-10rem)] lg:flex-col xl:rounded-[1.9rem]">
                <Card.Content className="space-y-2 p-2.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto xl:p-3">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;

                        return (
                            <button
                                key={tab.id}
                                onClick={() => onSelectTab(tab.id)}
                                className={cn(
                                    'w-full rounded-[1.15rem] border px-3 py-3 text-left transition-all duration-200 xl:rounded-[1.35rem] xl:px-4 xl:py-4',
                                    isActive
                                        ? 'border-accent/20 bg-accent/8 shadow-[0_20px_44px_-36px_rgba(38,132,255,0.45)]'
                                        : 'border-transparent hover:border-default-200 hover:bg-default-50/80'
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <div
                                        className={cn(
                                            'mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl xl:h-11 xl:w-11 xl:rounded-2xl',
                                            isActive ? 'bg-accent text-accent-foreground' : 'bg-default-100 text-default-500'
                                        )}
                                    >
                                        <Icon className="h-5 w-5" />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-3">
                                            <span
                                                className={cn(
                                                    'text-base font-semibold',
                                                    isActive ? 'text-foreground' : 'text-foreground/90'
                                                )}
                                            >
                                                {tab.label}
                                            </span>
                                            {isActive && !isMobile && (
                                                <Chip size="sm" variant="soft" color="accent">
                                                    Open
                                                </Chip>
                                            )}
                                        </div>
                                        {!isMobile && (
                                            <p className="mt-1 text-sm leading-6 text-default-500">{tab.description}</p>
                                        )}
                                    </div>

                                    <ChevronRight
                                        className={cn(
                                            'mt-1 h-5 w-5 flex-shrink-0 text-default-300 transition-colors',
                                            isActive && 'text-accent'
                                        )}
                                    />
                                </div>
                            </button>
                        );
                    })}
                </Card.Content>
            </Card>
        </div>
    );
}
