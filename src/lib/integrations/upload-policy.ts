import { billingEnabled } from '@/lib/config';
import { ApiError, PART_BYTES } from './contracts';

/** A declaration is not evidence: this is enabled only after the isolated
 * oversized PUT/part acceptance check succeeds for the deployed bucket. */
export function directUploadLengthsVerified(): boolean {
    return !billingEnabled() || process.env.BILLING_STORAGE_LENGTH_VERIFIED === 'true';
}

export function expectedPartLength(fileSize: number, partNumber: number): number {
    if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || !Number.isSafeInteger(partNumber)
        || partNumber < 1 || partNumber > Math.ceil(fileSize / PART_BYTES)) {
        throw new ApiError(400, 'invalid_part', 'Part is outside the reserved upload.');
    }
    return Math.min(PART_BYTES, fileSize - (partNumber - 1) * PART_BYTES);
}

export function requireSignedContentLength(url: string): string {
    const signed = new URL(url).searchParams.get('X-Amz-SignedHeaders')?.split(';') || [];
    if (!signed.includes('content-length')) throw new ApiError(503, 'storage_configuration', 'Storage did not sign the upload size.');
    return url;
}
