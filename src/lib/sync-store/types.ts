export interface SyncedFile {
    id: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    mtime: number;
    syncedAt: number;
    recordingId: string;
    folderUri: string;
}

export interface FolderSyncMetadata {
    folderUri: string;
    syncedCount: number;
    lastSyncTime: number | null;
}
