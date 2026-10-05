import { Readable } from 'node:stream';
import { logger } from './logger';
import { SUPPORTED_UPLOAD_AUDIO_MIME_TYPES } from './upload-audio-support';
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    CopyObjectCommand,
} from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { FetchHttpHandler } from '@smithy/fetch-http-handler';
import { storageConfig } from './config';

let client: S3Client | undefined;

/**
 * Lazily create (and cache) the shared S3-compatible storage client.
 * Works with MinIO, Cloudflare R2, AWS S3, or any S3-compatible backend
 * via endpoint/region/path-style settings. Env is read here — never at
 * import time — so builds and unrelated routes don't require storage
 * credentials to merely import this module.
 *
 * Uses the fetch-based HTTP handler so the same code runs on Node.js and
 * on edge runtimes (Cloudflare Workers) where Node's http stack is
 * unavailable.
 */
export function getStorageClient(): S3Client {
    if (!client) {
        const cfg = storageConfig();
        client = new S3Client({
            region: cfg.region,
            endpoint: cfg.endpoint,
            forcePathStyle: cfg.forcePathStyle,
            credentials: {
                accessKeyId: cfg.accessKeyId,
                secretAccessKey: cfg.secretAccessKey,
            },
            requestHandler: new FetchHttpHandler(),
        });
    }
    return client;
}

export function storageBucket(): string {
    return storageConfig().bucket;
}

let presignClient: S3Client | undefined;
let presignEndpoint: string | undefined;

/**
 * Client used ONLY for presigning browser-facing playback URLs. SigV4 signs
 * the request host, so when S3_PUBLIC_ENDPOINT differs from the server-side
 * endpoint (e.g. MinIO reachable as minio:9000 from the app but as
 * localhost:9000 from the browser) the URL must be SIGNED with the public
 * host — string-replacing the host after signing would invalidate it.
 */
export function getPresignClient(): S3Client {
    const cfg = storageConfig();
    const endpoint = cfg.publicEndpoint || cfg.endpoint;
    if (!presignClient || presignEndpoint !== endpoint) {
        presignEndpoint = endpoint;
        presignClient =
            endpoint === cfg.endpoint
                ? getStorageClient()
                : new S3Client({
                      region: cfg.region,
                      endpoint,
                      forcePathStyle: cfg.forcePathStyle,
                      credentials: {
                          accessKeyId: cfg.accessKeyId,
                          secretAccessKey: cfg.secretAccessKey,
                      },
                      requestHandler: new FetchHttpHandler(),
                  });
    }
    return presignClient;
}

/**
 * Allowed audio MIME types for recording uploads.
 * Using a Set for O(1) lookup performance.
 */
const ALLOWED_AUDIO_MIME_TYPES = SUPPORTED_UPLOAD_AUDIO_MIME_TYPES;

/**
 * Validate if a MIME type is an allowed audio format.
 */
export function validateAudioMimeType(mimeType: string): boolean {
    return ALLOWED_AUDIO_MIME_TYPES.has(mimeType.toLowerCase());
}

/**
 * Extract file extension from filename.
 * Returns extension without the dot (e.g., "mp3", "m4a").
 */
export function extractFileExtension(fileName: string): string {
    const match = fileName.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : 'mp3'; // Default to mp3 if no extension
}

/**
 * Generate a timestamped filename with random hash.
 * Format: {timestamp}_{randomHash}.{extension}
 */
export function generateTimestampedFilename(
    recordedAt: Date,
    extension: string
): string {
    const timestamp = Math.floor(recordedAt.getTime() / 1000); // Unix timestamp
    const randomHash = crypto.randomBytes(4).toString('hex'); // 8-character hex
    return `${timestamp}_${randomHash}.${extension}`;
}

/**
 * Sanitize phone number for use in folder names.
 * Keeps only digits and plus sign.
 */
export function sanitizePhoneNumber(phoneNumber: string): string {
    return phoneNumber.replace(/[^0-9+]/g, '');
}

