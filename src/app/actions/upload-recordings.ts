'use server';

import { ObjectId } from 'mongodb';
import { after } from 'next/server';
import {
  uploadToR2WithMetadata,
  generateRecordingKey,
  extractFileExtension,
  validateAudioMimeType,
  getSignedR2Url
} from '@/lib/r2';
import { createRecording, updateRecording } from '@/lib/db/recordings';
import { incrementStorageUsed, recordTranscriptionUsage, findUserByAuthSubject, checkAndResetUsageCycle } from '@/lib/db/users';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { findContactByPhone, findContactByName } from '@/lib/db/contacts';
import { getAiService } from '@/services/ai';
import { getTranscriptionService, transcriptionMultiplier } from '@/services/transcription';
import { toBlockedDetails, toFailureDetails } from '@/services/transcription/failure-events';
import { logSystemEvent } from '@/lib/db/system-log';
import { parseContactFromFilename } from '@/lib/utils/filename-parser';
import { calculateBilledDuration } from '@/lib/utils/billing';

import { checkUserAccess, checkStorageAccess, checkTranscriptionAccess } from '@/lib/access-control';
import { reportUsage } from '@/lib/stripe/usage';
import { logger } from '@/lib/logger';

const aiService = getAiService();



import pLimit from 'p-limit';

/**
 * Upload recordings to R2 and save metadata to MongoDB.
 */
