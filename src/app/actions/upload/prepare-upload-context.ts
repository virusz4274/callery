import { extractFileExtension, generateRecordingKey, validateAudioMimeType } from '@/lib/r2';
import { parseContactFromFilename } from '@/lib/utils/filename-parser';
import { findContactByName, findContactByPhone } from '@/lib/db/contacts';
import { resolveUploadMimeType } from '@/lib/upload-audio-support';

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

type PrepareUploadContextDependencies = {
    resolveUploadMimeType: typeof resolveUploadMimeType;
    validateAudioMimeType: typeof validateAudioMimeType;
    parseContactFromFilename: typeof parseContactFromFilename;
    extractFileExtension: typeof extractFileExtension;
    findContactByPhone: typeof findContactByPhone;
    findContactByName: typeof findContactByName;
    generateRecordingKey: typeof generateRecordingKey;
};

export async function prepareUploadContextWithDependencies(
    authSubject: string,
    fileName: string,
    mimeType: string | undefined,
    dependencies: PrepareUploadContextDependencies
): Promise<PreparedUploadContext | { error: string }> {
    const normalizedMimeType = dependencies.resolveUploadMimeType(fileName, mimeType);
    if (!normalizedMimeType) {
        return { error: `Unsupported file type for ${fileName}` };
    }

    if (!dependencies.validateAudioMimeType(normalizedMimeType)) {
        return { error: `Invalid MIME type: ${normalizedMimeType}` };
    }

    const contactInfo = dependencies.parseContactFromFilename(fileName);
    const extension = dependencies.extractFileExtension(fileName);

    let contactId: string | null = null;
    let contactName = contactInfo.name || null;
    let phoneNumber = contactInfo.phoneNumber || 'Unknown';
    let googleContactId: string | undefined;

    if (contactInfo.phoneNumber) {
        const contact = await dependencies.findContactByPhone(authSubject, contactInfo.phoneNumber);
        if (contact) {
            contactId = contact._id.toString();
            contactName = contact.name;
            phoneNumber = contactInfo.phoneNumber;
            googleContactId = contact.googleContactId;
        }
    } else if (contactInfo.name) {
        const contact = await dependencies.findContactByName(authSubject, contactInfo.name);
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

    const r2Key = dependencies.generateRecordingKey(authSubject, contactId, phoneNumber, recordedAt, extension);

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

export async function prepareUploadContext(
    authSubject: string,
    fileName: string,
    mimeType?: string
): Promise<PreparedUploadContext | { error: string }> {
    return prepareUploadContextWithDependencies(authSubject, fileName, mimeType, {
        resolveUploadMimeType,
        validateAudioMimeType,
        parseContactFromFilename,
        extractFileExtension,
        findContactByPhone,
        findContactByName,
        generateRecordingKey,
    });
}
