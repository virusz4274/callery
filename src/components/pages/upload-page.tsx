'use client';

import React from 'react';
import { Button, Chip, Spinner } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/toast-provider';
import { useUser } from '@/lib/auth/client';
import { UploadDropzoneCard } from '@/components/pages/upload/upload-dropzone-card';
import { UploadEmptyState } from '@/components/pages/upload/upload-empty-state';
import { UploadItemsCard } from '@/components/pages/upload/upload-items-card';
import { useUploadQueue } from '@/components/pages/upload/use-upload-queue';
import { ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { buildLoginRedirectHref } from '@/lib/auth-redirect';

export function UploadPage({ bulkImportId }: { bulkImportId?: string }) {
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
    } = useUploadQueue(toast, { bulkImportId });

    React.useEffect(() => {
        if (!isUserLoading && !user) {
            router.replace(buildLoginRedirectHref(bulkImportId ? '/transcription/import' : '/upload'));
        }
    }, [bulkImportId, isUserLoading, router, user]);

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
        <div className="w-full min-w-0 space-y-6">


            <PageHeader
                title={bulkImportId ? 'Bulk import recordings' : 'Upload recordings'}
                description={bulkImportId ? 'Upload audio now. Prepare and start transcription batches whenever you are ready.' : "Add audio files to your archive. Review your queue, then upload when you're ready."}
                meta={<Chip variant="soft" color="default" size="sm">{uploadItems.length} in queue</Chip>}
                actions={<Button variant="secondary" onPress={() => router.push(bulkImportId ? '/transcription' : '/recordings')}>{bulkImportId ? 'Manage batches' : 'View recordings'}<ArrowRight className="size-4" /></Button>}
            />
            {bulkImportId && (
                <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm leading-6" role="note">
                    Imported audio stays in Waiting recordings. No AI processing starts until you start a batch. You can return another day.
                </div>
            )}
            {(successCount > 0 || failedCount > 0 || duplicateCount > 0) && (
                <div className="flex flex-wrap gap-2" aria-live="polite">
                    {successCount > 0 && <Chip variant="soft" color="success">{successCount} uploaded</Chip>}
                    {failedCount > 0 && <Chip variant="soft" color="danger">{failedCount} need attention</Chip>}
                    {duplicateCount > 0 && <Chip variant="soft" color="warning">{duplicateCount} duplicate{duplicateCount === 1 ? '' : 's'} flagged</Chip>}
                </div>
            )}

            <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
                <div className="space-y-4 xl:sticky xl:top-24">
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
                            successHref={bulkImportId ? '/transcription' : undefined}
                            successLabel={bulkImportId ? 'Review waiting recordings' : undefined}
                        />
                    ) : (
                        <UploadEmptyState />
                    )}
                </div>
            </div>
        </div>
    );
}
