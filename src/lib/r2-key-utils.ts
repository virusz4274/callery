import crypto from 'crypto';

export function extractFileExtension(fileName: string): string {
    const match = fileName.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : 'mp3';
}

export function generateTimestampedFilename(recordedAt: Date, extension: string): string {
    const timestamp = Math.floor(recordedAt.getTime() / 1000);
    const randomHash = crypto.randomBytes(4).toString('hex');
    return `${timestamp}_${randomHash}.${extension}`;
}

export function sanitizePhoneNumber(phoneNumber: string): string {
    return phoneNumber.replace(/[^0-9+]/g, '');
}

export function generateRecordingKey(
    firebaseUid: string,
    contactId: string | null,
    phoneNumber: string,
    recordedAt: Date,
    extension: string
): string {
    const year = recordedAt.getFullYear().toString();
    const month = String(recordedAt.getMonth() + 1).padStart(2, '0');
    const folderName = contactId || `unknown_${sanitizePhoneNumber(phoneNumber)}`;
    const filename = generateTimestampedFilename(recordedAt, extension);

    return `${firebaseUid}/${folderName}/${year}/${month}/${filename}`;
}
