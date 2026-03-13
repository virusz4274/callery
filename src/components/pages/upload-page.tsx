'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Chip, Spinner, Surface } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/toast-provider';
import { useUser } from '@/lib/firebase/provider';
import { UploadDropzoneCard } from '@/components/pages/upload/upload-dropzone-card';
import { UploadEmptyState } from '@/components/pages/upload/upload-empty-state';
import { UploadItemsCard } from '@/components/pages/upload/upload-items-card';
import { useUploadQueue } from '@/components/pages/upload/use-upload-queue';
import { ContextHelp } from '@/components/context-help';
import { QuickStartPopover } from '@/components/quick-start-popover';
import { useIsMobile } from '@/hooks/use-mobile';
import { CheckCircle2, ChevronDown, Clock3, HardDriveUpload, TriangleAlert } from 'lucide-react';

export function UploadPage() {
    const { toast } = useToast();
    const router = useRouter();
    const { user, isUserLoading } = useUser();
    const isMobile = useIsMobile();

    const {
        uploadItems,
        isUploading,
        isDragging,
        setUploadItems,
        setIsDragging,
        addFiles,
        removeFile,
        handleUpload,
    } = useUploadQueue(toast);

    React.useEffect(() => {
        if (!isUserLoading && !user) {
            router.replace('/login');
        }
    }, [isUserLoading, router, user]);

    if (isUserLoading || !user) {
        return (
            <div className="flex justify-center p-8">
                <Spinner size="lg" />
            </div>
        );
    }

    const duplicateCount = uploadItems.filter((item) => item.isDuplicate).length;
    const queuedCount = uploadItems.filter((item) => item.status === 'pending' && !item.isDuplicate).length;
    const uploadingCount = uploadItems.filter((item) => item.status === 'uploading').length;
    const successCount = uploadItems.filter((item) => item.status === 'success').length;
    const failedCount = uploadItems.filter((item) => item.status === 'error').length;
    const totalSizeMb = uploadItems.reduce((sum, item) => sum + item.file.size, 0) / 1024 / 1024;

    return (
        <div className="relative mx-auto max-w-7xl space-y-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top_right,rgba(38,132,255,0.14),transparent_34%),radial-gradient(circle_at_top_left,rgba(13,148,136,0.12),transparent_28%)]" />

            <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
                <div className="grid gap-8 px-5 py-6 md:px-8 md:py-8 xl:grid-cols-[minmax(0,1.05fr)_auto] xl:items-start">
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-4xl font-black tracking-[-0.05em] text-foreground md:text-5xl">
                                Upload recordings
                            </h1>
                            <ContextHelp
                                title="Upload flow"
                                description="Use uploads to stage audio, confirm the queue, and push files into the workspace."
                                points={[
                                    'Drop one file or a whole batch.',
                                    'Review duplicates and failed items before retrying.',
                                    'Uploaded files continue into recordings and transcript processing.',
                                ]}
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
                                Upload intake
                            </Chip>
                            <Chip variant="soft" color="default">
                                {uploadItems.length} file{uploadItems.length === 1 ? '' : 's'} in queue
                            </Chip>
                            {successCount > 0 && (
                                <Chip variant="soft" color="success">
                                    {successCount} uploaded
                                </Chip>
                            )}
                            {failedCount > 0 && (
                                <Chip variant="soft" color="warning">
                                    {failedCount} need attention
                                </Chip>
                            )}
                            {duplicateCount > 0 && (
                                <Chip variant="soft" color="warning">
                                    {duplicateCount} duplicate{duplicateCount > 1 ? 's' : ''} flagged
                                </Chip>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row xl:flex-col">
                        {!isMobile && (
                            <QuickStartPopover
                                title="Get your first files into the workspace"
                                description="This quick path keeps the upload flow simple the first time through."
                                steps={[
                                    {
                                        title: 'Drop or choose audio files',
                                        description: 'Stage recordings in the queue first so you can review the batch.',
                                    },
                                    {
                                        title: 'Confirm duplicates and failures',
                                        description: 'Check the queue before uploading everything together.',
                                    },
                                    {
                                        title: 'Open recordings after upload',
                                        description: 'Successful files move into the recordings workspace for review.',
                                        href: '/recordings',
                                    },
                                ]}
                            />
                        )}
                        <Link href="/recordings">
                            <Button className="w-full rounded-full px-6 font-semibold">
                                View recordings
                            </Button>
                        </Link>
                        <Link href="/contacts">
                            <Button variant="secondary" className="w-full rounded-full px-6 font-semibold">
                                Review contacts
                            </Button>
                        </Link>
                    </div>
                </div>

                <details className="group border-t border-default-100/80 bg-default-50/50">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 md:px-8 [&::-webkit-details-marker]:hidden">
                        <div className="flex flex-wrap items-center gap-2">
                            <Chip variant="soft" color="default">
                                Queue: {uploadItems.length}
                            </Chip>
                            <Chip variant="soft" color="warning">
                                Ready: {queuedCount + failedCount}
                            </Chip>
                            <Chip variant="soft" color="success">
                                Uploaded: {successCount}
                            </Chip>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-default-500">
                            Upload details
                            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                        </div>
                    </summary>
                    <div className="grid gap-3 border-t border-default-100/80 px-5 py-4 md:grid-cols-2 md:px-8 xl:grid-cols-4">
                        <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                    <HardDriveUpload className="h-3.5 w-3.5" />
                                    Queue size
                                </div>
                                <div className="text-2xl font-bold text-foreground">{uploadItems.length}</div>
                                <div className="text-sm text-default-500">
                                    Files currently staged for upload
                                </div>
                            </div>
                        </Surface>
                        <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                    <Clock3 className="h-3.5 w-3.5" />
                                    Ready now
                                </div>
                                <div className="text-2xl font-bold text-foreground">{queuedCount + failedCount}</div>
                                <div className="text-sm text-default-500">
                                    Files that can be uploaded or retried
                                </div>
                            </div>
                        </Surface>
                        <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Uploaded
                                </div>
                                <div className="text-2xl font-bold text-foreground">{successCount}</div>
                                <div className="text-sm text-default-500">
                                    Files already handed off to the workspace
                                </div>
                            </div>
                        </Surface>
                        <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                    <TriangleAlert className="h-3.5 w-3.5" />
                                    Payload
                                </div>
                                <div className="text-2xl font-bold text-foreground">
                                    {uploadItems.length > 0 ? `${totalSizeMb.toFixed(1)} MB` : '0 MB'}
                                </div>
                                <div className="text-sm text-default-500">
                                    Total size currently staged in the queue
                                </div>
                            </div>
                        </Surface>
                    </div>
                </details>
            </section>

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] items-start">
                <div className="space-y-4 xl:sticky xl:top-8 z-10">
                    <UploadDropzoneCard
                        isDragging={isDragging}
                        onDragEnter={() => setIsDragging(true)}
                        onDragLeave={() => setIsDragging(false)}
                        onDropFiles={addFiles}
                        onSelectFiles={addFiles}
                    />
                </div>

                <div className="space-y-6">
                    {uploadItems.length > 0 ? (
                        <UploadItemsCard
                            uploadItems={uploadItems}
                            isUploading={isUploading}
                            onClearAll={() => setUploadItems([])}
                            onUploadAll={handleUpload}
                            onRemoveFile={removeFile}
                        />
                    ) : (
                        <UploadEmptyState />
                    )}
                </div>
            </div>
        </div>
    );
}
