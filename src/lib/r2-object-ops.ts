import {
    CopyObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import { ALLOWED_AUDIO_MIME_TYPES, R2_BUCKET, r2Client } from './r2-config';

export function validateAudioMimeType(mimeType: string): boolean {
    return ALLOWED_AUDIO_MIME_TYPES.has(mimeType.toLowerCase());
}

export async function uploadToR2WithMetadata(
    key: string,
    body: Buffer | Uint8Array,
    contentType: string,
    metadata: Record<string, string> = {}
): Promise<void> {
    await r2Client.send(
        new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            Body: body,
            ContentType: contentType,
            Metadata: metadata,
        })
    );
}

export async function deleteFromR2(key: string): Promise<void> {
    await r2Client.send(
        new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
        })
    );
}

export async function getSignedR2Url(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(
        r2Client,
        new GetObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
        }),
        { expiresIn: expiresInSeconds }
    );
}

export async function getR2ObjectMetadata(key: string): Promise<Record<string, string> | null> {
    try {
        const response = await r2Client.send(
            new HeadObjectCommand({
                Bucket: R2_BUCKET,
                Key: key,
            })
        );

        return response.Metadata || {};
    } catch (error) {
        console.error(`Failed to get metadata for ${key}:`, error);
        return null;
    }
}

function toNodeReadableStream(body: unknown): Readable | null {
    if (!body) {
        return null;
    }

    if (body instanceof Readable) {
        return body;
    }

    const maybeWebStream = body as { getReader?: unknown };
    if (typeof maybeWebStream.getReader === 'function' && typeof Readable.fromWeb === 'function') {
        return Readable.fromWeb(body as unknown as import('node:stream/web').ReadableStream);
    }

    const maybeTransformable = body as { transformToWebStream?: () => ReadableStream<Uint8Array> };
    if (typeof maybeTransformable.transformToWebStream === 'function' && typeof Readable.fromWeb === 'function') {
        return Readable.fromWeb(
            maybeTransformable.transformToWebStream() as unknown as import('node:stream/web').ReadableStream
        );
    }

    return null;
}

export async function getR2ObjectDurationSeconds(
    key: string,
    mimeType: string,
    size?: number
): Promise<number> {
    try {
        const { parseStream } = await import('music-metadata');
        const response = await r2Client.send(
            new GetObjectCommand({
                Bucket: R2_BUCKET,
                Key: key,
            })
        );

        const stream = toNodeReadableStream(response.Body);
        if (!stream) {
            return 0;
        }

        const metadata = await parseStream(stream, { mimeType, size }, { duration: true, skipPostHeaders: true });
        const duration = metadata.format.duration || 0;
        return Number.isFinite(duration) && duration > 0 ? duration : 0;
    } catch (error) {
        console.error(`Failed to extract duration from ${key}:`, error);
        return 0;
    }
}

export async function copyR2Object(
    sourceKey: string,
    destinationKey: string,
    metadata?: Record<string, string>
): Promise<void> {
    const copySource = `${R2_BUCKET}/${sourceKey}`;

    await r2Client.send(
        new CopyObjectCommand({
            Bucket: R2_BUCKET,
            CopySource: copySource,
            Key: destinationKey,
            Metadata: metadata,
            MetadataDirective: metadata ? 'REPLACE' : 'COPY',
        })
    );
}
