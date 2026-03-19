import React from 'react';
import { Chip } from '@heroui/react';

type FileListTabsProps = {
    activeTab: 'new' | 'synced';
    pendingCount: number;
    syncedCount: number;
    onTabChange: (tab: 'new' | 'synced') => void;
};

export function FileListTabs({ activeTab, pendingCount, syncedCount, onTabChange }: FileListTabsProps) {
    return (
        <div className="flex min-w-0 flex-wrap gap-4 overflow-x-auto border-b border-default-100/70 bg-background/90 px-5 pt-4">
            <button
                onClick={() => onTabChange('new')}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors focus:outline-none ${
                    activeTab === 'new'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-foreground/60 hover:text-foreground'
                }`}
            >
                <div className="flex items-center gap-2">
                    <span>New & Pending</span>
                    <Chip
                        size="sm"
                        variant="soft"
                        color={activeTab === 'new' ? 'warning' : 'default'}
                        className="rounded-full"
                    >
                        {pendingCount}
                    </Chip>
                </div>
            </button>
            <button
                onClick={() => onTabChange('synced')}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors focus:outline-none ${
                    activeTab === 'synced'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-foreground/60 hover:text-foreground'
                }`}
            >
                <div className="flex items-center gap-2">
                    <span>Synced History</span>
                    <Chip
                        size="sm"
                        variant="soft"
                        color={activeTab === 'synced' ? 'success' : 'default'}
                        className="rounded-full"
                    >
                        {syncedCount}
                    </Chip>
                </div>
            </button>
        </div>
    );
}
