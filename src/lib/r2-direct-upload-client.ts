'use client';

import { completeDirectUpload, initializeDirectUpload } from '@/app/actions/upload/direct-upload';

export interface DirectUploadClientResult {
    success: boolean;
    error?: string;
    recordingId?: string;
}

function buildR2ErrorMessage(status: number, statusText: string): string {
    if (status === 403) {
        return 'Upload URL expired or invalid. Please retry.';
    }

    if (status >= 500) {
        return 'Storage provider error. Please retry.';
    }

    return `Upload failed (${status} ${statusText})`;
}

export async function uploadFileDirectToR2(file: File): Promise<DirectUploadClientResult> {
    const initResult = await initializeDirectUpload({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
    });

    if (!initResult.success || !initResult.uploadUrl || !initResult.uploadToken) {
        return {
            success: false,
            error: initResult.error || 'Failed to initialize upload',
        };
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
