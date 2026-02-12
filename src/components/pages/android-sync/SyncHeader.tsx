import { FolderSync } from 'lucide-react';
import { formatRelativeTime } from './utils';

interface SyncHeaderProps {
    lastSyncTime: number | null;
}

export function SyncHeader({ lastSyncTime }: SyncHeaderProps) {
    return (
        <div className="flex items-center gap-3 mb-4 shrink-0">
            <FolderSync className="h-8 w-8 text-primary" />
            <div>
                <h1 className="text-2xl font-bold">Folder Sync</h1>
                <p className="text-muted-foreground text-sm">
                    Sync recordings from your device folders
                </p>
            </div>

            {/* Global Stats/Status */}
            <div className="ml-auto flex items-center gap-2">
                {lastSyncTime && (
                    <span className="text-xs text-muted-foreground hidden sm:inline-block">
                        Last synced {formatRelativeTime(lastSyncTime)}
                    </span>
                )}
            </div>
        </div>
    );
}
