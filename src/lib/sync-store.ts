/**
 * Sync Store - IndexedDB-based storage for tracking synced files
 * 
 * Prevents duplicate uploads by tracking which files have already been
 * synced to the cloud. Uses file fingerprints (path + size + mtime) to
 * identify files.
 */

const DB_NAME = 'vosift_sync_store';
const DB_VERSION = 1;
const STORE_NAME = 'synced_files';

export interface SyncedFile {
    id: string;              // fingerprint: `${folderUri}:${path}:${size}:${mtime}`
    fileName: string;
    filePath: string;
    fileSize: number;
    mtime: number;
    syncedAt: number;        // timestamp
    recordingId: string;     // server ID after upload
    folderUri: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize and get the IndexedDB database connection
 */
function getDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('[SyncStore] Failed to open database:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            // Create the synced_files store with indexes
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('folderUri', 'folderUri', { unique: false });
                store.createIndex('syncedAt', 'syncedAt', { unique: false });
            }
        };
    });

    return dbPromise;
}

/**
 * Generate a fingerprint for a file that can be used to identify it
 */
export function generateFingerprint(
    folderUri: string,
    filePath: string,
    fileSize: number,
    mtime: number
): string {
    return `${folderUri}:${filePath}:${fileSize}:${mtime}`;
}

/**
 * Check if a file has already been synced
 */
export async function isSynced(fingerprint: string): Promise<boolean> {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
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
 * Check multiple files at once for sync status
 * Returns a Set of fingerprints that are synced
 */
export async function getSyncedFingerprints(fingerprints: string[]): Promise<Set<string>> {
    const synced = new Set<string>();
    try {
        const db = await getDB();
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);

        await Promise.all(
            fingerprints.map(
                (fp) =>
                    new Promise<void>((resolve) => {
                        const request = store.get(fp);
                        request.onsuccess = () => {
                            if (request.result) synced.add(fp);
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
 * Mark a file as synced after successful upload
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

        return new Promise((resolve, reject) => {
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
 * Get count of synced files for a folder
 */
export async function getSyncedCount(folderUri: string): Promise<number> {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
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
 * Get all synced files for a folder
 */
export async function getSyncedFiles(folderUri: string): Promise<SyncedFile[]> {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('folderUri');
            const request = index.getAll(IDBKeyRange.only(folderUri));

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result || []);
        });
    } catch (error) {
        console.error('[SyncStore] Error getting synced files:', error);
        return [];
    }
}

/**
 * Get the most recent sync timestamp for a folder
 */
export async function getLastSyncTime(folderUri: string): Promise<number | null> {
    try {
        const files = await getSyncedFiles(folderUri);
        if (files.length === 0) return null;

        return Math.max(...files.map((f) => f.syncedAt));
    } catch (error) {
        console.error('[SyncStore] Error getting last sync time:', error);
        return null;
    }
}

/**
 * Clear all sync history (useful for troubleshooting or resetting)
 */
export async function clearSyncHistory(): Promise<void> {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
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
 * Clear sync history for a specific folder only
 */
export async function clearFolderSyncHistory(folderUri: string): Promise<void> {
    try {
        const files = await getSyncedFiles(folderUri);
        const db = await getDB();

        return new Promise((resolve, reject) => {
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
                    if (completed === total) resolve();
                };
                request.onerror = () => {
                    completed++;
                    if (completed === total) resolve();
                };
            }
        });
    } catch (error) {
        console.error('[SyncStore] Error clearing folder sync history:', error);
        throw error;
    }
}
