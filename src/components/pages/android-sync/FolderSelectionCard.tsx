import { Card, Button, Spinner } from '@heroui/react';
import { FolderOpen, X, RefreshCw, Upload } from 'lucide-react';
import { formatFileSize } from './utils';
import type { Folder } from '@/lib/capacitor';

interface FolderSelectionCardProps {
    selectedFolder: Folder | null;
    pendingFilesCount: number;
    pendingSize: number;
    syncedTotal: number;
    isLoading: boolean;
    isSyncing: boolean;
    selectedCount: number;
    onPickFolder: () => void;
    onClearFolder: () => void;
    onLoadFiles: () => void;
    onSync: () => void;
}

export function FolderSelectionCard({
    selectedFolder,
    pendingFilesCount,
    pendingSize,
    syncedTotal,
    isLoading,
    isSyncing,
    selectedCount,
    onPickFolder,
    onClearFolder,
    onLoadFiles,
    onSync
}: FolderSelectionCardProps) {
    return (
        <Card className="p-4 mb-4 shrink-0">
            {!selectedFolder ? (
                <div className="text-center py-6">
                    <FolderOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-muted-foreground mb-4">
                        Choose a folder containing your call recordings
                    </p>
                    <Button onPress={onPickFolder} size="lg" variant="primary">
                        <FolderOpen className="h-5 w-5 mr-2" />
                        Choose Folder
                    </Button>
                </div>
            ) : (
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                    <div className="flex-1">
                        <h3 className="text-sm font-medium text-muted-foreground mb-1">Selected Folder</h3>
                        <div className="flex items-center gap-2">
                            <FolderOpen className="h-5 w-5 text-primary" />
                            <span className="font-semibold text-lg">{selectedFolder.name}</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                isIconOnly
                                onPress={onClearFolder}
                                className="text-danger"
                                aria-label="Change folder"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="flex gap-4 mt-2 text-sm">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-warning"></div>
                                <span>{pendingFilesCount} Pending ({formatFileSize(pendingSize)})</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-success"></div>
                                <span>{syncedTotal} Synced</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto">
                        <Button
                            variant="ghost"
                            onPress={onLoadFiles}
                            isIconOnly={isLoading}
                            isDisabled={isLoading}
                        >
                            {!isLoading && <RefreshCw className="h-4 w-4 mr-2" />}
                            {isLoading ? <Spinner size="sm" /> : 'Refresh'}
                        </Button>

                        {selectedCount > 0 && (
                            <Button
                                variant="primary"
                                onPress={onSync}
                                isIconOnly={isSyncing}
                                isDisabled={isSyncing}
                            >
                                {!isSyncing && <Upload className="h-4 w-4 mr-2" />}
                                {isSyncing ? <Spinner size="sm" color="current" /> : `Sync ${selectedCount} Files`}
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </Card>
    );
}
