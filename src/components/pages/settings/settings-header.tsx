import React from 'react';
import { Button, Chip } from '@heroui/react';
import { ContextHelp } from '@/components/context-help';
import { ChevronLeft, Sparkles } from 'lucide-react';
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
    const activeTabConfig = tabs.find((tab) => tab.id === activeTab) || tabs[0];
    const ActiveTabIcon = activeTabConfig?.icon || Sparkles;
    const title = view === 'detail' && isMobile ? activeTabConfig?.label : 'Settings';
    const helpTitle = view === 'detail' && activeTabConfig ? activeTabConfig.label : 'Settings';
    const helpDescription =
        view === 'detail' && activeTabConfig?.description
            ? activeTabConfig.description
            : 'Open account, data, notifications, billing, and workspace preferences from one place.';

    return (
        <section className="overflow-hidden rounded-[1.5rem] border border-default-200/80 bg-background/92 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.45)]">
            <div className="flex items-center justify-between gap-3 px-4 py-4">
                <div className="flex min-w-0 items-center gap-3">
                    <Button
                        isIconOnly
                        variant="secondary"
                        onPress={onBack}
                        className={cn('rounded-full', view === 'list' && 'hidden')}
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </Button>

                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[1rem] bg-accent/10 text-accent shadow-[inset_0_0_0_1px_rgba(38,132,255,0.12)]">
                        <ActiveTabIcon className="h-4.5 w-4.5" />
                    </div>

                    <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                            <div className="truncate text-lg font-bold tracking-[-0.03em] text-foreground">
                                {title}
                            </div>
                            <Chip variant="soft" color="default" size="sm">
                                {tabs.length}
                            </Chip>
                        </div>
                        {view === 'detail' && activeTabConfig && (
                            <div className="text-sm text-default-500">
                                {activeTabConfig.description}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Chip variant="soft" color="accent" size="sm" className="rounded-full">
                        Controls
                    </Chip>
                    <div className="flex items-center gap-2">
                        <ContextHelp
                            title={helpTitle}
                            description={helpDescription}
                            points={[
                                'Use the left rail to jump between sections quickly.',
                                'Open only the active panel instead of scanning a long settings page.',
                                'Billing, data, and profile changes stay grouped by task.',
                            ]}
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}
