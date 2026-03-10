export const SUPPORTED_AUDIO_EXTENSIONS = [
    '.mp3',
    '.m4a',
    '.wav',
    '.ogg',
    '.aac',
    '.flac',
    '.wma',
    '.amr',
    '.3gp',
];

export interface AudioFileInfo {
    name: string;
    path: string;
    size: number;
    mtime: number;
    mimeType: string;
}

export function isSupportedAudioFile(filename: string): boolean {
    const lowerName = filename.toLowerCase();
    return SUPPORTED_AUDIO_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

export function getAudioMimeType(filename: string): string {
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
