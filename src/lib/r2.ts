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

if (!process.env.R2_ENDPOINT) {
    throw new Error('Please define the R2_ENDPOINT environment variable');
}
if (!process.env.R2_ACCESS_KEY_ID) {
    throw new Error('Please define the R2_ACCESS_KEY_ID environment variable');
}
if (!process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error('Please define the R2_SECRET_ACCESS_KEY environment variable');
}
if (!process.env.R2_BUCKET_NAME) {
    throw new Error('Please define the R2_BUCKET_NAME environment variable');
}

/**
 * Cloudflare R2 client (S3-compatible)
 */
export const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME;

/**
 * Allowed audio MIME types for recording uploads.
 */
const ALLOWED_AUDIO_MIME_TYPES = [
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/m4a',
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
];

/**
 * Validate if a MIME type is an allowed audio format.
 */
export function validateAudioMimeType(mimeType: string): boolean {
    return ALLOWED_AUDIO_MIME_TYPES.includes(mimeType.toLowerCase());
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
 * Generate the R2 object key for a recording with new metadata-rich structure.
 * Format: {firebaseUid}/{contactId}/{year}/{month}/{timestamp}_{randomHash}.{extension}
 * 
 * @param firebaseUid - User's Firebase UID
 * @param contactId - Contact ID (MongoDB ObjectId as string) or null for unknown contacts
 * @param phoneNumber - Phone number (used for fallback when contactId is null)
 * @param recordedAt - Recording timestamp
 * @param extension - File extension (e.g., "mp3", "m4a")
 */
export function generateRecordingKey(
    firebaseUid: string,
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

    return `${firebaseUid}/${folderName}/${year}/${month}/${filename}`;
}

/**
 * Upload a file to R2 with custom metadata.
 * 
 * @param key - R2 object key
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
        Bucket: R2_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
    });

    await r2Client.send(command);
}

/**
 * Upload a file to R2 (legacy function for backward compatibility).
 */
export async function uploadToR2(
    key: string,
    body: Buffer | Uint8Array,
    contentType: string
): Promise<void> {
    await uploadToR2WithMetadata(key, body, contentType, {});
}

/**
 * Delete a file from R2.
 */
export async function deleteFromR2(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
    });

    await r2Client.send(command);
}

/**
 * Get a signed URL for accessing a file in R2.
 * URLs expire after the specified duration (default: 1 hour).
 */
export async function getSignedR2Url(
    key: string,
    expiresInSeconds: number = 3600
): Promise<string> {
    const command = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
    });

    return getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Get metadata for an R2 object.
 * 
 * @param key - R2 object key
 * @returns Metadata object or null if object doesn't exist
 */
export async function getR2ObjectMetadata(
    key: string
): Promise<Record<string, string> | null> {
    try {
        const command = new HeadObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
        });

        const response = await r2Client.send(command);
        return response.Metadata || {};
    } catch (error) {
        console.error(`Failed to get metadata for ${key}:`, error);
        return null;
    }
}

/**
 * Copy an R2 object to a new key with optional metadata updates.
 * 
 * @param sourceKey - Source R2 object key
 * @param destinationKey - Destination R2 object key
 * @param metadata - New metadata (if provided, replaces existing metadata)
 */
export async function copyR2Object(
    sourceKey: string,
    destinationKey: string,
    metadata?: Record<string, string>
): Promise<void> {
    const copySource = `${R2_BUCKET}/${sourceKey}`;

    const command = new CopyObjectCommand({
        Bucket: R2_BUCKET,
        CopySource: copySource,
        Key: destinationKey,
        Metadata: metadata,
        MetadataDirective: metadata ? 'REPLACE' : 'COPY',
    });

    await r2Client.send(command);
}
