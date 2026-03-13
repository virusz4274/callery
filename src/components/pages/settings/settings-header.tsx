import React from 'react';
import { Button, Chip } from '@heroui/react';
import { ContextHelp } from '@/components/context-help';
import { QuickStartPopover } from '@/components/quick-start-popover';
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
        <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
            <div className="grid gap-6 px-5 py-6 md:px-8 md:py-8 xl:grid-cols-[minmax(0,1.1fr)_auto] xl:items-start">
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
                            Workspace controls
                        </Chip>
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

                    <div className="flex items-start gap-4">
                        <Button
                            isIconOnly
                            variant="secondary"
                            onPress={onBack}
                            className={cn('mt-1 rounded-full lg:hidden', view === 'list' && 'hidden')}
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </Button>

                        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[1.25rem] bg-accent/10 text-accent shadow-[inset_0_0_0_1px_rgba(38,132,255,0.12)]">
                            <ActiveTabIcon className="h-6 w-6" />
                        </div>

                        <div className="space-y-3">
                            <div className="space-y-2">
                                <h1 className="text-4xl font-black tracking-[-0.05em] text-foreground md:text-5xl">
                                    {title}
                                </h1>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <Chip variant="soft" color="default">
                                    {tabs.length} sections
                                </Chip>
                                <Chip variant="soft" color="success">
                                    Secure account controls
                                </Chip>
                                {activeTabConfig && view === 'detail' && (
                                    <Chip variant="soft" color="warning">
                                        Active: {activeTabConfig.label}
                                    </Chip>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row xl:flex-col">
                    <QuickStartPopover
                        title="Use settings faster"
                        description="These are the main paths most people need after the first setup."
                        steps={[
                            {
                                title: 'Open the section you need',
                                description: 'Use the settings map to jump straight to profile, data, billing, or notifications.',
                            },
                            {
                                title: 'Change one task at a time',
                                description: 'Each panel groups related controls so you can finish an update without scanning the rest.',
                            },
                            {
                                title: 'Return to the app',
                                description: 'Once a setting is saved, jump back to recordings or contacts and continue working.',
                                href: '/recordings',
                            },
                        ]}
                    />
                    {view === 'detail' && activeTabConfig && (
                        <Chip variant="soft" color="warning" className="self-start rounded-full px-3 py-1 text-xs font-medium">
                            Active: {activeTabConfig.label}
                        </Chip>
                    )}
                </div>
            </div>
        </section>
    );
}
