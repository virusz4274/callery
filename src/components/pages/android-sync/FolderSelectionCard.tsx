import { Button, Card, Chip, Spinner, Surface } from '@heroui/react';
import { FolderOpen, X, RefreshCw, Upload } from 'lucide-react';
import { formatFileSize } from './utils';
import type { Folder } from '@/lib/capacitor';

interface FolderSelectionCardProps {
    selectedFolder: Folder | null;
    pendingFilesCount: number;
    pendingSize: number;
    syncedTotal: number;
    isLoading: boolean;
    isRefreshing: boolean;
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
    isRefreshing,
    isSyncing,
    selectedCount,
    onPickFolder,
    onClearFolder,
    onLoadFiles,
    onSync
}: FolderSelectionCardProps) {
    return (
        <Card className="mb-4 shrink-0 rounded-[1.9rem] border border-default-200/80 bg-background/95 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
            {!selectedFolder ? (
                <Card.Content className="space-y-5 p-6 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-default-100 text-default-400">
                        <FolderOpen className="h-8 w-8" />
                    </div>
                    <div>
                        <div className="text-2xl font-bold tracking-[-0.03em] text-foreground">Choose a folder to begin</div>
                        <p className="mt-2 text-sm leading-6 text-default-500">
                            Point the app at the location where your call recordings live. We’ll scan the folder tree before syncing anything.
                        </p>
                    </div>
                    <Button onPress={onPickFolder} size="lg" variant="primary" className="rounded-full px-6 font-semibold">
                        <FolderOpen className="mr-2 h-5 w-5" />
                        Choose folder
                    </Button>
                </Card.Content>
            ) : (
                <Card.Content className="space-y-5 p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-4">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <Chip variant="soft" color="accent">
                                    Selected folder
                                </Chip>
                                <Chip variant="soft" color="default" className="max-w-full">
                                    {selectedFolder.name}
                                </Chip>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] bg-accent/10 text-accent">
                                    <FolderOpen className="h-5 w-5" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-xl font-bold tracking-[-0.03em] text-foreground [overflow-wrap:anywhere]">{selectedFolder.name}</div>
                                    <p className="text-sm leading-6 text-default-500">
                                        Review unsynced files, refresh the scan, or change the source if needed.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex w-full gap-2 lg:w-auto">
                            <Button
                                variant="ghost"
                                onPress={onLoadFiles}
                                isIconOnly={isLoading || isRefreshing}
                                isDisabled={isLoading || isRefreshing}
                                className="flex-1 rounded-full lg:flex-none"
                            >
                                {!(isLoading || isRefreshing) && <RefreshCw className="mr-2 h-4 w-4" />}
                                {(isLoading || isRefreshing) ? <Spinner size="sm" /> : 'Refresh'}
                            </Button>

                            <Button
                                variant="ghost"
                                size="sm"
                                isIconOnly
                                onPress={onClearFolder}
                                className="rounded-full text-danger"
                                aria-label="Change folder"
                            >
                                <X className="h-4 w-4" />
                            </Button>

                            {selectedCount > 0 && (
                                <Button
                                    variant="primary"
                                    onPress={onSync}
                                    isIconOnly={isSyncing}
                                    isDisabled={isSyncing}
                                    className="flex-1 rounded-full px-5 font-semibold lg:flex-none"
                                >
                                    {!isSyncing && <Upload className="mr-2 h-4 w-4" />}
                                    {isSyncing ? <Spinner size="sm" color="current" /> : `Sync ${selectedCount} files`}
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                        <Surface variant="secondary" className="rounded-[1.25rem] border border-default-200/80 p-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">Pending</div>
                            <div className="mt-1 text-2xl font-bold text-foreground">{pendingFilesCount}</div>
                            <div className="text-sm text-default-500">Files still waiting in this folder</div>
                        </Surface>
                        <Surface variant="secondary" className="rounded-[1.25rem] border border-default-200/80 p-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">Payload</div>
                            <div className="mt-1 text-2xl font-bold text-foreground">{formatFileSize(pendingSize)}</div>
                            <div className="text-sm text-default-500">Estimated size for files still waiting to sync</div>
                        </Surface>
                        <Surface variant="secondary" className="rounded-[1.25rem] border border-default-200/80 p-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">Already synced</div>
                            <div className="mt-1 text-2xl font-bold text-foreground">{syncedTotal}</div>
                            <div className="text-sm text-default-500">Historical files copied from this device</div>
                        </Surface>
                    </div>
                </Card.Content>
            )}
        </Card>
    );
}
