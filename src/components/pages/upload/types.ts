export interface UploadItem {
    id: string;
    file: File;
    status: 'pending' | 'uploading' | 'success' | 'error';
    error?: string;
    fingerprint: string;
    isDuplicate?: boolean;
    duplicateOfId?: string;
}
