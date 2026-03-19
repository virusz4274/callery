import type { Folder } from '@/lib/capacitor';
import type { SyncStatus, SyncableFile } from './types';
import {
    generateFingerprint,
    getLastSyncTime,
    getSyncedCount,
    getSyncedFilesMap,
} from '@/lib/sync-store';

export async function initAndroidSyncContext() {
    const { isCapacitorApp, loadSyncFolder } = await import('@/lib/capacitor');
    const isCapacitor = isCapacitorApp();

    return {
        isCapacitor,
        selectedFolder: isCapacitor ? loadSyncFolder() : null,
    };
}

export async function loadSyncStats(folder: Folder) {
    const syncedCount = await getSyncedCount(folder.id);
    const lastSyncTime = await getLastSyncTime(folder.id);

    return {
        lastSyncTime,
        syncedCount,
    };
}

async function mapAudioFilesToSyncable(folder: Folder, audioFiles: {
    name: string;
    path: string;
    size: number;
    mtime: number;
    mimeType: string;
}[]): Promise<SyncableFile[]> {
    const syncedByPath = await getSyncedFilesMap(folder.id);
    return audioFiles.map((file) => {
        const fingerprint = generateFingerprint(folder.id, file.path, file.size, file.mtime);
        const syncedEntry = syncedByPath.get(file.path);
        const isSynced = syncedEntry?.id === fingerprint;

        return {
            ...file,
            fingerprint,
            selected: !isSynced,
            status: isSynced ? ('synced' as SyncStatus) : ('pending' as SyncStatus),
        };
    });
}

export async function loadCachedFolderFiles(folder: Folder): Promise<SyncableFile[] | null> {
    const { getCachedAudioFiles } = await import('@/lib/capacitor');
    const cachedScan = await getCachedAudioFiles(folder);
    if (!cachedScan) {
        return null;
    }

    return await mapAudioFilesToSyncable(folder, cachedScan.files);
}

export async function loadFolderFiles(folder: Folder): Promise<SyncableFile[]> {
    const { listAudioFiles, refreshCachedAudioFiles } = await import('@/lib/capacitor');

    let audioFiles;
    try {
        const refreshedScan = await refreshCachedAudioFiles(folder);
        audioFiles = refreshedScan.files;
    } catch (error) {
        console.error('[AndroidSync] Native folder scan refresh failed, falling back to JS scan:', error);
        audioFiles = await listAudioFiles(folder);
    }

    return await mapAudioFilesToSyncable(folder, audioFiles);
}

export async function pickAndSaveFolder() {
    const { pickSyncFolder, saveSyncFolder } = await import('@/lib/capacitor');
    const folder = await pickSyncFolder();

    if (folder) {
        saveSyncFolder(folder);
    }

    return folder;
}

export async function clearSavedFolder() {
    const { clearSyncFolder } = await import('@/lib/capacitor');
    clearSyncFolder();
}
