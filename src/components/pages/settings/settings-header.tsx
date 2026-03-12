import React from 'react';
import { Button, Chip, Surface } from '@heroui/react';
import { ChevronLeft, ShieldCheck, Sparkles } from 'lucide-react';
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
    const description =
        view === 'detail' && isMobile
            ? activeTabConfig?.description
            : 'Manage account identity, workspace defaults, notifications, exports, and billing from one place.';

    return (
        <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
            <div className="grid gap-6 px-5 py-6 md:px-8 md:py-8 xl:grid-cols-[minmax(0,1.1fr)_320px] xl:items-start">
                <div className="space-y-4">
                    <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
                        Workspace controls
                    </Chip>

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
                                <p
                                    className={cn(
                                        'max-w-2xl text-base leading-7 text-default-600 md:text-lg',
                                        view === 'detail' && 'lg:block'
                                    )}
                                >
                                    {description}
                                </p>
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

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-full bg-success/10 p-2 text-success">
                                <ShieldCheck className="h-4 w-4" />
                            </div>
                            <div className="space-y-1">
                                <div className="text-sm font-semibold text-foreground">Identity and access</div>
                                <p className="text-sm leading-6 text-default-500">
                                    Profile, password, and workspace defaults stay grouped together so routine account changes are easy to find.
                                </p>
                            </div>
                        </div>
                    </Surface>
                    <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-full bg-accent/10 p-2 text-accent">
                                <Sparkles className="h-4 w-4" />
                            </div>
                            <div className="space-y-1">
                                <div className="text-sm font-semibold text-foreground">Operations and visibility</div>
                                <p className="text-sm leading-6 text-default-500">
                                    Billing, notifications, sync, and export workflows now sit inside the same settings workspace instead of feeling disconnected.
                                </p>
                            </div>
                        </div>
                    </Surface>
                </div>
            </div>
        </section>
    );
}