/**
 * Generate the storage object key for a recording with new metadata-rich structure.
 * Format: {authSubject}/{contactId}/{year}/{month}/{timestamp}_{randomHash}.{extension}
 *
 * @param authSubject - User's opaque auth subject (stable across auth providers)
 * @param contactId - Contact ID (MongoDB ObjectId as string) or null for unknown contacts
 * @param phoneNumber - Phone number (used for fallback when contactId is null)
 * @param recordedAt - Recording timestamp
 * @param extension - File extension (e.g., "mp3", "m4a")
 */
export function generateRecordingKey(
    authSubject: string,
    contactId: string | null,
    phoneNumber: string,
    recordedAt: Date,
    extension: string
): string {
    const year = recordedAt.getFullYear().toString();
    const month = String(recordedAt.getMonth() + 1).padStart(2, '0');

    // Use contactId if available, otherwise use unknown_{phoneNumber}
    const folderName = contactId || `unknown_${sanitizePhoneNumber(phoneNumber)}`;

    const filename = generateTimestampedFilename(recordedAt, extension);

    return `${authSubject}/${folderName}/${year}/${month}/${filename}`;
}

/**
 * Upload a file to storage with custom metadata.
 *
 * @param key - Object key
 * @param body - File content
 * @param contentType - MIME type
 * @param metadata - Custom metadata (keys will be prefixed with x-amz-meta-)
 */
export async function uploadToR2WithMetadata(
    key: string,
    body: Buffer | Uint8Array,
    contentType: string,
    metadata: Record<string, string> = {}
): Promise<void> {
    const command = new PutObjectCommand({
        Bucket: storageBucket(),
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
    });

    await getStorageClient().send(command);
}



/**
 * Delete a file from storage.
 */
export async function deleteFromR2(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
        Bucket: storageBucket(),
        Key: key,
    });

    await getStorageClient().send(command);
}

/**
 * Get a signed URL for accessing a file in storage.
 * URLs expire after the specified duration (default: 1 hour).
 * Signed against S3_PUBLIC_ENDPOINT when set (see getPresignClient).
 */
export async function getSignedR2Url(
    key: string,
    expiresInSeconds: number = 3600
): Promise<string> {
    const command = new GetObjectCommand({
        Bucket: storageBucket(),
        Key: key,
    });

    return getSignedUrl(getPresignClient(), command, { expiresIn: expiresInSeconds });
}

/** Sign against the internal storage endpoint for downloads by the app itself. */
export async function getSignedStorageUrl(
    key: string,
    expiresInSeconds: number = 3600,
): Promise<string> {
    return getSignedUrl(
        getStorageClient(),
        new GetObjectCommand({ Bucket: storageBucket(), Key: key }),
        { expiresIn: expiresInSeconds },
    );
}

/**
 * Get metadata for a storage object.
 *
 * @param key - Object key
 * @returns Metadata object or null if object doesn't exist
 */
export async function getR2ObjectMetadata(
    key: string
): Promise<Record<string, string> | null> {
    try {
        const command = new HeadObjectCommand({
            Bucket: storageBucket(),
            Key: key,
        });

        const response = await getStorageClient().send(command);
        return response.Metadata || {};
    } catch (error) {
        console.error(`Failed to get metadata for ${key}:`, error);
        return null;
    }
}

/**
 * Copy a storage object to a new key with optional metadata updates.
 *
 * @param sourceKey - Source object key
 * @param destinationKey - Destination object key
 * @param metadata - New metadata (if provided, replaces existing metadata)
 */
export async function copyR2Object(
    sourceKey: string,
    destinationKey: string,
    metadata?: Record<string, string>
): Promise<void> {
    const copySource = `${storageBucket()}/${sourceKey}`;

    const command = new CopyObjectCommand({
        Bucket: storageBucket(),
        CopySource: copySource,
        Key: destinationKey,
        Metadata: metadata,
        MetadataDirective: metadata ? 'REPLACE' : 'COPY',
    });

    await getStorageClient().send(command);
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
        const response = await getStorageClient().send(
            new GetObjectCommand({
                Bucket: storageBucket(),
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
        logger.error(`Failed to extract duration from ${key}:`, error);
        return 0;
    }
}
