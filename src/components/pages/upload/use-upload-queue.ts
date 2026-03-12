import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadFileDirectToR2 } from '@/lib/r2-direct-upload-client';
import type { UploadItem } from './types';

type ToastFn = (params: {
    title: string;
    description?: string;
    status: 'success' | 'danger' | 'warning';
}) => void;

function createUploadId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return Math.random().toString(36).substring(2);
}

function getFileFingerprint(file: File) {
    return `${file.name.toLowerCase()}-${file.size}-${file.lastModified}`;
}

export function useUploadQueue(toast: ToastFn) {
    const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
    const [isUploading, startUploadTransition] = useTransition();
    const [isDragging, setIsDragging] = useState(false);
    const router = useRouter();

    const addFiles = (files: File[]) => {
        setUploadItems((prev) => {
            const knownFingerprints = new Map(prev.map((item) => [item.fingerprint, item.id]));
            let duplicateCount = 0;

            const nextItems: UploadItem[] = files.map((file) => {
                const fingerprint = getFileFingerprint(file);
                const duplicateOfId = knownFingerprints.get(fingerprint);
                const id = createUploadId();

                if (duplicateOfId) {
                    duplicateCount += 1;
                    return {
                        id,
                        file,
                        status: 'pending',
                        fingerprint,
                        isDuplicate: true,
                        duplicateOfId,
                        error: 'Duplicate file already in queue',
                    };
                }

                knownFingerprints.set(fingerprint, id);
                return {
                    id,
                    file,
                    status: 'pending',
                    fingerprint,
                };
            });

            if (duplicateCount > 0) {
                toast({
                    title: 'Duplicates detected',
                    description: `${duplicateCount} duplicate file(s) were flagged and will be skipped.`,
                    status: 'warning',
                });
            }

            return [...prev, ...nextItems];
        });
    };

    const removeFile = (id: string) => {
        setUploadItems((prev) => prev.filter((item) => item.id !== id));
    };

    const updateItemStatus = (id: string, status: UploadItem['status'], error?: string) => {
        setUploadItems((prev) =>
            prev.map((item) => (item.id === id ? { ...item, status, error } : item))
        );
    };

    const handleUpload = async () => {
        const pendingItems = uploadItems.filter(
            (item) => (item.status === 'pending' || item.status === 'error') && !item.isDuplicate
        );

        if (pendingItems.length === 0) {
            toast({
                title: 'No Files to Upload',
                description: 'All files are already uploaded or none selected.',
                status: 'warning',
            });
            return;
        }

        startUploadTransition(async () => {
            setUploadItems((prev) =>
                prev.map((item) =>
                    (item.status === 'pending' || item.status === 'error') && !item.isDuplicate
                        ? { ...item, status: 'uploading', error: undefined }
                        : item
                )
            );

            const results = await Promise.all(
                pendingItems.map(async (item) => {
                    try {
                        const result = await uploadFileDirectToR2(item.file);

                        if (result.success) {
                            updateItemStatus(item.id, 'success');
                            return { success: true as const };
                        }

                        updateItemStatus(item.id, 'error', result.error || 'Upload failed');
                        return { success: false as const, error: result.error };
                    } catch (error) {
                        console.error(`Failed to upload ${item.file.name}`, error);
                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                        updateItemStatus(item.id, 'error', errorMessage);
                        return { success: false as const, error: errorMessage };
                    }
                })
            );

            const successCount = results.filter((result) => result.success).length;
            const failures = results.filter((result) => !result.success);

            if (successCount > 0) {
                if (failures.length > 0) {
                    toast({
                        title: 'Partially Successful',
                        description: `Uploaded ${successCount} file(s). Failed: ${failures.length} file(s).`,
                        status: 'warning',
                    });
                } else {
                    toast({
                        title: 'Upload Successful',
                        description: `${successCount} file(s) have been uploaded successfully.`,
                        status: 'success',
                    });
                }

                router.refresh();
            } else {
                toast({
                    title: 'Upload Failed',
                    description: failures[0]?.error || 'No files were uploaded.',
                    status: 'danger',
                });
            }
        });
    };

    return {
        uploadItems,
        isUploading,
        isDragging,
        setUploadItems,
        setIsDragging,
        addFiles,
        removeFile,
        handleUpload,
    };
}
