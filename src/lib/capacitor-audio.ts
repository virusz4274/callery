import {
    getPreferredUploadMimeType,
    isSupportedUploadFileName,
    SUPPORTED_UPLOAD_AUDIO_EXTENSIONS,
} from './upload-audio-support';

export const SUPPORTED_AUDIO_EXTENSIONS = SUPPORTED_UPLOAD_AUDIO_EXTENSIONS;

export interface AudioFileInfo {
    name: string;
    path: string;
    size: number;
    mtime: number;
    mimeType: string;
}

export function isSupportedAudioFile(filename: string): boolean {
    return isSupportedUploadFileName(filename);
}

export function getAudioMimeType(filename: string): string {
    return getPreferredUploadMimeType(filename) || 'audio/mpeg';
}
