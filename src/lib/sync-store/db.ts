import { DB_NAME, DB_VERSION, METADATA_STORE_NAME, STORE_NAME } from './constants';

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDB(): Promise<IDBDatabase> {
    if (dbPromise) {
        return dbPromise;
    }

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

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('folderUri', 'folderUri', { unique: false });
                store.createIndex('syncedAt', 'syncedAt', { unique: false });
            }

            if (!db.objectStoreNames.contains(METADATA_STORE_NAME)) {
                db.createObjectStore(METADATA_STORE_NAME, { keyPath: 'folderUri' });
            }
        };
    });

    return dbPromise;
}
