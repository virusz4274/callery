'use server';

import { ObjectId } from 'mongodb';
import { after } from 'next/server';
import { getFirebaseAdminApp } from '@/lib/firebase/admin';
import {
  uploadToR2WithMetadata,
  generateRecordingKey
} from '@/lib/r2';
import { createRecording } from '@/lib/db/recordings';
import { incrementStorageUsed, findUserByFirebaseUid, checkAndResetUsageCycle, setStoragePeakUsed, bumpStoragePeakUsed } from '@/lib/db/users';
import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { checkUserAccess, checkStorageAccess } from '@/lib/access-control';
import { reportUsage } from '@/lib/stripe/usage';
import { logger } from '@/lib/logger';
import pLimit from 'p-limit';

import { validateAndHydrateFile } from './upload/validation';
import { triggerAutoTranscription } from './upload/transcription';

// Initialize Firebase Admin
getFirebaseAdminApp();

/**
 * Upload recordings to R2 and save metadata to MongoDB.
 */
export async function uploadRecordings(
  formData: FormData
): Promise<{ success: boolean; count: number; error?: string }> {
  const firebaseUid = await getFirebaseUidFromSession();

  if (!firebaseUid) {
    return { success: false, count: 0, error: 'Not authenticated' };
  }

  const user = await findUserByFirebaseUid(firebaseUid);
  if (!user) {
    return { success: false, count: 0, error: 'User not found' };
  }

  // 1. Check General Access (e.g. Disabled?)
  const generalAccess = checkUserAccess(user);
  if (!generalAccess.allowed) {
    return { success: false, count: 0, error: generalAccess.reason || 'Access denied' };
  }

  // 2. Check & Reset Usage Cycle
  const currentUser = await checkAndResetUsageCycle(user);

  // 3. Pre-calculate total size to check storage roughly
  let totalUploadSize = 0;
  const files = formData.getAll('files') as File[];
  for (const file of files) {
    totalUploadSize += file.size;
  }

  if (files.length > 0) {
    // Check storage access for the BATCH
    const storageAccess = checkStorageAccess(currentUser, totalUploadSize);
    if (!storageAccess.allowed) {
      return { success: false, count: 0, error: storageAccess.reason || 'Storage limit exceeded' };
    }
  }

  if (!files || files.length === 0) {
    return { success: false, count: 0, error: 'No files were uploaded.' };
  }

  // Determine concurrency limit: 5 by default
  const limit = pLimit(5);
  const errors: string[] = [];
  let uploadedCount = 0;

  const results = await Promise.all(
    files.map((file) =>
      limit(async () => {
        try {
          // 1. Validation & Hydration
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
            recordedAt
          } = validated;

          // Generate standardized display name for metadata
          const displayDate = recordedAt.toISOString().split('T')[0]; // YYYY-MM-DD
          const displayTime = recordedAt.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
          const displayName = contactName
            ? `${contactName.replace(/\s+/g, '_')}_${displayDate}_${displayTime}`
            : `${phoneNumber}_${displayDate}_${displayTime}`;

          // Generate R2 key
          const r2Key = generateRecordingKey(
            firebaseUid,
            contactId,
            phoneNumber,
            recordedAt,
            extension
          );

          // Build metadata object
          const metadata: Record<string, string> = {
            'contact-name': contactName || phoneNumber,
            'original-filename': file.name,
            'standardized-name': displayName,
            'recorded-at': recordedAt.toISOString(),
            'duration': duration.toString(),
          };

          if (googleContactId) {
            metadata['google-contact-id'] = googleContactId;
          }

          // Upload to R2 with metadata
          await uploadToR2WithMetadata(r2Key, buffer, mimeType, metadata);

          // Create recording in MongoDB
          const recordingData = {
            firebaseUid,
            contactId: contactId ? new ObjectId(contactId) : null,
            contactName,
            phoneNumber,
            r2Key,
            fileName: file.name,

            standardizedDisplayName: displayName,
            fileSize: buffer.length,
            mimeType,
            duration: Math.round(duration), // Store as rounded seconds
            recordedAt: recordedAt,
            transcriptionStatus: 'pending' as const,
            transcriptSnippet: '',
            transcript: '',
            tags: [],
            isStarred: false,
            isArchived: false,
          };

          const createdRecording = await createRecording(recordingData);
          logger.info(`[uploadRecordings] Success: ${file.name} -> ID: ${createdRecording._id.toString()}, Duration: ${duration}s`);

          // Update user's storage usage
          const updatedUser = await incrementStorageUsed(firebaseUid, buffer.length);

          if (updatedUser) {
            const currentStorage = updatedUser.storageUsed || 0;
            const currentPeak = updatedUser.storagePeakUsed || 0;
            const periodEnd = updatedUser.stripeCurrentPeriodEnd ? new Date(updatedUser.stripeCurrentPeriodEnd) : undefined;
            const peakPeriodEnd = updatedUser.storagePeakPeriodEnd ? new Date(updatedUser.storagePeakPeriodEnd) : undefined;
            const periodMismatch = periodEnd && (!peakPeriodEnd || periodEnd.getTime() !== peakPeriodEnd.getTime());
            if (periodMismatch) {
              await setStoragePeakUsed(firebaseUid, currentStorage, periodEnd);
              // Report peak stored bytes for the billing period.
              await reportUsage(firebaseUid, 'storage', currentStorage);
            } else if (currentStorage > currentPeak) {
              const updated = await bumpStoragePeakUsed(firebaseUid, currentStorage, periodEnd);
              if (updated) {
                await reportUsage(firebaseUid, 'storage', currentStorage);
              }
            }
          }

          // Trigger Auto-Transcription (Fire and Forget via after())
          after(async () => {
            await triggerAutoTranscription(
              firebaseUid,
              createdRecording._id.toString(),
              r2Key,
              duration,
              file.name,
              displayName
            );
          });

          return { success: true };
        } catch (error) {
          logger.error(`[uploadRecordings] ❌ Failed to upload file ${file.name}:`, error);
          return { success: false, error: file.name };
        }
      })
    )
  );

  results.forEach((result) => {
    if (result.success) {
      uploadedCount++;
    } else if (result.error) {
      errors.push(result.error);
    }
  });

  logger.info(`[uploadRecordings] Complete. Uploaded: ${uploadedCount}, Errors: ${errors.length}`);

  if (errors.length > 0) {
    return {
      success: uploadedCount > 0,
      count: uploadedCount,
      error: `Failed to upload: ${errors.join(', ')}`,
    };
  }

  return { success: true, count: uploadedCount };
}
