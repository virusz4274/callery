import type { Folder } from './capacitor-folder-ops';

const SYNC_FOLDER_KEY = 'vosift_sync_folder';

export function saveSyncFolder(folder: Folder): void {
    try {
        localStorage.setItem(SYNC_FOLDER_KEY, JSON.stringify(folder));
    } catch (error) {
        console.error('Error saving sync folder:', error);
    }
}

export function loadSyncFolder(): Folder | null {
    try {
        const saved = localStorage.getItem(SYNC_FOLDER_KEY);
        if (saved) {
            return JSON.parse(saved) as Folder;
        }
    } catch (error) {
        console.error('Error loading sync folder:', error);
    }

    return null;
}

export function clearSyncFolder(): void {
    try {
        localStorage.removeItem(SYNC_FOLDER_KEY);
    } catch (error) {
        console.error('Error clearing sync folder:', error);
    }
}
