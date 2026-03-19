import { Button, Card } from '@heroui/react';
import { RefreshCw } from 'lucide-react';
import { createPortal } from 'react-dom';
import { SyncProgress } from './types';

interface SyncProgressOverlayProps {
    progress: SyncProgress;
    onCancel?: () => void;
}

export function SyncProgressOverlay({ progress, onCancel }: SyncProgressOverlayProps) {
    if (typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-background/45 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-sm sm:items-center sm:p-6">
            <Card className="w-full max-w-lg rounded-[1.75rem] border border-default-200/80 bg-background/96 p-5 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.55)] sm:p-6">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground sm:text-xl">
                    <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                    Syncing files
                </h3>

                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3 text-sm text-default-600">
                        <span>{progress.state === 'retrying' ? 'Retrying sync' : progress.state === 'queued' ? 'Queued for sync' : 'Progress'}</span>
                        <span className="font-mono text-foreground">{progress.current} / {progress.total}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-default-100">
                        <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${(progress.current / progress.total) * 100}%` }}
                        />
                    </div>
                    <p className="rounded-xl bg-default-50 p-3 font-mono text-xs text-default-600 [overflow-wrap:anywhere]">
                        {progress.currentFileName}
                    </p>
                    {onCancel ? (
                        <div className="flex justify-end">
                            <Button variant="secondary" onPress={onCancel}>
                                Cancel sync
                            </Button>
                        </div>
                    ) : null}
                </div>
            </Card>
        </div>,
        document.body
    );
}
