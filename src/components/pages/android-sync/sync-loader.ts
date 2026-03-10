import type { Folder } from '@/lib/capacitor';
import type { SyncStatus, SyncableFile } from './types';
import {
    generateFingerprint,
    getLastSyncTime,
    getSyncedCount,
    getSyncedFingerprints,
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

export async function loadFolderFiles(folder: Folder): Promise<SyncableFile[]> {
    const { listAudioFiles } = await import('@/lib/capacitor');
    const audioFiles = await listAudioFiles(folder);

    const fingerprints = audioFiles.map((file) =>
        generateFingerprint(folder.id, file.path, file.size, file.mtime)
    );
    const syncedSet = await getSyncedFingerprints(fingerprints);

    return audioFiles.map((file, index) => {
        const fingerprint = fingerprints[index];
        const isSynced = syncedSet.has(fingerprint);

        return {
            ...file,
            fingerprint,
            selected: !isSynced,
            status: isSynced ? ('synced' as SyncStatus) : ('pending' as SyncStatus),
        };
    });
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
