'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Chip, Spinner } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/toast-provider';
import { useUser } from '@/lib/auth/client';
import { UploadDropzoneCard } from '@/components/pages/upload/upload-dropzone-card';
import { UploadEmptyState } from '@/components/pages/upload/upload-empty-state';
import { UploadItemsCard } from '@/components/pages/upload/upload-items-card';
import { useUploadQueue } from '@/components/pages/upload/use-upload-queue';
import { ArrowRight } from 'lucide-react';
import { buildLoginRedirectHref } from '@/lib/auth-redirect';

export function UploadPage() {
    const { toast } = useToast();
    const router = useRouter();
    const { user, isUserLoading } = useUser();

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
            router.replace(buildLoginRedirectHref('/upload'));
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
    const successCount = uploadItems.filter((item) => item.status === 'success').length;
    const failedCount = uploadItems.filter((item) => item.status === 'error').length;

    return (
        <div className="relative mx-auto max-w-7xl space-y-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top_right,rgba(38,132,255,0.14),transparent_34%),radial-gradient(circle_at_top_left,rgba(13,148,136,0.12),transparent_28%)]" />

            <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
                <div className="grid gap-6 px-5 py-6 md:px-8 md:py-7 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                    <div className="space-y-3">
                        <Chip variant="soft" color="accent" size="sm">
                            Upload intake
                        </Chip>
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-3xl font-black tracking-[-0.05em] text-foreground md:text-4xl">
                                Upload recordings
                            </h1>
                        </div>
                        <p className="max-w-2xl text-sm leading-6 text-default-500">
                            Drop files to add them to your archive.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
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
                        <Link href="/recordings">
                            <Button className="w-full rounded-full px-6 font-semibold">
                                View recordings
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                        <Link href="/contacts">
                            <Button variant="secondary" className="w-full rounded-full px-6 font-semibold">
                                Review contacts
                            </Button>
                        </Link>
                    </div>
                </div>
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
