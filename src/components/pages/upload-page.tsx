'use client';

import React from 'react';
import { Spinner } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/toast-provider';
import { useUser } from '@/lib/firebase/provider';
import { UploadDropzoneCard } from '@/components/pages/upload/upload-dropzone-card';
import { UploadEmptyState } from '@/components/pages/upload/upload-empty-state';
import { UploadItemsCard } from '@/components/pages/upload/upload-items-card';
import { useUploadQueue } from '@/components/pages/upload/use-upload-queue';

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

    return (
        <div className="space-y-8 relative max-w-7xl mx-auto">
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-3xl opacity-40 animate-pulse" />
                <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-secondary/10 blur-3xl opacity-40" />
            </div>

            <div className="flex flex-col gap-2 text-center md:text-left pt-4">
                <h1 className="text-4xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                    Upload Recordings
                </h1>
                <p className="text-default-500 text-lg">Add new calls to your workspace for instant AI analysis</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-5 lg:sticky lg:top-8 z-10">
                    <UploadDropzoneCard
                        isDragging={isDragging}
                        onDragEnter={() => setIsDragging(true)}
                        onDragLeave={() => setIsDragging(false)}
                        onDropFiles={addFiles}
                        onSelectFiles={addFiles}
                    />
                </div>

                <div className="lg:col-span-7 space-y-6">
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
