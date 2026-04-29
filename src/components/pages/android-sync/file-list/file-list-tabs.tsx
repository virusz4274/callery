import React from 'react';
import { Button, Chip } from '@heroui/react';

type FileListTabsProps = {
    activeTab: 'new' | 'synced';
    pendingCount: number;
    syncedCount: number;
    onTabChange: (tab: 'new' | 'synced') => void;
};

export function FileListTabs({ activeTab, pendingCount, syncedCount, onTabChange }: FileListTabsProps) {
    const tabClass = (tab: 'new' | 'synced') =>
        `pb-3 px-1 h-auto rounded-none text-sm font-medium border-b-2 transition-colors focus-visible:outline-none ${
            activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-foreground/60 hover:text-foreground'
        }`;

    return (
        <div
            role="tablist"
            aria-label="File sync status"
            className="flex min-w-0 flex-wrap gap-4 overflow-x-auto border-b border-default-100/70 bg-background/90 px-5 pt-4"
        >
            <Button
                variant="ghost"
                onPress={() => onTabChange('new')}
                className={tabClass('new')}
            >
                <span>New &amp; Pending</span>
                <Chip
                    size="sm"
                    variant="soft"
                    color={activeTab === 'new' ? 'warning' : 'default'}
                    className="ml-2 rounded-full"
                >
                    {pendingCount}
                </Chip>
            </Button>
            <Button
                variant="ghost"
                onPress={() => onTabChange('synced')}
                className={tabClass('synced')}
            >
                <span>Synced History</span>
                <Chip
                    size="sm"
                    variant="soft"
                    color={activeTab === 'synced' ? 'success' : 'default'}
                    className="ml-2 rounded-full"
                >
                    {syncedCount}
                </Chip>
            </Button>
        </div>
    );
}
