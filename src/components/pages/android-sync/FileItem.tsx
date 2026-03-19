import { Checkbox, Spinner } from '@heroui/react';
import { Check, Clock } from 'lucide-react';
import { SyncableFile } from './types';
import { formatFileSize, formatDate } from './utils';

interface FileItemProps {
    file: SyncableFile;
    onToggle: (fingerprint: string) => void;
}

export function FileItem({ file, onToggle }: FileItemProps) {
    const isBusy = file.status === 'queued' || file.status === 'retrying' || file.status === 'uploading' || file.status === 'finalizing';

    return (
        <div
            className={`flex min-w-0 items-start gap-3 overflow-hidden rounded-[1.1rem] border p-3 transition-colors ${file.selected
                ? 'border-primary/30 bg-primary/10'
                : 'border-default-100 bg-default-50/40 hover:bg-default-100/60'
                }`}
        >
            <div className="flex items-center justify-center shrink-0">
                {file.status === 'synced' ? (
                    <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center text-success">
                        <Check className="h-5 w-5" />
                    </div>
                ) : isBusy ? (
                    <Spinner size="sm" />
                ) : (
                    <Checkbox
                        isSelected={file.selected}
                        onChange={() => onToggle(file.fingerprint)}
                    />
                )}
            </div>

            <div className="min-w-0 flex-1 pointer-events-none">
                <p className="font-medium text-foreground [overflow-wrap:anywhere]">{file.name}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatFileSize(file.size)}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(file.mtime)}
                    </span>
                    {file.status === 'synced' && <span className="text-success ml-2 font-medium">Synced</span>}
                    {file.status === 'queued' && <span className="text-primary ml-2 font-medium">Queued</span>}
                    {file.status === 'uploading' && <span className="text-primary ml-2 font-medium">Uploading</span>}
                    {file.status === 'finalizing' && <span className="text-primary ml-2 font-medium">Finalizing</span>}
                    {file.status === 'retrying' && <span className="text-warning ml-2 font-medium">Retrying</span>}
                    {file.status === 'error' && <span className="text-danger ml-2 font-medium">Needs retry</span>}
                </div>
                {file.error && (
                    <p className="mt-1 text-xs text-danger [overflow-wrap:anywhere]">{file.error}</p>
                )}
            </div>
        </div>
    );
}
