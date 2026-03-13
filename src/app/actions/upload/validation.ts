import { extractFileExtension, validateAudioMimeType } from '@/lib/r2';
import { parseContactFromFilename } from '@/lib/utils/filename-parser';
import { findContactByPhone, findContactByName } from '@/lib/db/contacts';
import { logger } from '@/lib/logger';
import { resolveUploadMimeType } from '@/lib/upload-audio-support';

export interface ValidatedFile {
    file: File;
    buffer: Buffer;
    duration: number;
    contactId: string | null;
    contactName: string | null;
    phoneNumber: string;
    googleContactId: string | undefined;
    extension: string;
    mimeType: string;
    recordedAt: Date;
}

export async function validateAndHydrateFile(file: File, firebaseUid: string): Promise<ValidatedFile | { error: string }> {
    try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const mimeType = resolveUploadMimeType(file.name, file.type);
        if (!mimeType) {
            return { error: `Unsupported file type for ${file.name}` };
        }

        // Extract Metadata (Duration)
        let duration = 0;
        try {
            const { parseBuffer } = await import('music-metadata');
            const metadata = await parseBuffer(buffer, mimeType);
            duration = metadata.format.duration || 0;
        } catch (e) {
            logger.warn(`[validateAndHydrate] Failed to extract duration for ${file.name}:`, e);
        }

        // Parse Filename
        const contactInfo = parseContactFromFilename(file.name);
        const extension = extractFileExtension(file.name);

        // Validate MIME
        if (!validateAudioMimeType(mimeType)) {
            return { error: `Invalid MIME type: ${mimeType}` };
        }

        // Match Contact
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

        // Default recordedAt to now if not in filename, but prefer filename date
        const recordedAt = contactInfo.date || new Date();

        return {
            file,
            buffer,
            duration,
            contactId,
            contactName,
            phoneNumber,
            googleContactId,
            extension,
            mimeType,
            recordedAt
        };
    } catch (error) {
        logger.error(`[validateAndHydrate] Error processing ${file.name}:`, error);
        return { error: 'Processing failed' };
    }
}
