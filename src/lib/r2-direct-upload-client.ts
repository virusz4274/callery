'use client';

import { FileTransfer } from '@capacitor/file-transfer';
import { completeDirectUpload, initializeDirectUpload } from '@/app/actions/upload/direct-upload';

export interface DirectUploadClientResult {
    success: boolean;
    error?: string;
    recordingId?: string;
}

interface NativeUploadOptions {
    fileName: string;
    fileSize: number;
    fileUri: string;
    mimeType?: string;
}

function buildR2ErrorMessage(status: number, statusText: string): string {
    if (status === 403) {
        return 'Upload URL expired or invalid. Please retry.';
    }

    if (status >= 500) {
        return 'Storage provider error. Please retry.';
    }

    return statusText ? `Upload failed (${status} ${statusText})` : `Upload failed (${status})`;
}

function buildNativeUploadErrorMessage(error: unknown): string {
    if (!error || typeof error !== 'object') {
        return 'Upload failed';
    }

    const pluginError = error as {
        message?: string;
        data?: {
            httpStatus?: string | number;
            responseCode?: string | number;
            body?: string;
        };
    };

    const status = pluginError.data?.httpStatus ?? pluginError.data?.responseCode;
    if (typeof status === 'number') {
        return buildR2ErrorMessage(status, '');
    }
    if (typeof status === 'string' && status.length > 0) {
        const parsedStatus = Number.parseInt(status, 10);
        if (Number.isFinite(parsedStatus)) {
            return buildR2ErrorMessage(parsedStatus, '');
        }
    }

    return pluginError.message || 'Upload failed';
}

async function initializeUpload(
    fileName: string,
    fileSize: number,
    mimeType?: string
): Promise<DirectUploadClientResult & { uploadUrl?: string; uploadToken?: string; headers?: Record<string, string> }> {
    const initResult = await initializeDirectUpload({
        fileName,
        fileSize,
        mimeType,
    });

    if (!initResult.success || !initResult.uploadUrl || !initResult.uploadToken) {
        return {
            success: false,
            error: initResult.error || 'Failed to initialize upload',
        };
    }

    return {
        success: true,
        uploadUrl: initResult.uploadUrl,
        uploadToken: initResult.uploadToken,
        headers: initResult.headers,
    };
}

export async function uploadFileDirectToR2(file: File): Promise<DirectUploadClientResult> {
    const initResult = await initializeUpload(file.name, file.size, file.type);
    if (!initResult.success || !initResult.uploadUrl || !initResult.uploadToken) {
        return initResult;
    }

    const uploadResponse = await fetch(initResult.uploadUrl, {
        method: 'PUT',
        headers: initResult.headers,
        body: file,
    });

    if (!uploadResponse.ok) {
        return {
            success: false,
            error: buildR2ErrorMessage(uploadResponse.status, uploadResponse.statusText),
        };
    }

    const completeResult = await completeDirectUpload({
        uploadToken: initResult.uploadToken,
    });

    if (!completeResult.success) {
        return {
            success: false,
            error: completeResult.error || 'Failed to finalize upload',
        };
    }

    return {
        success: true,
        recordingId: completeResult.recordingId,
    };
}

export async function uploadNativeFileDirectToR2({
    fileName,
    fileSize,
    fileUri,
    mimeType,
}: NativeUploadOptions): Promise<DirectUploadClientResult> {
    const initResult = await initializeUpload(fileName, fileSize, mimeType);
    if (!initResult.success || !initResult.uploadUrl || !initResult.uploadToken) {
        return initResult;
    }

    try {
        await FileTransfer.uploadFile({
            url: initResult.uploadUrl,
            path: fileUri,
            method: 'PUT',
            headers: initResult.headers,
            mimeType,
            progress: false,
            chunkedMode: false,
        });
    } catch (error) {
        return {
            success: false,
            error: buildNativeUploadErrorMessage(error),
        };
    }

    const completeResult = await completeDirectUpload({
        uploadToken: initResult.uploadToken,
    });

    if (!completeResult.success) {
        return {
            success: false,
            error: completeResult.error || 'Failed to finalize upload',
        };
    }

    return {
        success: true,
        recordingId: completeResult.recordingId,
    };
}
