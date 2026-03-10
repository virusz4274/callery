import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadRecordings } from '@/app/actions/upload-recordings';
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

export function useUploadQueue(toast: ToastFn) {
    const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
    const [isUploading, startUploadTransition] = useTransition();
    const [isDragging, setIsDragging] = useState(false);
    const router = useRouter();

    const addFiles = (files: File[]) => {
        const newItems: UploadItem[] = files.map((file) => ({
            id: createUploadId(),
            file,
            status: 'pending',
        }));

        setUploadItems((prev) => [...prev, ...newItems]);
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
        const pendingItems = uploadItems.filter((item) => item.status === 'pending' || item.status === 'error');

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
                    item.status === 'pending' || item.status === 'error'
                        ? { ...item, status: 'uploading', error: undefined }
                        : item
                )
            );

            const results = await Promise.all(
                pendingItems.map(async (item) => {
                    const formData = new FormData();
                    formData.append('files', item.file);

                    try {
                        const result = await uploadRecordings(formData);

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
