import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CopyObjectCommand, CreateMultipartUploadCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListPartsCommand, UploadPartCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getPresignClient, getStorageClient, storageBucket } from '@/lib/r2';
import { ApiError, PART_BYTES, URL_SECONDS } from './contracts';

export const ingestionStorage = {
    async validate(key: string, mimeType: string, size: number, etag?: string) {
        const response = await getStorageClient().send(new GetObjectCommand({ Bucket: storageBucket(), Key: key, IfMatch: etag }));
        if (!response.Body) throw new ApiError(400, 'invalid_audio', 'The uploaded file is empty.');
        const stream = response.Body instanceof Readable ? response.Body : Readable.fromWeb(response.Body.transformToWebStream() as import('node:stream/web').ReadableStream<Uint8Array>);
        let readFailed = false;
        stream.once('error', () => { readFailed = true; });
        try {
            const { parseStream } = await import('music-metadata');
            const result = await parseStream(stream, { mimeType, size }, { duration: true, skipPostHeaders: true });
            const container = result.format.container?.toLowerCase() || '';
            const supported = mimeType === 'audio/mpeg' ? /mpeg/.test(container) && !/mpeg-4/.test(container) : /wav/.test(mimeType) ? /wav|wave/.test(container) : /webm/.test(mimeType) ? /webm|matroska/.test(container) : /mpeg-4|mp4|m4a|quicktime/.test(container);
            if (!supported) throw new ApiError(400, 'invalid_audio', 'The file is not a supported audio/video container.');
            const duration = result.format.duration || 0;
            return Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0;
        } catch (error) {
            if (readFailed) throw new ApiError(503, 'storage_unavailable', 'Storage read was interrupted. Retry this upload.', 30);
            if (error instanceof ApiError) throw error;
            throw new ApiError(400, 'invalid_audio', 'The file could not be parsed as supported audio/video.');
        } finally { stream.destroy(); }
    },
    async create(key: string, mimeType: string) {
        const result = await getStorageClient().send(new CreateMultipartUploadCommand({ Bucket: storageBucket(), Key: key, ContentType: mimeType }));
        if (!result.UploadId) throw new ApiError(503, 'storage_unavailable', 'Storage did not create an upload.', 30);
        return result.UploadId;
    },
    async sign(key: string, uploadId: string, partNumber: number) {
        return getSignedUrl(getPresignClient(), new UploadPartCommand({ Bucket: storageBucket(), Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: URL_SECONDS });
    },
    async parts(key: string, uploadId: string) {
        const parts: { partNumber: number; etag: string; size: number }[] = [];
        let marker: string | undefined;
        do {
            const result = await getStorageClient().send(new ListPartsCommand({ Bucket: storageBucket(), Key: key, UploadId: uploadId, PartNumberMarker: marker }));
            parts.push(...(result.Parts || []).map(part => ({ partNumber: part.PartNumber!, etag: part.ETag!, size: part.Size! })));
            marker = result.IsTruncated ? result.NextPartNumberMarker : undefined;
        } while (marker);
        return parts;
    },
    async putPart(key: string, uploadId: string, partNumber: number, body: Buffer) {
        return getStorageClient().send(new UploadPartCommand({ Bucket: storageBucket(), Key: key, UploadId: uploadId, PartNumber: partNumber, Body: body, ContentLength: body.length }));
    },
    async complete(key: string, uploadId: string, size: number) {
        const parts = await this.parts(key, uploadId);
        const count = Math.ceil(size / PART_BYTES);
        if (parts.length !== count || parts.some((part, index) => part.partNumber !== index + 1 || part.size !== Math.min(PART_BYTES, size - index * PART_BYTES))) throw new ApiError(409, 'incomplete_upload', 'Uploaded parts do not match the expected file size and part layout.');
        await getStorageClient().send(new CompleteMultipartUploadCommand({ Bucket: storageBucket(), Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts.map(part => ({ PartNumber: part.partNumber, ETag: part.etag })) } }));
    },
    async head(key: string) {
        try { return await getStorageClient().send(new HeadObjectCommand({ Bucket: storageBucket(), Key: key })); }
        catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null; throw error; }
    },
    async promote(from: string, to: string, etag?: string) {
        await getStorageClient().send(new CopyObjectCommand({ Bucket: storageBucket(), Key: to, CopySource: `${storageBucket()}/${from.split('/').map(encodeURIComponent).join('/')}`, CopySourceIfMatch: etag }));
    },
    async remove(key: string) { await getStorageClient().send(new DeleteObjectCommand({ Bucket: storageBucket(), Key: key })); },
    async abort(key: string, uploadId: string) {
        try { await getStorageClient().send(new AbortMultipartUploadCommand({ Bucket: storageBucket(), Key: key, UploadId: uploadId })); }
        catch (error) { if ((error as { name?: string }).name !== 'NoSuchUpload') throw error; }
    },
};
