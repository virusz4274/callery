import { ObjectId } from 'mongodb';
import { after } from 'next/server';
import {
    uploadToR2WithMetadata,
    generateRecordingKey,
} from '@/lib/r2';
import { createRecording } from '@/lib/db/recordings';
import {
    incrementStorageUsed,
    setStoragePeakUsed,
    bumpStoragePeakUsed,
} from '@/lib/db/users';
import { reportUsage } from '@/lib/stripe/usage';
import { logger } from '@/lib/logger';
import { validateAndHydrateFile } from './validation';
import { triggerAutoTranscription } from './transcription';

type UploadSingleFileResult =
    | { success: true }
    | { success: false; error: string };

export async function uploadSingleFile(file: File, firebaseUid: string): Promise<UploadSingleFileResult> {
    try {
        const validated = await validateAndHydrateFile(file, firebaseUid);

        if ('error' in validated) {
            logger.warn(`[uploadRecordings] Validation failed for ${file.name}: ${validated.error}`);
            return { success: false, error: `${file.name} (${validated.error})` };
        }

        const {
            buffer,
            duration,
            contactId,
            contactName,
            phoneNumber,
            googleContactId,
            extension,
            mimeType,
            recordedAt,
        } = validated;

        const displayDate = recordedAt.toISOString().split('T')[0];
        const displayTime = recordedAt.toTimeString().split(' ')[0].replace(/:/g, '-');
        const displayName = contactName
            ? `${contactName.replace(/\s+/g, '_')}_${displayDate}_${displayTime}`
            : `${phoneNumber}_${displayDate}_${displayTime}`;

        const r2Key = generateRecordingKey(firebaseUid, contactId, phoneNumber, recordedAt, extension);

        const metadata: Record<string, string> = {
            'contact-name': contactName || phoneNumber,
            'original-filename': file.name,
            'standardized-name': displayName,
            'recorded-at': recordedAt.toISOString(),
            duration: duration.toString(),
        };

        if (googleContactId) {
            metadata['google-contact-id'] = googleContactId;
        }

        await uploadToR2WithMetadata(r2Key, buffer, mimeType, metadata);

        const createdRecording = await createRecording({
            firebaseUid,
            contactId: contactId ? new ObjectId(contactId) : null,
            contactName,
            phoneNumber,
            r2Key,
            fileName: file.name,
            standardizedDisplayName: displayName,
            fileSize: buffer.length,
            mimeType,
            duration: Math.round(duration),
            recordedAt,
            transcriptionStatus: 'pending' as const,
            tags: [],
            isStarred: false,
            isArchived: false,
        });

        logger.info(
            `[uploadRecordings] Success: ${file.name} -> ID: ${createdRecording._id.toString()}, Duration: ${duration}s`
        );

        const updatedUser = await incrementStorageUsed(firebaseUid, buffer.length);
        if (updatedUser) {
            const currentStorage = updatedUser.storageUsed || 0;
            const currentPeak = updatedUser.storagePeakUsed || 0;
            const periodEnd = updatedUser.stripeCurrentPeriodEnd ? new Date(updatedUser.stripeCurrentPeriodEnd) : undefined;
            const peakPeriodEnd = updatedUser.storagePeakPeriodEnd ? new Date(updatedUser.storagePeakPeriodEnd) : undefined;
            const periodMismatch = periodEnd && (!peakPeriodEnd || periodEnd.getTime() !== peakPeriodEnd.getTime());

            if (periodMismatch) {
                await setStoragePeakUsed(firebaseUid, currentStorage, periodEnd);
                await reportUsage(firebaseUid, 'storage', currentStorage, {
                    identifier: `storage:${firebaseUid}:peak:${periodEnd?.toISOString() ?? 'none'}:${currentStorage}`,
                });
            } else if (currentStorage > currentPeak) {
                const updated = await bumpStoragePeakUsed(firebaseUid, currentStorage, periodEnd);
                if (updated) {
                    await reportUsage(firebaseUid, 'storage', currentStorage, {
                        identifier: `storage:${firebaseUid}:peak:${periodEnd?.toISOString() ?? 'none'}:${currentStorage}`,
                    });
                }
            }
        }

        after(async () => {
            await triggerAutoTranscription(
                firebaseUid,
                createdRecording._id.toString(),
                r2Key,
                duration,
                buffer.length,
                file.name,
                displayName
            );
        });

        return { success: true };
    } catch (error) {
        logger.error(`[uploadRecordings] ❌ Failed to upload file ${file.name}:`, error);
        return { success: false, error: file.name };
    }
}
