/** Browser-safe upload DTOs. Storage keys and credentials never cross this boundary. */
export interface BrowserUploadPart { partNumber: number; size: number; etag: string }
export interface BrowserUploadSession {
    id: string;
    state: 'initializing' | 'uploading' | 'finalizing' | 'completed' | 'cancelled' | 'expired';
    fileSize: number;
    partSize: number;
    partCount: number;
    expiresAt: string;
    recordingId: string | null;
    transport: 'direct' | 'proxy';
    parts?: BrowserUploadPart[];
    errorCode?: string;
}

export type BrowserUploadStatus = 'pending' | 'queued' | 'uploading' | 'paused' | 'offline' | 'needs-file' | 'finalizing' | 'success' | 'error' | 'cancelled' | 'expired';
export interface BrowserUploadItem {
    id: string;
    fileName: string;
    fileSize: number;
    lastModified: number;
    mimeType: string;
    fingerprint: string;
    requestKey: string;
    bulkImportId?: string;
    status: BrowserUploadStatus;
    sessionId?: string;
    initializationStarted?: boolean;
    expiresAt?: string;
    recordingId?: string;
    completedBytes: number;
    progressBytes: number;
    /** Saved before sending each part, for safe original-file reselection. */
    checksums: Record<number, string>;
    error?: string;
    isDuplicate?: boolean;
    duplicateOfId?: string;
}

export function browserFileFingerprint(file: Pick<File, 'name' | 'size' | 'lastModified'>) {
    return `${file.name.toLowerCase()}-${file.size}-${file.lastModified}`;
}

export function originalFileMatches(item: BrowserUploadItem, file: Pick<File, 'name' | 'size' | 'lastModified'>) {
    return item.fileName === file.name && item.fileSize === file.size && item.lastModified === file.lastModified;
}

export const uploadIsActive = (status: BrowserUploadStatus) => status === 'uploading' || status === 'finalizing' || status === 'queued';

/** Treat browser persistence as untrusted input and restore only known metadata. */
export function decodeUploadQueue(value: unknown): BrowserUploadItem[] {
    if (!Array.isArray(value)) return [];
    const statuses = new Set<string>(['pending', 'queued', 'uploading', 'paused', 'offline', 'needs-file', 'finalizing', 'success', 'error', 'cancelled', 'expired']);
    const text = (input: unknown, max = 200) => typeof input === 'string' && input.length > 0 && input.length <= max;
    const optionalText = (input: unknown, max = 200) => input === undefined || text(input, max);
    return value.flatMap((input: unknown): BrowserUploadItem[] => {
        if (!input || typeof input !== 'object') return [];
        const item = input as BrowserUploadItem;
        if (!text(item.id) || !text(item.fileName, 255) || !Number.isSafeInteger(item.fileSize) || item.fileSize < 1 || item.fileSize > 5 * 1024 ** 3 ||
            !Number.isSafeInteger(item.lastModified) || item.lastModified < 0 || typeof item.mimeType !== 'string' || item.mimeType.length > 127 ||
            !text(item.requestKey) || !/^[\x21-\x7e]+$/.test(item.requestKey) || !statuses.has(item.status) ||
            item.fingerprint !== browserFileFingerprint({ name: item.fileName, size: item.fileSize, lastModified: item.lastModified }) ||
            !Number.isSafeInteger(item.completedBytes) || item.completedBytes < 0 || item.completedBytes > item.fileSize ||
            !optionalText(item.bulkImportId, 128) || !optionalText(item.sessionId) || !optionalText(item.recordingId) || !optionalText(item.duplicateOfId) ||
            (item.error !== undefined && typeof item.error !== 'string') || (item.isDuplicate !== undefined && typeof item.isDuplicate !== 'boolean') ||
            (item.initializationStarted !== undefined && typeof item.initializationStarted !== 'boolean') ||
            (item.expiresAt !== undefined && (typeof item.expiresAt !== 'string' || !Number.isFinite(Date.parse(item.expiresAt)))) ||
            !item.checksums || typeof item.checksums !== 'object' || Array.isArray(item.checksums) || Object.entries(item.checksums).some(([part, hash]) =>
                !/^[1-9]\d{0,3}$/.test(part) || typeof hash !== 'string' || !/^[a-f\d]{64}$/.test(hash))) return [];
        return [{
            id: item.id, fileName: item.fileName, fileSize: item.fileSize, lastModified: item.lastModified, mimeType: item.mimeType, fingerprint: item.fingerprint,
            requestKey: item.requestKey, status: item.status, completedBytes: item.completedBytes, progressBytes: item.completedBytes, checksums: { ...item.checksums },
            ...(item.bulkImportId ? { bulkImportId: item.bulkImportId } : {}), ...(item.sessionId ? { sessionId: item.sessionId } : {}),
            ...(item.expiresAt ? { expiresAt: item.expiresAt } : {}), ...(item.recordingId ? { recordingId: item.recordingId } : {}),
            ...(item.error ? { error: item.error.slice(0, 2000) } : {}), ...(item.isDuplicate ? { isDuplicate: true, duplicateOfId: item.duplicateOfId } : {}),
            ...(item.initializationStarted ? { initializationStarted: true } : {}),
        }];
    });
}
