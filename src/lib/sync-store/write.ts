import { STORE_NAME } from './constants';
import { getDB } from './db';
import { generateFingerprint } from './fingerprint';
import { getSyncedFiles } from './read';
import type { SyncedFile } from './types';

/**
 * Mark a file as synced after successful upload.
 */
export async function markAsSynced(
    folderUri: string,
    filePath: string,
    fileName: string,
    fileSize: number,
    mtime: number,
    recordingId: string
): Promise<void> {
    try {
        const db = await getDB();
        const fingerprint = generateFingerprint(folderUri, filePath, fileSize, mtime);

        const syncedFile: SyncedFile = {
            id: fingerprint,
            fileName,
            filePath,
            fileSize,
            mtime,
            syncedAt: Date.now(),
            recordingId,
            folderUri,
        };

        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(syncedFile);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    } catch (error) {
        console.error('[SyncStore] Error marking file as synced:', error);
        throw error;
    }
}

/**
 * Clear all sync history.
 */
export async function clearSyncHistory(): Promise<void> {
    try {
        const db = await getDB();

        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    } catch (error) {
        console.error('[SyncStore] Error clearing sync history:', error);
        throw error;
    }
}

/**
 * Clear sync history for a specific folder only.
 */
export async function clearFolderSyncHistory(folderUri: string): Promise<void> {
    try {
        const files = await getSyncedFiles(folderUri);
        const db = await getDB();

        await new Promise<void>((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            let completed = 0;
            const total = files.length;

            if (total === 0) {
                resolve();
                return;
            }

            for (const file of files) {
                const request = store.delete(file.id);
                request.onsuccess = () => {
                    completed++;
                    if (completed === total) {
                        resolve();
                    }
                };
                request.onerror = () => {
                    completed++;
                    if (completed === total) {
                        resolve();
                    }
                };
            }
        });
    } catch (error) {
        console.error('[SyncStore] Error clearing folder sync history:', error);
        throw error;
    }
}
