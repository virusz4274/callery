'use client';

import { decodeUploadQueue, type BrowserUploadItem } from './browser-uploads-contract';

export interface UploadQueuePersistence {
    load(owner: string): Promise<BrowserUploadItem[]>;
    save(owner: string, items: BrowserUploadItem[]): Promise<void>;
}
let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
    database ??= new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') { reject(new Error('Browser storage unavailable.')); return; }
        const request = indexedDB.open('callery-upload-queue', 1);
        request.onupgradeneeded = () => { request.result.createObjectStore('queues'); };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Upload storage is blocked by another tab.'));
        request.onsuccess = () => resolve(request.result);
    });
    return database;
}

export const uploadQueuePersistence: UploadQueuePersistence = {
    async load(owner) {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const request = db.transaction('queues', 'readonly').objectStore('queues').get(owner);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const value: unknown = request.result;
                resolve(decodeUploadQueue(value));
            };
        });
    },
    async save(owner, items) {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('queues', 'readwrite');
            transaction.objectStore('queues').put(items, owner);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error('Browser storage write interrupted.'));
        });
    },
};
