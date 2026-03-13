import React from 'react';
import { Card, Chip } from '@heroui/react';
import { ContextHelp } from '@/components/context-help';
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
                'w-full xl:w-[320px] flex-shrink-0 transition-all',
                view === 'detail' ? 'hidden xl:block' : 'block'
            )}
        >
            <Card className="overflow-hidden rounded-[1.9rem] border border-default-200/80 bg-background/95 shadow-[0_20px_54px_-42px_rgba(15,23,42,0.45)] xl:sticky xl:top-6">
                <Card.Header className="flex items-start justify-between gap-3 border-b border-default-100/70 px-5 py-5">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                            Sections
                            <ContextHelp
                                title="Settings map"
                                description="Pick a section from here to swap the active settings panel on the right."
                                points={[
                                    'The active section is highlighted.',
                                    'Each section groups related controls together.',
                                ]}
                                placement="right"
                            />
                        </div>
                        <div className="text-xl font-bold tracking-[-0.03em] text-foreground">Settings map</div>
                    </div>
                    <Chip variant="soft" color="default" className="rounded-full">
                        {tabs.length}
                    </Chip>
                </Card.Header>

                <Card.Content className="space-y-2 p-3">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;

                        return (
                            <button
                                key={tab.id}
                                onClick={() => onSelectTab(tab.id)}
                                className={cn(
                                    'w-full rounded-[1.35rem] border px-4 py-4 text-left transition-all duration-200',
                                    isActive
                                        ? 'border-accent/20 bg-accent/8 shadow-[0_20px_44px_-36px_rgba(38,132,255,0.45)]'
                                        : 'border-transparent hover:border-default-200 hover:bg-default-50/80'
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <div
                                        className={cn(
                                            'mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl',
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
                                            {isActive && (
                                                <Chip size="sm" variant="soft" color="accent">
                                                    Open
                                                </Chip>
                                            )}
                                        </div>
                                        <p className="mt-1 text-sm leading-6 text-default-500">{tab.description}</p>
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
