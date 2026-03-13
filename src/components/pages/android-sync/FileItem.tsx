import { Checkbox, Spinner } from '@heroui/react';
import { Check, Clock } from 'lucide-react';
import { SyncableFile } from './types';
import { formatFileSize, formatDate } from './utils';

interface FileItemProps {
    file: SyncableFile;
    onToggle: (fingerprint: string) => void;
}

export function FileItem({ file, onToggle }: FileItemProps) {
    return (
        <div
            className={`flex items-center gap-3 rounded-[1.1rem] border p-3 transition-colors ${file.selected
                ? 'border-primary/30 bg-primary/10'
                : 'border-default-100 bg-default-50/40 hover:bg-default-100/60'
                }`}
        >
            <div className="flex items-center justify-center shrink-0">
                {file.status === 'synced' ? (
                    <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center text-success">
                        <Check className="h-5 w-5" />
                    </div>
                ) : file.status === 'uploading' ? (
                    <Spinner size="sm" />
                ) : (
                    <Checkbox
                        isSelected={file.selected}
                        onChange={() => onToggle(file.fingerprint)}
                    />
                )}
            </div>

            <div className="flex-1 min-w-0 pointer-events-none">
                <p className="font-medium truncate text-foreground">{file.name}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>{formatFileSize(file.size)}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(file.mtime)}
                    </span>
                    {file.status === 'synced' && <span className="text-success ml-2 font-medium">Synced</span>}
                    {file.status === 'error' && <span className="text-danger ml-2 font-medium">Needs retry</span>}
                </div>
                {file.error && (
                    <p className="text-xs text-danger mt-1">{file.error}</p>
                )}
            </div>
        </div>
    );
}
