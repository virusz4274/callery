type UploadAudioFormat = {
    label: string;
    extensions: readonly string[];
    mimeTypes: readonly string[];
    preferredMimeType: string;
};

export const UPLOAD_AUDIO_FORMATS: readonly UploadAudioFormat[] = [
    {
        label: 'MP3',
        extensions: ['mp3'],
        mimeTypes: ['audio/mpeg'],
        preferredMimeType: 'audio/mpeg',
    },
    {
        label: 'WAV',
        extensions: ['wav'],
        mimeTypes: ['audio/wav', 'audio/x-wav'],
        preferredMimeType: 'audio/wav',
    },
    {
        label: 'M4A',
        extensions: ['m4a'],
        mimeTypes: ['audio/mp4', 'audio/x-m4a', 'audio/m4a'],
        preferredMimeType: 'audio/mp4',
    },
    {
        label: 'MP4',
        extensions: ['mp4'],
        mimeTypes: ['audio/mp4'],
        preferredMimeType: 'audio/mp4',
    },
    {
        label: 'WEBM',
        extensions: ['webm'],
        mimeTypes: ['audio/webm'],
        preferredMimeType: 'audio/webm',
    },
];

const extensionToFormat = new Map<string, UploadAudioFormat>();

for (const format of UPLOAD_AUDIO_FORMATS) {
    for (const extension of format.extensions) {
        extensionToFormat.set(extension, format);
    }
}

export const SUPPORTED_UPLOAD_AUDIO_EXTENSIONS = UPLOAD_AUDIO_FORMATS.flatMap((format) =>
    format.extensions.map((extension) => `.${extension}`)
);

export const SUPPORTED_UPLOAD_AUDIO_MIME_TYPES = new Set(
    UPLOAD_AUDIO_FORMATS.flatMap((format) => format.mimeTypes)
);

export const UPLOAD_AUDIO_FORMAT_LABELS = UPLOAD_AUDIO_FORMATS.map((format) => format.label);

export const UPLOAD_AUDIO_ACCEPT_ATTRIBUTE = [
    ...SUPPORTED_UPLOAD_AUDIO_EXTENSIONS,
    ...Array.from(SUPPORTED_UPLOAD_AUDIO_MIME_TYPES),
    'video/mp4',
].join(',');

function normalizeExtension(extension: string): string {
    return extension.replace(/^\./, '').trim().toLowerCase();
}

function normalizeProvidedMimeType(mimeType?: string | null): string | null {
    const normalized = mimeType?.trim().toLowerCase();
    if (!normalized) {
        return null;
    }

    if (normalized === 'video/mp4') {
        return 'audio/mp4';
    }

    return normalized;
}

export function extractUploadExtension(fileName: string): string | null {
    const match = fileName.match(/\.([^.]+)$/);
    if (!match) {
        return null;
    }

    return normalizeExtension(match[1]);
}

export function getPreferredUploadMimeType(fileName: string): string | null {
    const extension = extractUploadExtension(fileName);
    if (!extension) {
        return null;
    }

    return extensionToFormat.get(extension)?.preferredMimeType ?? null;
}

export function isSupportedUploadFileName(fileName: string): boolean {
    return getPreferredUploadMimeType(fileName) !== null;
}

export function resolveUploadMimeType(fileName: string, mimeType?: string | null): string | null {
    const normalizedMimeType = normalizeProvidedMimeType(mimeType);
    if (normalizedMimeType && SUPPORTED_UPLOAD_AUDIO_MIME_TYPES.has(normalizedMimeType)) {
        return normalizedMimeType;
    }

    return getPreferredUploadMimeType(fileName);
}

export function isSupportedUploadFile(file: { name: string; type?: string | null }): boolean {
    return resolveUploadMimeType(file.name, file.type) !== null;
}