export async function uploadRecordings(
  formData: FormData
): Promise<{ success: boolean; count: number; error?: string }> {
  const authSubject = await getAuthSubjectFromSession();

  if (!authSubject) {
    return { success: false, count: 0, error: 'Not authenticated' };
  }

  const user = await findUserByAuthSubject(authSubject);
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

  // 3. Pre-calculate total size to check storage roughly?
  // We check per file below, but technically we should check all files at once.
  // Let's iterate and sum size.
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
          const buffer = Buffer.from(await file.arrayBuffer());
          const recordedAt = new Date(); // You could parse this from filename if available

          // Calculate duration
          let duration = 0;
          try {
            const { parseBuffer } = await import('music-metadata');
            const metadata = await parseBuffer(buffer, file.type || 'audio/mpeg');
            duration = metadata.format.duration || 0;
          } catch (e) {
            logger.warn(`[uploadRecordings] Failed to extract duration for ${file.name}:`, e);
          }

          // Parse contact info from filename if possible
          // Expected format: "Call recording ContactName_YYMMDD_HHMMSS.mp3"
          const contactInfo = parseContactFromFilename(file.name);

          // Extract and validate file extension
          const extension = extractFileExtension(file.name);
          const mimeType = file.type || 'audio/mpeg';

          // Validate MIME type
          if (!validateAudioMimeType(mimeType)) {
            logger.warn(`[uploadRecordings] Skipping file ${file.name}: Invalid MIME type ${mimeType}`);
            return { success: false, error: `${file.name} (invalid format)` };
          }

          // Try to find matching contact
          let contactId: string | null = null;
          let contactName = contactInfo.name || null;
          let phoneNumber = contactInfo.phoneNumber || 'Unknown';
          let googleContactId: string | undefined;

          if (contactInfo.phoneNumber) {
            const contact = await findContactByPhone(authSubject, contactInfo.phoneNumber);
            if (contact) {
              contactId = contact._id.toString();
              contactName = contact.name;
              phoneNumber = contactInfo.phoneNumber;
              googleContactId = contact.googleContactId;
            }
          } else if (contactInfo.name) {
            const contact = await findContactByName(authSubject, contactInfo.name);
            if (contact) {
              contactId = contact._id.toString();
              contactName = contact.name;
              phoneNumber = contact.phoneNumbers?.[0] || 'Unknown';
              googleContactId = contact.googleContactId;
            }
          }

          // Generate standardized display name for metadata (with time for sorting)
          const recordingDate = contactInfo.date || recordedAt;
          const displayDate = recordingDate.toISOString().split('T')[0]; // YYYY-MM-DD
          const displayTime = recordingDate.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
          const displayName = contactName
            ? `${contactName.replace(/\s+/g, '_')}_${displayDate}_${displayTime}`
            : `${phoneNumber}_${displayDate}_${displayTime}`;

          // Generate R2 key with new structure
          const r2Key = generateRecordingKey(
            authSubject,
            contactId,
            phoneNumber,
            contactInfo.date || recordedAt,
            extension
          );

          // Build metadata object
          const metadata: Record<string, string> = {
            'contact-name': contactName || phoneNumber,
            'original-filename': file.name,
            'standardized-name': displayName,
            'recorded-at': recordingDate.toISOString(), // ISO 8601 timestamp for sorting
            'duration': duration.toString(),
          };

          if (googleContactId) {
            metadata['google-contact-id'] = googleContactId;
          }

          // Upload to R2 with metadata
          await uploadToR2WithMetadata(r2Key, buffer, mimeType, metadata);

          // Create recording in MongoDB
          const recordingData = {
            authSubject,
            contactId: contactId ? new ObjectId(contactId) : null,
            contactName,
            phoneNumber,
            r2Key,
            fileName: file.name,

            standardizedDisplayName: displayName,
            fileSize: buffer.length,
            mimeType,
            duration: Math.round(duration), // Store as rounded seconds
            recordedAt: contactInfo.date || recordedAt,
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
          await incrementStorageUsed(authSubject, buffer.length);
          await reportUsage(authSubject, 'storage', buffer.length / (1024 * 1024 * 1024)); // Convert bytes to GB for Stripe

          // Auto-transcription
          const user = await findUserByAuthSubject(authSubject);
          if (user?.transcriptionSettings?.autoTranscribe) {
            // Resolve the provider once (user override aware); the closure below reuses it.
            const { service: transcriptionService, provider } = getTranscriptionService(user);
            // Use after() to run transcription in the background after the response is sent
            // This prevents the upload request from timing out
            after(async () => {
              try {
                // Re-fetch user to get latest usage
                const freshUser = await findUserByAuthSubject(authSubject);
                if (!freshUser) return;

                // Check Transcription Access (in billed units for the resolved provider)
                const previewUnits = calculateBilledDuration(duration) * transcriptionMultiplier(provider);
                const transcriptionAccess = await checkTranscriptionAccess(freshUser, previewUnits);
                if (!transcriptionAccess.allowed) {
                  const reason = transcriptionAccess.reason || 'Transcription limit exceeded';
                  logger.warn(`[uploadRecordings] Auto-transcription skipped for ${createdRecording._id}: ${reason}`);
                  // The user just sees 'failed'; the quota verdict goes to the
                  // admin audit log (deliberately not on the recording — model
                  // errors stay admin-side).
                  await updateRecording(createdRecording._id.toString(), authSubject, {
                    transcriptionStatus: 'failed',
                  });
                  await logSystemEvent(
                    'TRANSCRIPTION_BLOCKED',
                    toBlockedDetails(reason, {
                      provider,
                      recordingId: createdRecording._id.toString(),
                      authSubject,
                      durationSeconds: duration,
                    }),
                    createdRecording._id.toString(),
                  );
                  return;
                }

                logger.info(`[uploadRecordings] Background: Auto-transcribing recording ${createdRecording._id.toString()}...`);

                await updateRecording(createdRecording._id.toString(), authSubject, {
                  transcriptionStatus: 'processing',
                });

                const fileUrl = await getSignedR2Url(r2Key, 1800);
                const result = await transcriptionService.transcribe(fileUrl, duration);

                // CRITICAL FIX: Save raw transcript IMMEDIATELY
                // This ensures the user sees the text even if AI summary/transliteration takes time or fails
                logger.info(`[uploadRecordings] ${provider} finished. Saving raw transcript for ${createdRecording._id}...`);
                await updateRecording(createdRecording._id.toString(), authSubject, {
                  fullTranscript: result.segments, // Save raw segments first
                  languageCode: result.languageCode,
                  // Keep status as 'processing' so UI knows we are still working on summary/AI
                  transcriptionStatus: 'processing',
                });

                // Parallelize LLM operations ONLY if text exists
                let summary = '';
                let transliteratedSegments = result.segments;
                let summaryEmbedding: number[] = [];

                if (result.text && result.text.trim()) {
                  logger.info(`[uploadRecordings] AI Processing Start for ${createdRecording._id}...`);

                  // Run generation in parallel
                  const aiContext = { recordingId: createdRecording._id.toString(), authSubject };
                  const [summaryResult, translitResult] = await Promise.all([
                    aiService.generateSummary(result.text, result.languageCode, aiContext),
                    aiService.generateTransliteration(result.segments, result.languageCode, aiContext)
                  ]);

                  summary = summaryResult;
                  transliteratedSegments = translitResult;

                  // Generate embedding from summary
                  if (summary) {
                    summaryEmbedding = await aiService.generateEmbedding(summary, aiContext);
                  }
                }

                logger.info(`[uploadRecordings] Finalizing recording ${createdRecording._id}...`);
                await updateRecording(createdRecording._id.toString(), authSubject, {
                  transcriptionStatus: 'completed',
                  fullTranscript: transliteratedSegments, // Update with transliterated version
                  languageCode: result.languageCode,
                  summary,
                  summaryEmbedding,
                });

                // Calculate and record billed usage
                const { billedSeconds, billedUnits } = await recordTranscriptionUsage(authSubject, {
                  provider,
                  rawSeconds: duration,
                  recordingId: createdRecording._id.toString(),
                });
                await reportUsage(authSubject, 'transcription', billedUnits / 60); // Convert units to minutes for Stripe
                logger.info(`[uploadRecordings] Recorded usage: ${billedUnits}u (${billedSeconds}s x provider ${provider}; actual: ${duration}s)`);

                // Delete from provider
                await transcriptionService.deleteTranscript(result.transcriptionId);
                logger.info(`[uploadRecordings] Background: Transcription & AI Complete for ${createdRecording._id.toString()}`);
              } catch (transcriptionError) {
                logger.error(`[uploadRecordings] Background: Transcription failed for ${createdRecording._id.toString()}:`, transcriptionError);
                await updateRecording(createdRecording._id.toString(), authSubject, {
                  transcriptionStatus: 'failed',
                });
                await logSystemEvent(
                  'TRANSCRIPTION_FAILED',
                  toFailureDetails(transcriptionError, {
                    provider,
                    recordingId: createdRecording._id.toString(),
                    authSubject,
                    durationSeconds: duration,
                  }),
                  createdRecording._id.toString(),
                );
              }
            });
          }

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
