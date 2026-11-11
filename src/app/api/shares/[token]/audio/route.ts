import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { recordingShares } from '@/lib/recording-shares';
import { getStorageClient, storageBucket } from '@/lib/r2';
import { createSharedAudioHandler } from '@/lib/shared-audio';

export const dynamic = 'force-dynamic';

const handler = createSharedAudioHandler({
    resolve: async token => {
        const shared = await recordingShares.resolve(token);
        return shared ? { key: shared.recording.r2Key, mimeType: shared.recording.mimeType } : null;
    },
    head: async (source, signal) => {
        const object = await getStorageClient().send(new HeadObjectCommand({ Bucket: storageBucket(), Key: source.key }), { abortSignal: signal });
        return { size: object.ContentLength ?? NaN, mimeType: object.ContentType, etag: object.ETag };
    },
    read: async (source, metadata, range, signal) => {
        const object = await getStorageClient().send(new GetObjectCommand({ Bucket: storageBucket(), Key: source.key,
            ...(range ? { Range: range } : {}), ...(metadata.etag ? { IfMatch: metadata.etag } : {}) }), { abortSignal: signal });
        if (!object.Body) throw new Error('Audio is unavailable.');
        const body = object.Body.transformToWebStream();
        const bounds = range?.match(/^bytes=(\d+)-(\d+)$/);
        const expectedLength = bounds ? Number(bounds[2]) - Number(bounds[1]) + 1 : metadata.size;
        if (object.ContentLength !== expectedLength || bounds && object.ContentRange !== `${range!.replace('=', ' ')}/${metadata.size}`) {
            await body.cancel().catch(() => {});
            throw new Error('Storage returned an unexpected audio range.');
        }
        return body;
    },
});

export const GET = handler;
export const HEAD = handler;
