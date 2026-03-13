import { markAsSynced } from '@/lib/sync-store';
import type { Folder } from '@/lib/capacitor';
import { uploadFileDirectToR2 } from '@/lib/r2-direct-upload-client';
import type { SyncableFile } from './types';

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
    const { readFileAsBlob } = await import('@/lib/capacitor');

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];

        onProgress(i + 1, selectedFiles.length, file.name);
        onUploading(file.path);

        try {
            const blob = await readFileAsBlob(selectedFolder, file.path);
            const fileObj = new File([blob], file.name, { type: file.mimeType });
            const result = await uploadFileDirectToR2(fileObj);

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
        }
    }

    return { successCount, failCount };
}
