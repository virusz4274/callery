import { Button, Card } from '@heroui/react';
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
        <nav aria-label="Settings sections" className={cn('min-w-0', view === 'detail' && 'hidden lg:block')}>
            <Card className="rounded-xl border border-border bg-surface p-2 shadow-none lg:sticky lg:top-24">
                <Card.Content className="space-y-1 p-0">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <Button key={tab.id} variant="ghost" onPress={() => onSelectTab(tab.id)}
                                aria-current={isActive ? 'page' : undefined}
                                className={cn('h-auto min-h-11 w-full justify-start gap-3 rounded-lg px-3 py-3 text-left',
                                    isActive ? 'bg-accent/10 text-accent' : 'text-muted')}>
                                <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium">{tab.label}</span>
                                    <span className="mt-1 block whitespace-normal text-sm font-normal text-muted lg:hidden">{tab.description}</span>
                                </span>
                                <ChevronRight className="size-4 shrink-0 lg:hidden" aria-hidden="true" />
                            </Button>
                        );
                    })}
                </Card.Content>
            </Card>
        </nav>
    );
}
