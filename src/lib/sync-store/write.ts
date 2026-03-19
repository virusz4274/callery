import { METADATA_STORE_NAME, STORE_NAME } from './constants';
import { getDB } from './db';
import { generateFingerprint } from './fingerprint';
import type { FolderSyncMetadata, SyncedFile } from './types';

async function readFolderMetadata(folderUri: string): Promise<FolderSyncMetadata | null> {
    const db = await getDB();

    return await new Promise((resolve, reject) => {
        const transaction = db.transaction(METADATA_STORE_NAME, 'readonly');
        const store = transaction.objectStore(METADATA_STORE_NAME);
        const request = store.get(folderUri);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve((request.result as FolderSyncMetadata | undefined) ?? null);
    });
}

async function writeFolderMetadata(metadata: FolderSyncMetadata): Promise<void> {
    const db = await getDB();

    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(METADATA_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(METADATA_STORE_NAME);
        const request = store.put(metadata);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

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
        const alreadySynced = await new Promise<boolean>((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(fingerprint);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(!!request.result);
        });

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

        const existingMetadata = await readFolderMetadata(folderUri);
        await writeFolderMetadata({
            folderUri,
            syncedCount: (existingMetadata?.syncedCount ?? 0) + (alreadySynced ? 0 : 1),
            lastSyncTime: syncedFile.syncedAt,
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
