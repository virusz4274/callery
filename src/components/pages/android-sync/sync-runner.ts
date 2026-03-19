import { markAsSynced } from '@/lib/sync-store';
import type { Folder } from '@/lib/capacitor';
import { uploadFileDirectToR2, uploadNativeFileDirectToR2 } from '@/lib/r2-direct-upload-client';
import type { SyncableFile } from './types';

const MAX_CONCURRENT_SYNC_UPLOADS = 3;

type SyncRunnerParams = {
    selectedFolder: Folder;
    selectedFiles: SyncableFile[];
    onProgress: (current: number, total: number, currentFileName: string) => void;
    onUploading: (path: string) => void;
    onSynced: (path: string) => void;
    onError: (path: string, error: string) => void;
};

export async function syncAndroidFiles({
    selectedFolder,
    selectedFiles,
    onProgress,
    onUploading,
    onSynced,
    onError,
}: SyncRunnerParams): Promise<{ successCount: number; failCount: number }> {
    const { getFileUri, readFileAsBlob } = await import('@/lib/capacitor');

    let successCount = 0;
    let failCount = 0;
    let completedCount = 0;
    let nextFileIndex = 0;

    const reportProgress = (currentFileName: string) => {
        onProgress(completedCount, selectedFiles.length, currentFileName);
    };

    const syncSingleFile = async (file: SyncableFile) => {
        reportProgress(file.name);
        onUploading(file.path);

        try {
            const fileUri = await getFileUri(selectedFolder, file.path);
            const result = fileUri
                ? await uploadNativeFileDirectToR2({
                    fileName: file.name,
                    fileSize: file.size,
                    fileUri,
                    mimeType: file.mimeType,
                })
                : await (async () => {
                    const blob = await readFileAsBlob(selectedFolder, file.path);
                    const fileObj = new File([blob], file.name, { type: file.mimeType });
                    return uploadFileDirectToR2(fileObj);
                })();

            if (result.success && result.recordingId) {
                successCount++;

                await markAsSynced(
                    selectedFolder.id,
                    file.path,
                    file.name,
                    file.size,
                    file.mtime,
                    result.recordingId
                );

                onSynced(file.path);
            } else {
                failCount++;
                onError(file.path, result.error || 'Upload completed without a recording ID');
            }
        } catch (error) {
            failCount++;
            onError(file.path, error instanceof Error ? error.message : 'Upload failed');
        } finally {
            completedCount++;
            reportProgress(file.name);
        }
    };

    const workerCount = Math.min(MAX_CONCURRENT_SYNC_UPLOADS, selectedFiles.length);

    await Promise.all(
        Array.from({ length: workerCount }, async () => {
            while (nextFileIndex < selectedFiles.length) {
                const file = selectedFiles[nextFileIndex];
                nextFileIndex++;

                if (!file) {
                    return;
                }

                await syncSingleFile(file);
            }
        })
    );

    if (selectedFiles.length > 0) {
        reportProgress(selectedFiles[selectedFiles.length - 1]?.name || '');
    }

    return { successCount, failCount };
}
