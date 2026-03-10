import { STORE_NAME } from './constants';
import { getDB } from './db';
import type { SyncedFile } from './types';

/**
 * Check if a file has already been synced.
 */
export async function isSynced(fingerprint: string): Promise<boolean> {
    try {
        const db = await getDB();

        return await new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(fingerprint);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(!!request.result);
        });
    } catch (error) {
        console.error('[SyncStore] Error checking sync status:', error);
        return false;
    }
}

/**
 * Check multiple files at once for sync status.
 */
export async function getSyncedFingerprints(fingerprints: string[]): Promise<Set<string>> {
    const synced = new Set<string>();

    try {
        const db = await getDB();
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);

        await Promise.all(
            fingerprints.map(
                (fingerprint) =>
                    new Promise<void>((resolve) => {
                        const request = store.get(fingerprint);
                        request.onsuccess = () => {
                            if (request.result) {
                                synced.add(fingerprint);
                            }
                            resolve();
                        };
                        request.onerror = () => resolve();
                    })
            )
        );
    } catch (error) {
        console.error('[SyncStore] Error getting synced fingerprints:', error);
    }

    return synced;
}

/**
 * Get count of synced files for a folder.
 */
export async function getSyncedCount(folderUri: string): Promise<number> {
    try {
        const db = await getDB();

        return await new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('folderUri');
            const request = index.count(IDBKeyRange.only(folderUri));

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    } catch (error) {
        console.error('[SyncStore] Error getting synced count:', error);
        return 0;
    }
}

/**
 * Get all synced files for a folder.
 */
export async function getSyncedFiles(folderUri: string): Promise<SyncedFile[]> {
    try {
        const db = await getDB();

        return await new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('folderUri');
            const request = index.getAll(IDBKeyRange.only(folderUri));

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve((request.result as SyncedFile[]) || []);
        });
    } catch (error) {
        console.error('[SyncStore] Error getting synced files:', error);
        return [];
    }
}

/**
 * Get the most recent sync timestamp for a folder.
 */
export async function getLastSyncTime(folderUri: string): Promise<number | null> {
    try {
        const files = await getSyncedFiles(folderUri);
        if (files.length === 0) {
            return null;
        }

        return Math.max(...files.map((file) => file.syncedAt));
    } catch (error) {
        console.error('[SyncStore] Error getting last sync time:', error);
        return null;
    }
}
