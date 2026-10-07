import { extractFileExtension, generateRecordingKey, validateAudioMimeType } from '@/lib/r2';
import { parseRecordingFilename, parseUploadContactFromFilename } from '@/lib/utils/filename-parser';
import { findContactById, findContactByName, findContactByPhone } from '@/lib/db/contacts';
import { resolveUploadMimeType } from '@/lib/upload-audio-support';
import { buildRecordingDisplayName } from '@/lib/recording-label';
import type { ParsedContactInfo } from '@/lib/utils/filename-parser';
import type { UploadSessionPayload } from '@/lib/upload-session-token';

export interface PreparedUploadContext {
    contactId: string | null;
    contactName: string | null;
    phoneNumber: string;
    googleContactId?: string;
    contactMatchSource?: 'phone' | 'name';
    extension: string;
    mimeType: string;
    recordedAt: Date;
    standardizedDisplayName: string;
    r2Key: string;
}

type PrepareUploadContextDependencies = {
    resolveUploadMimeType: typeof resolveUploadMimeType;
    validateAudioMimeType: typeof validateAudioMimeType;
    parseContactFromFilename: (fileName: string) => ParsedContactInfo;
    extractFileExtension: typeof extractFileExtension;
    findContactByPhone: typeof findContactByPhone;
    findContactByName: typeof findContactByName;
    findContactById?: typeof findContactById;
    generateRecordingKey: typeof generateRecordingKey;
};

export async function prepareUploadContextWithDependencies(
    authSubject: string,
    fileName: string,
    mimeType: string | undefined,
    dependencies: PrepareUploadContextDependencies
): Promise<PreparedUploadContext | { error: string }> {
    if (parseRecordingFilename(fileName).issues.includes('invalid-filename')) {
        return { error: 'Invalid recording filename. Use a filename without paths or control characters.' };
    }
    const normalizedMimeType = dependencies.resolveUploadMimeType(fileName, mimeType);
    if (!normalizedMimeType) {
        return { error: `Unsupported file type for ${fileName}` };
    }

    if (!dependencies.validateAudioMimeType(normalizedMimeType)) {
        return { error: `Invalid MIME type: ${normalizedMimeType}` };
    }

    const contactInfo = dependencies.parseContactFromFilename(fileName);
    const extension = dependencies.extractFileExtension(fileName);

    const caller = await resolveUploadContactWithDependencies(authSubject, contactInfo, dependencies);
    const { contactId, contactName, phoneNumber, googleContactId, contactMatchSource } = caller;
    const recordedAt = contactInfo.date || new Date();
    const standardizedDisplayName = buildRecordingDisplayName(caller, recordedAt);

    const r2Key = dependencies.generateRecordingKey(authSubject, contactId, phoneNumber, recordedAt, extension);

    return {
        contactId,
        contactName,
        phoneNumber,
        googleContactId,
        contactMatchSource,
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
        parseContactFromFilename: parseUploadContactFromFilename,
        extractFileExtension,
        findContactByPhone,
        findContactByName,
        findContactById,
        generateRecordingKey,
    });
}

// Also used at completion: caller identity may change while the object is uploading.
export async function resolveUploadContactWithDependencies(
    authSubject: string,
    caller: ParsedContactInfo,
    dependencies: Pick<PrepareUploadContextDependencies, 'findContactByPhone' | 'findContactByName' | 'findContactById'>,
    existing?: { contactId: string | null; contactName?: string | null; contactMatchSource?: 'phone' | 'name' },
) {
    const contactMatchSource = caller.phoneNumber ? 'phone' as const : caller.name ? 'name' as const : undefined;
    const retained = contactMatchSource === 'name' && existing?.contactId && dependencies.findContactById
        ? await dependencies.findContactById(authSubject, existing.contactId) : null;
    const contact = retained || (caller.phoneNumber
        ? await dependencies.findContactByPhone(authSubject, caller.phoneNumber)
        : caller.name ? await dependencies.findContactByName(authSubject, caller.name) : null);
    return {
        contactId: contact?._id.toString() ?? null,
        contactName: contact?.name ?? existing?.contactName ?? caller.name,
        phoneNumber: caller.phoneNumber || contact?.phoneNumbers[0] || 'Unknown',
        googleContactId: contact?.googleContactId,
        contactMatchSource,
    };
}

export async function refreshUploadSessionContactWithDependencies(
    authSubject: string,
    payload: UploadSessionPayload,
    dependencies: Pick<PrepareUploadContextDependencies, 'findContactByPhone' | 'findContactByName' | 'findContactById'>,
) {
    const caller = await resolveUploadContactWithDependencies(authSubject, parseUploadContactFromFilename(payload.fileName), dependencies, payload);
    // Only caller metadata is refreshed. The already-uploaded object and signed timestamp stay fixed.
    return { ...payload, ...caller, standardizedDisplayName: buildRecordingDisplayName(caller, new Date(payload.recordedAtIso)) };
}

export async function refreshUploadSessionContact(authSubject: string, payload: UploadSessionPayload) {
    return refreshUploadSessionContactWithDependencies(authSubject, payload, {
        findContactByPhone, findContactByName, findContactById,
    });
}
