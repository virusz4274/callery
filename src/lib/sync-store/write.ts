import { METADATA_STORE_NAME, STORE_NAME } from './constants';
import { getDB } from './db';
import { generateFingerprint } from './fingerprint';
import type { FolderSyncMetadata, SyncedFile } from './types';

/**
 * Mark a file as synced after successful upload.
 *
 * Uses a single readwrite transaction across both stores so concurrent calls
 * from Promise.all are serialized by IDB — preventing the syncedCount from
 * being incremented from a stale read when multiple files finish at once.
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
        const now = Date.now();

        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME, METADATA_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const metadataStore = transaction.objectStore(METADATA_STORE_NAME);

            const checkRequest = store.get(fingerprint);
            checkRequest.onerror = () => reject(checkRequest.error);
            checkRequest.onsuccess = () => {
                const alreadySynced = !!checkRequest.result;

                store.put({
                    id: fingerprint,
                    fileName,
                    filePath,
                    fileSize,
                    mtime,
                    syncedAt: now,
                    recordingId,
                    folderUri,
                } satisfies SyncedFile);

                const metaRequest = metadataStore.get(folderUri);
                metaRequest.onerror = () => reject(metaRequest.error);
                metaRequest.onsuccess = () => {
                    const existing = metaRequest.result as FolderSyncMetadata | undefined;
                    metadataStore.put({
                        folderUri,
                        syncedCount: (existing?.syncedCount ?? 0) + (alreadySynced ? 0 : 1),
                        lastSyncTime: now,
                    } satisfies FolderSyncMetadata);
                };
            };

            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => resolve();
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
            const transaction = db.transaction([STORE_NAME, METADATA_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();
            const metadataStore = transaction.objectStore(METADATA_STORE_NAME);
            const metadataRequest = metadataStore.clear();

            request.onerror = () => reject(request.error);
            metadataRequest.onerror = () => reject(metadataRequest.error);
            transaction.oncomplete = () => resolve();
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
        const db = await getDB();

        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME, METADATA_STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('folderUri');
            const metadataStore = transaction.objectStore(METADATA_STORE_NAME);
            const range = IDBKeyRange.only(folderUri);
            const cursorRequest = index.openKeyCursor(range);

            cursorRequest.onerror = () => reject(cursorRequest.error);
            cursorRequest.onsuccess = () => {
                const cursor = cursorRequest.result;
                if (!cursor) {
                    metadataStore.delete(folderUri);
                    return;
                }

                store.delete(cursor.primaryKey);
                cursor.continue();
            };

            metadataStore.delete(folderUri);
            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => resolve();
        });
    } catch (error) {
        console.error('[SyncStore] Error clearing folder sync history:', error);
        throw error;
    }
}
