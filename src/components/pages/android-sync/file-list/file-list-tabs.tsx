import React from 'react';

type FileListTabsProps = {
    activeTab: 'new' | 'synced';
    pendingCount: number;
    syncedCount: number;
    onTabChange: (tab: 'new' | 'synced') => void;
};

export function FileListTabs({ activeTab, pendingCount, syncedCount, onTabChange }: FileListTabsProps) {
    return (
        <div className="flex border-b border-default-200 bg-content1 px-4 pt-2 gap-4">
            <button
                onClick={() => onTabChange('new')}
                className={`pb-2 px-2 text-sm font-medium border-b-2 transition-colors focus:outline-none ${
                    activeTab === 'new'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-foreground/60 hover:text-foreground'
                }`}
            >
                <div className="flex items-center gap-2">
                    <span>New & Pending</span>
                    <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                            activeTab === 'new' ? 'bg-warning/20 text-warning-600' : 'bg-default-100 text-default-500'
                        }`}
                    >
                        {pendingCount}
                    </span>
                </div>
            </button>
            <button
                onClick={() => onTabChange('synced')}
                className={`pb-2 px-2 text-sm font-medium border-b-2 transition-colors focus:outline-none ${
                    activeTab === 'synced'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-foreground/60 hover:text-foreground'
                }`}
            >
                <div className="flex items-center gap-2">
                    <span>Synced History</span>
                    <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                            activeTab === 'synced' ? 'bg-success/20 text-success-600' : 'bg-default-100 text-default-500'
                        }`}
                    >
                        {syncedCount}
                    </span>
                </div>
            </button>
        </div>
    );
}
