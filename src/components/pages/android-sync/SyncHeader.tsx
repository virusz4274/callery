import { Chip, Surface } from '@heroui/react';
import { FolderSync } from 'lucide-react';
import { formatRelativeTime } from './utils';

interface SyncHeaderProps {
    lastSyncTime: number | null;
}

export function SyncHeader({ lastSyncTime }: SyncHeaderProps) {
    return (
        <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
            <div className="grid gap-8 px-5 py-6 md:px-8 md:py-8 xl:grid-cols-[minmax(0,1.05fr)_320px] xl:items-start">
                <div className="space-y-4">
                    <Chip variant="soft" color="accent" size="sm">
                        Mobile intake
                    </Chip>
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10 text-accent">
                                <FolderSync className="h-6 w-6" />
                            </div>
                            <h1 className="text-4xl font-black tracking-[-0.05em] text-foreground md:text-5xl">
                                Folder sync
                            </h1>
                        </div>
                        <p className="max-w-2xl text-base leading-7 text-default-600 md:text-lg">
                            Pull recordings directly from your Android storage, review pending files, and sync only the calls you actually want in the workspace.
                        </p>
                    </div>
                </div>

                <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-5">
                    <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                            Sync status
                        </div>
                        <div className="text-lg font-semibold text-foreground">
                            {lastSyncTime ? `Last synced ${formatRelativeTime(lastSyncTime)}` : 'No sync recorded yet'}
                        </div>
                        <p className="text-sm leading-6 text-default-500">
                            Pick a folder, refresh the list, then sync selected files in controlled batches.
                        </p>
                    </div>
                </Surface>
            </div>
        </section>
    );
}
