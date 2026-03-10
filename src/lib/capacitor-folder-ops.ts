import { ScopedStorage, type FolderRef } from '@daniele-rolli/capacitor-scoped-storage';
import { getAudioMimeType, isSupportedAudioFile, type AudioFileInfo } from './capacitor-audio';

export type Folder = FolderRef;

export async function pickSyncFolder(): Promise<Folder | null> {
    try {
        const result = await ScopedStorage.pickFolder();
        return result.folder;
    } catch (error) {
        console.error('Error picking folder:', error);
        return null;
    }
}

export async function listAudioFiles(folder: Folder, subPath?: string): Promise<AudioFileInfo[]> {
    try {
        const options: { folder: Folder; path?: string } = { folder };
        if (subPath && subPath.length > 0) {
            options.path = subPath;
        }

        console.log('[Capacitor] Reading directory:', options);
        const result = await ScopedStorage.readdir(options);
        console.log('[Capacitor] Directory entries:', result.entries.length);

        const audioFiles: AudioFileInfo[] = [];
        for (const entry of result.entries) {
            console.log('[Capacitor] Entry:', entry.name, 'isDir:', entry.isDir);
            if (!entry.isDir && isSupportedAudioFile(entry.name)) {
                audioFiles.push({
                    name: entry.name,
                    path: subPath ? `${subPath}/${entry.name}` : entry.name,
                    size: entry.size || 0,
                    mtime: entry.mtime || Date.now(),
                    mimeType: getAudioMimeType(entry.name),
                });
            }
        }

        console.log('[Capacitor] Audio files found:', audioFiles.length);
        return audioFiles.sort((a, b) => b.mtime - a.mtime);
    } catch (error) {
        console.error('[Capacitor] Error listing audio files:', error);
        throw error;
    }
}

export async function listDirectories(folder: Folder, subPath?: string): Promise<string[]> {
    try {
        const options: { folder: Folder; path?: string } = { folder };
        if (subPath && subPath.length > 0) {
            options.path = subPath;
        }

        const result = await ScopedStorage.readdir(options);
        return result.entries.filter((entry) => entry.isDir).map((entry) => entry.name);
    } catch (error) {
        console.error('[Capacitor] Error listing directories:', error);
        throw error;
    }
}

export async function readFileAsBlob(folder: Folder, filePath: string): Promise<Blob> {
    try {
        const result = await ScopedStorage.readFile({
            folder,
            path: filePath,
            encoding: 'base64',
        });

        const base64Data = result.data;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);

        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        return new Blob([bytes], { type: getAudioMimeType(filePath) });
    } catch (error) {
        console.error('Error reading file:', error);
        throw error;
    }
}
