'use client';

import { ActionLink } from '@/components/action-link';
import { Button, Card, Chip } from '@heroui/react';
import { CheckCircle2, FileAudio, Pause, Play, X } from 'lucide-react';
import { publicEnv } from '@/lib/public-env';
import { UPLOAD_AUDIO_ACCEPT_ATTRIBUTE } from '@/lib/upload-audio-support';
import type { BrowserUploadStatus } from '@/lib/browser-uploads-contract';
import type { UploadItem } from './types';

const labels: Record<BrowserUploadStatus, string> = {
    pending: 'Ready to upload', queued: 'Queued', uploading: 'Uploading', paused: 'Paused', offline: 'Waiting for connection',
    'needs-file': 'Select original file', finalizing: 'Finishing upload', success: 'Uploaded', error: 'Needs attention', cancelled: 'Cancelled', expired: 'Expired',
};
const size = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MB`;

type Props = {
    uploadItems: UploadItem[];
    isUploading: boolean;
    onClearAll: () => void;
    onUploadAll: () => void;
    onRemoveFile: (id: string) => void;
    onCancelFile: (id: string) => void;
    onPauseFile: (id: string) => void;
    onResumeFile: (id: string) => void;
    onReselectFile: (id: string, file: File) => void;
    successHref?: string;
    successLabel?: string;
};

export function UploadItemsCard({ uploadItems, isUploading, onClearAll, onUploadAll, onRemoveFile, onCancelFile, onPauseFile, onResumeFile, onReselectFile,
    successHref = '/recordings', successLabel = 'Go to recordings' }: Props) {
    const successCount = uploadItems.filter(item => item.status === 'success').length;
    const duplicateCount = uploadItems.filter(item => item.isDuplicate).length;
    const errorCount = uploadItems.filter(item => item.status === 'error' || item.status === 'needs-file').length;
    const finalizing = uploadItems.some(item => item.status === 'finalizing');
    const canUpload = uploadItems.some(item => !item.isDuplicate && ['pending', 'error', 'paused', 'needs-file'].includes(item.status));
    const actions = <>
        <Button variant="ghost" className="min-h-11" isDisabled={finalizing} onPress={onClearAll}>Clear All</Button>
        <Button className="min-h-11 flex-1 md:flex-none" isDisabled={isUploading || !canUpload} onPress={onUploadAll}>{isUploading ? 'Uploading…' : 'Upload All'}</Button>
    </>;
    return <Card className="gap-0 rounded-xl border border-border bg-surface p-0 shadow-none">
        <Card.Content className="p-3 md:p-6">
            <div className="space-y-3 border-b border-border pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Upload queue</h2><Chip variant="soft">{uploadItems.length} file{uploadItems.length === 1 ? '' : 's'} · {size(uploadItems.reduce((sum, item) => sum + item.fileSize, 0))}</Chip></div>
                <p className="text-sm text-muted">Uploads continue as you browse. If you close or reload the browser, select the original file to resume completed parts.</p>
                <div className="hidden items-center gap-2 md:flex">{actions}</div>
            </div>
            <ul className="divide-y divide-border pb-28 md:pb-0" aria-label="Upload queue">
                {uploadItems.map(item => {
                    const percentage = Math.min(100, Math.floor(item.progressBytes / item.fileSize * 100));
                    const running = item.status === 'uploading' || item.status === 'queued';
                    const done = ['success', 'cancelled', 'expired'].includes(item.status);
                    return <li key={item.id} className="space-y-3 py-4" data-testid="upload-queue-item">
                        <div className="flex items-start gap-3">
                            {item.status === 'success' ? <CheckCircle2 aria-hidden="true" className="mt-1 size-5 shrink-0 text-success" /> : <FileAudio aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted" />}
                            <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-foreground">{item.fileName}</p><p className="mt-1 text-xs text-muted"><span>{size(item.fileSize)}</span> · <span>{item.isDuplicate ? 'Duplicate' : labels[item.status]}</span></p></div>
                            {item.status !== 'finalizing' && <Button isIconOnly variant="ghost" className="size-11 shrink-0" aria-label={`${done || item.isDuplicate || item.status === 'pending' ? 'Remove' : 'Cancel'} ${item.fileName}`}
                                onPress={() => done || item.isDuplicate || item.status === 'pending' ? onRemoveFile(item.id) : onCancelFile(item.id)}><X aria-hidden="true" className="size-4" /></Button>}
                        </div>
                        {!item.isDuplicate && !done && <>
                            <div className="space-y-1">
                                <div role="progressbar" aria-label={`Upload progress for ${item.fileName}`} aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-surface-secondary"><div className="h-full bg-accent transition-[width] motion-reduce:transition-none" style={{ width: `${percentage}%` }} /></div>
                                <p className="text-xs tabular-nums text-muted">{size(item.progressBytes)} of {size(item.fileSize)} · {percentage}%</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {running && <Button size="sm" variant="secondary" className="min-h-11" onPress={() => onPauseFile(item.id)}><Pause className="size-4" />Pause</Button>}
                                {['paused', 'error'].includes(item.status) && <Button size="sm" variant="secondary" className="min-h-11" onPress={() => onResumeFile(item.id)}><Play className="size-4" />{item.status === 'error' ? 'Retry' : 'Resume'}</Button>}
                                {item.status === 'needs-file' && <label className="relative inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-surface-secondary px-3 text-sm font-medium focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">Select original file
                                    <input type="file" aria-label={`Select original file for ${item.fileName}`} className="absolute inset-0 w-full cursor-pointer opacity-0" accept={UPLOAD_AUDIO_ACCEPT_ATTRIBUTE} onChange={event => { const file = event.target.files?.[0]; if (file) onReselectFile(item.id, file); event.target.value = ''; }} />
                                </label>}
                                {item.expiresAt && <span className="text-xs text-muted">Session expires {new Date(item.expiresAt).toLocaleString()}</span>}
                            </div>
                        </>}
                        {item.error && <p role="status" className="break-words text-sm text-warning">{item.error}</p>}
                        {item.status === 'expired' && <p className="text-sm text-muted">Add this file again to start a new upload.</p>}
                    </li>;
                })}
            </ul>
            <div data-testid="upload-action-bar" className="fixed inset-x-0 z-[51] border-t border-border bg-background p-3 md:hidden" style={{ bottom: publicEnv.NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU ? 'env(safe-area-inset-bottom)' : 'calc(4.5rem + env(safe-area-inset-bottom))' }}>
                <p className="mb-2 text-sm text-muted" role="status">{successCount} of {uploadItems.length} uploaded{errorCount ? ` · ${errorCount} need attention` : ''}{duplicateCount ? ` · ${duplicateCount} duplicates` : ''}</p>
                <div className="flex gap-2">{actions}</div>
            </div>
            {successCount > 0 && !isUploading && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-sm text-success">Files uploaded successfully</p><ActionLink href={successHref} variant="secondary">{successLabel}</ActionLink></div>}
        </Card.Content>
    </Card>;
}
