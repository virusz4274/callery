'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Card, Chip, Spinner } from '@heroui/react';
import { CheckCircle2, Clock3, File, Loader2, TriangleAlert, X } from 'lucide-react';
import type { UploadItem } from './types';

type UploadItemsCardProps = {
    uploadItems: UploadItem[];
    isUploading: boolean;
    onClearAll: () => void;
    onUploadAll: () => void;
    onRemoveFile: (id: string) => void;
};

export function UploadItemsCard({
    uploadItems,
    isUploading,
    onClearAll,
    onUploadAll,
    onRemoveFile,
}: UploadItemsCardProps) {
    const pendingCount = uploadItems.filter((item) => item.status === 'pending').length;
    const duplicateCount = uploadItems.filter((item) => item.isDuplicate).length;
    const uploadingCount = uploadItems.filter((item) => item.status === 'uploading').length;
    const successCount = uploadItems.filter((item) => item.status === 'success').length;
    const errorCount = uploadItems.filter((item) => item.status === 'error').length;
    const totalSizeMb = uploadItems.reduce((sum, item) => sum + item.file.size, 0) / 1024 / 1024;

    return (
        <Card className="rounded-[1.9rem] border border-default-200/80 bg-background/95 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
            <Card.Content className="p-5 sm:p-6">
                <div className="flex flex-col gap-5 border-b border-default-100 pb-5">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
                                Upload queue
                            </Chip>
                            <Chip variant="soft" color="default">
                                {uploadItems.length} file{uploadItems.length === 1 ? '' : 's'}
                            </Chip>
                            <Chip variant="soft" color="success">
                                {totalSizeMb.toFixed(1)} MB total
                            </Chip>
                        </div>
                        <h3 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-foreground">
                            Review the queue before you send it.
                        </h3>
                        <p className="mt-2 text-small text-default-500">
                            Pending and failed items can be uploaded together. Successful files stay visible so we can confirm what made it through.
                        </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {[
                            {
                                label: 'Pending',
                                value: pendingCount,
                                icon: Clock3,
                                tone: 'text-default-500',
                            },
                            {
                                label: 'Uploading',
                                value: uploadingCount,
                                icon: Loader2,
                                tone: 'text-primary',
                            },
                            {
                                label: 'Uploaded',
                                value: successCount,
                                icon: CheckCircle2,
                                tone: 'text-success',
                            },
                            {
                                label: 'Failed',
                                value: errorCount,
                                icon: TriangleAlert,
                                tone: 'text-warning',
                            },
                            {
                                label: 'Duplicates',
                                value: duplicateCount,
                                icon: TriangleAlert,
                                tone: 'text-warning',
                            },
                        ].map((item) => {
                            const Icon = item.icon;

                            return (
                                <div
                                    key={item.label}
                                    className="rounded-[1.5rem] border border-default-200/80 bg-default-50/70 p-4"
                                >
                                    <div className={`mb-2 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-background ${item.tone}`}>
                                        <Icon className={`h-4.5 w-4.5 ${item.label === 'Uploading' ? 'animate-spin' : ''}`} />
                                    </div>
                                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                        {item.label}
                                    </div>
                                    <div className="mt-1 text-2xl font-bold text-foreground">{item.value}</div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-default-500">
                            {isUploading
                                ? 'Uploads are in progress. Completed files will stay marked in the queue.'
                                : 'You can clear the batch or send every pending and failed file together.'}
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <Button
                                size="sm"
                                variant="ghost"
                                onPress={onClearAll}
                                className="font-medium text-danger hover:bg-danger/10 flex-1 sm:flex-none"
                            >
                                Clear All
                            </Button>
                            <Button
                                onPress={onUploadAll}
                                isDisabled={
                                    isUploading ||
                                    uploadItems.every((item) => item.status === 'success' || item.isDuplicate)
                                }
                                variant="primary"
                                className={`font-semibold shadow-md shadow-primary/20 flex-1 sm:flex-none ${
                                    isUploading ? 'opacity-80' : 'hover:scale-[1.02]'
                                }`}
                                size="sm"
                            >
                                {isUploading && <Spinner size="sm" color="current" className="mr-2" />}
                                {isUploading ? 'Uploading...' : 'Upload All'}
                            </Button>
                        </div>
                    </div>
                </div>

                <ul className="mt-6 space-y-3">
                    {uploadItems.map((item) => (
                        <li
                            key={item.id}
                            className={`group flex items-center justify-between p-4 rounded-[1.35rem] border transition-all duration-200 ${
                                item.status === 'error'
                                    ? 'border-danger/50 bg-danger/5'
                                : item.status === 'success'
                                      ? 'border-success/50 bg-success/5'
                                      : 'border-default-200 bg-background/40 hover:bg-default-100/50'
                            }`}
                        >
                            <div className="flex items-center gap-4 overflow-hidden w-full">
                                <div
                                    className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                        item.isDuplicate
                                            ? 'bg-warning/10 text-warning'
                                        : item.status === 'error'
                                            ? 'bg-danger/10 text-danger'
                                            : item.status === 'success'
                                              ? 'bg-success/10 text-success'
                                              : 'bg-primary/10 text-primary'
                                    }`}
                                >
                                    {item.status === 'uploading' ? (
                                        <Spinner size="sm" color="current" />
                                    ) : (
                                        <File className="h-5 w-5" />
                                    )}
                                </div>
                                <div className="flex flex-col overflow-hidden min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium truncate text-foreground">{item.file.name}</span>
                                        {item.status === 'success' && (
                                            <Chip variant="soft" color="success" className="text-[10px] font-bold">
                                                Uploaded
                                            </Chip>
                                        )}
                                        {item.status === 'error' && (
                                            <Chip variant="soft" color="warning" className="text-[10px] font-bold">
                                                Failed
                                            </Chip>
                                        )}
                                        {item.isDuplicate && (
                                            <Chip variant="soft" color="warning" className="text-[10px] font-bold">
                                                Duplicate
                                            </Chip>
                                        )}
                                        {item.status === 'pending' && !item.isDuplicate && (
                                            <Chip variant="soft" color="default" className="text-[10px] font-bold">
                                                Pending
                                            </Chip>
                                        )}
                                        {item.status === 'uploading' && (
                                            <Chip variant="soft" color="accent" className="text-[10px] font-bold">
                                                Uploading
                                            </Chip>
                                        )}
                                    </div>
                                    <span className="text-xs text-default-500 font-mono flex items-center gap-2">
                                        {(item.file.size / 1024 / 1024).toFixed(2)} MB
                                        {item.error && <span className="text-danger">- {item.error}</span>}
                                    </span>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                isIconOnly
                                size="sm"
                                onPress={() => onRemoveFile(item.id)}
                                className="text-default-400 hover:text-danger hover:bg-danger/10"
                                isDisabled={isUploading}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </li>
                    ))}
                </ul>

                {successCount > 0 && !isUploading && (
                    <div className="mt-6 rounded-[1.5rem] border border-success/20 bg-success/5 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <div className="text-sm font-semibold text-success">Upload progress saved</div>
                                <p className="mt-1 text-sm leading-6 text-default-600">
                                    Successful files are already on their way into the recordings workspace.
                                </p>
                            </div>
                            <Link href="/recordings">
                                <Button variant="secondary" className="rounded-full font-medium">
                                    Go to recordings
                                </Button>
                            </Link>
                        </div>
                    </div>
                )}
            </Card.Content>
        </Card>
    );
}
