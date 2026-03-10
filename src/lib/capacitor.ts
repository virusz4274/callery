import { Capacitor } from '@capacitor/core';

export function isCapacitorApp(): boolean {
    return Capacitor.isNativePlatform();
}

export function getPlatform(): string {
    return Capacitor.getPlatform();
}

export type { AudioFileInfo } from './capacitor-audio';
export { isSupportedAudioFile } from './capacitor-audio';
export type { Folder } from './capacitor-folder-ops';
export { listAudioFiles, listDirectories, pickSyncFolder, readFileAsBlob } from './capacitor-folder-ops';
export { clearSyncFolder, loadSyncFolder, saveSyncFolder } from './capacitor-sync-storage';
