/**
 * Capacitor Utilities for Native App Features
 * 
 * This module provides utilities for Capacitor-specific functionality,
 * particularly file system access for Android folder sync using SAF.
 */

import { Capacitor } from '@capacitor/core';
import { ScopedStorage, FolderRef } from '@daniele-rolli/capacitor-scoped-storage';

// Re-export FolderRef as Folder for cleaner API
export type Folder = FolderRef;

/**
 * Check if the app is running in a native Capacitor environment
 */
export function isCapacitorApp(): boolean {
    return Capacitor.isNativePlatform();
}

/**
 * Get the platform name (android, ios, web)
 */
export function getPlatform(): string {
    return Capacitor.getPlatform();
}

/**
 * Audio file extensions we support for sync
 */
const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.ogg', '.aac', '.flac', '.wma', '.amr', '.3gp'];

/**
 * Check if a filename is a supported audio file
 */
export function isSupportedAudioFile(filename: string): boolean {
    const lowerName = filename.toLowerCase();
    return SUPPORTED_AUDIO_EXTENSIONS.some(ext => lowerName.endsWith(ext));
}

export interface AudioFileInfo {
    name: string;
    path: string;
    size: number;
    mtime: number; // Last modified timestamp
    mimeType: string;
}

/**
 * Get the MIME type for an audio file based on extension
 */
function getAudioMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
        mp3: 'audio/mpeg',
        m4a: 'audio/mp4',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        aac: 'audio/aac',
        flac: 'audio/flac',
        wma: 'audio/x-ms-wma',
        amr: 'audio/amr',
        '3gp': 'audio/3gpp',
    };
    return mimeTypes[ext || ''] || 'audio/mpeg';
}

/**
 * Open Android's SAF folder picker dialog
 * Returns a Folder object that can be used for file operations
 */
export async function pickSyncFolder(): Promise<Folder | null> {
    try {
        const result = await ScopedStorage.pickFolder();
        return result.folder;
    } catch (error) {
        console.error('Error picking folder:', error);
        return null;
    }
}

/**
 * List audio files in a selected folder using SAF
 * @param folder - The folder object from pickSyncFolder()
 * @param subPath - Optional subdirectory path within the folder
 */
export async function listAudioFiles(folder: Folder, subPath?: string): Promise<AudioFileInfo[]> {
    try {
        // Build readdir options - omit path for root folder
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
        // Sort by modified time (newest first)
        return audioFiles.sort((a, b) => b.mtime - a.mtime);
    } catch (error) {
        console.error('[Capacitor] Error listing audio files:', error);
        throw error;
    }
}

/**
 * List subdirectories in a folder
 * @param folder - The folder object from pickSyncFolder()
 * @param subPath - Optional subdirectory path
 */
export async function listDirectories(folder: Folder, subPath?: string): Promise<string[]> {
    try {
        // Build readdir options - omit path for root folder
        const options: { folder: Folder; path?: string } = { folder };
        if (subPath && subPath.length > 0) {
            options.path = subPath;
        }

        const result = await ScopedStorage.readdir(options);

        return result.entries
            .filter((entry) => entry.isDir)
            .map((entry) => entry.name);
    } catch (error) {
        console.error('[Capacitor] Error listing directories:', error);
        throw error;
    }
}

/**
 * Read a file from the selected folder and return it as a Blob for upload
 * @param folder - The folder object from pickSyncFolder()
 * @param filePath - Path to the file relative to the folder
 */
export async function readFileAsBlob(folder: Folder, filePath: string): Promise<Blob> {
    try {
        const result = await ScopedStorage.readFile({
            folder,
            path: filePath,
            encoding: 'base64',
        });

        // Convert base64 to blob
        const base64Data = result.data;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);

        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const mimeType = getAudioMimeType(filePath);
        return new Blob([bytes], { type: mimeType });
    } catch (error) {
        console.error('Error reading file:', error);
        throw error;
    }
}

// Storage key for persisting selected folder
const SYNC_FOLDER_KEY = 'vosift_sync_folder';

/**
 * Save the selected folder to local storage for persistence
 */
export function saveSyncFolder(folder: Folder): void {
    try {
        localStorage.setItem(SYNC_FOLDER_KEY, JSON.stringify(folder));
    } catch (error) {
        console.error('Error saving sync folder:', error);
    }
}

/**
 * Load the previously selected folder from local storage
 */
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

/**
 * Clear the saved sync folder
 */
export function clearSyncFolder(): void {
    try {
        localStorage.removeItem(SYNC_FOLDER_KEY);
    } catch (error) {
        console.error('Error clearing sync folder:', error);
    }
}
