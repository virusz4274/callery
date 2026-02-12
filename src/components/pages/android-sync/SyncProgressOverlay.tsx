import { Card } from '@heroui/react';
import { RefreshCw } from 'lucide-react';
import { SyncProgress } from './types';

interface SyncProgressOverlayProps {
    progress: SyncProgress;
}

export function SyncProgressOverlay({ progress }: SyncProgressOverlayProps) {
    return (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-8">
            <Card className="w-full max-w-md p-6 shadow-xl">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                    Syncing Files...
                </h3>

                <div className="space-y-4">
                    <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span className="font-mono">{progress.current} / {progress.total}</span>
                    </div>
                    <div className="h-2 bg-default-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${(progress.current / progress.total) * 100}%` }}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground truncate font-mono bg-default-50 p-2 rounded">
                        {progress.currentFileName}
                    </p>
                </div>
            </Card>
        </div>
    );
}
