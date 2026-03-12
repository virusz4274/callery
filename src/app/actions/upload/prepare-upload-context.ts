import { extractFileExtension, generateRecordingKey, validateAudioMimeType } from '@/lib/r2';
import { parseContactFromFilename } from '@/lib/utils/filename-parser';
import { findContactByName, findContactByPhone } from '@/lib/db/contacts';

export interface PreparedUploadContext {
    contactId: string | null;
    contactName: string | null;
    phoneNumber: string;
    googleContactId?: string;
    extension: string;
    mimeType: string;
    recordedAt: Date;
    standardizedDisplayName: string;
    r2Key: string;
}

function inferMimeType(fileName: string): string {
    const extension = extractFileExtension(fileName);

    switch (extension) {
        case 'mp3':
            return 'audio/mpeg';
        case 'wav':
            return 'audio/wav';
        case 'm4a':
            return 'audio/m4a';
        case 'mp4':
            return 'audio/mp4';
        case 'webm':
            return 'audio/webm';
        default:
            return 'audio/mpeg';
    }
}

function normalizeMimeType(fileName: string, mimeType?: string): string {
    const normalized = mimeType?.trim().toLowerCase();
    if (!normalized) {
        return inferMimeType(fileName);
    }

    if (normalized === 'video/mp4') {
        return 'audio/mp4';
    }

    return normalized;
}

export async function prepareUploadContext(
    firebaseUid: string,
    fileName: string,
    mimeType?: string
): Promise<PreparedUploadContext | { error: string }> {
    const normalizedMimeType = normalizeMimeType(fileName, mimeType);

    if (!validateAudioMimeType(normalizedMimeType)) {
        return { error: `Invalid MIME type: ${normalizedMimeType}` };
    }

    const contactInfo = parseContactFromFilename(fileName);
    const extension = extractFileExtension(fileName);

    let contactId: string | null = null;
    let contactName = contactInfo.name || null;
    let phoneNumber = contactInfo.phoneNumber || 'Unknown';
    let googleContactId: string | undefined;

    if (contactInfo.phoneNumber) {
        const contact = await findContactByPhone(firebaseUid, contactInfo.phoneNumber);
        if (contact) {
            contactId = contact._id.toString();
            contactName = contact.name;
            phoneNumber = contactInfo.phoneNumber;
            googleContactId = contact.googleContactId;
        }
    } else if (contactInfo.name) {
        const contact = await findContactByName(firebaseUid, contactInfo.name);
        if (contact) {
            contactId = contact._id.toString();
            contactName = contact.name;
            phoneNumber = contact.phoneNumbers?.[0] || 'Unknown';
            googleContactId = contact.googleContactId;
        }
    }

    const recordedAt = contactInfo.date || new Date();
    const displayDate = recordedAt.toISOString().split('T')[0];
    const displayTime = recordedAt.toTimeString().split(' ')[0].replace(/:/g, '-');
    const standardizedDisplayName = contactName
        ? `${contactName.replace(/\s+/g, '_')}_${displayDate}_${displayTime}`
        : `${phoneNumber}_${displayDate}_${displayTime}`;

    const r2Key = generateRecordingKey(firebaseUid, contactId, phoneNumber, recordedAt, extension);

    return {
        contactId,
        contactName,
        phoneNumber,
        googleContactId,
        extension,
        mimeType: normalizedMimeType,
        recordedAt,
        standardizedDisplayName,
        r2Key,
    };
}
