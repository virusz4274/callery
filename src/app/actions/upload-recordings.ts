'use server';

import { ObjectId } from 'mongodb';
import { after } from 'next/server';
import { getFirebaseAdminApp } from '@/lib/firebase/admin';
import {
  uploadToR2WithMetadata,
  generateRecordingKey,
  extractFileExtension,
  validateAudioMimeType,
  getSignedR2Url
} from '@/lib/r2';
import { createRecording, updateRecording } from '@/lib/db/recordings';
import { incrementStorageUsed, incrementTranscriptionUsed, findUserByFirebaseUid } from '@/lib/db/users';
import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { findContactByPhone, findContactByName } from '@/lib/db/contacts';
import { transcribeAudio, deleteTranscript } from '@/lib/elevenlabs';
import { parseContactFromFilename } from '@/lib/utils/filename-parser';
import { calculateBilledDuration } from '@/lib/utils/billing';
import { generateSummary, generateTransliteration } from '@/lib/llm';

import { generateEmbedding } from '@/lib/embeddings';
import { checkUserAccess } from '@/lib/access-control';

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

  const access = checkUserAccess(user);
  if (!access.allowed) {
    return { success: false, count: 0, error: access.reason || 'Access denied' };
  }

  const files = formData.getAll('files') as File[];

  if (!files || files.length === 0) {
    return { success: false, count: 0, error: 'No files were uploaded.' };
  }

  let uploadedCount = 0;
  const errors: string[] = [];


  for (const file of files) {
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
        console.warn(`[uploadRecordings] Failed to extract duration for ${file.name}:`, e);
      }

      // Parse contact info from filename if possible
      // Expected format: "Call recording ContactName_YYMMDD_HHMMSS.mp3"
      const contactInfo = parseContactFromFilename(file.name);

      // Extract and validate file extension
      const extension = extractFileExtension(file.name);
      const mimeType = file.type || 'audio/mpeg';

      // Validate MIME type
      if (!validateAudioMimeType(mimeType)) {
        console.warn(`[uploadRecordings] Skipping file ${file.name}: Invalid MIME type ${mimeType}`);
        errors.push(`${file.name} (invalid format)`);
        continue;
      }

      // Try to find matching contact
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

      // Generate standardized display name for metadata (with time for sorting)
      const recordingDate = contactInfo.date || recordedAt;
      const displayDate = recordingDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const displayTime = recordingDate.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
      const displayName = contactName
        ? `${contactName.replace(/\s+/g, '_')}_${displayDate}_${displayTime}`
        : `${phoneNumber}_${displayDate}_${displayTime}`;

      // Generate R2 key with new structure
      const r2Key = generateRecordingKey(
        firebaseUid,
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
        recordedAt: contactInfo.date || recordedAt,
        transcriptionStatus: 'pending' as const,
        transcriptSnippet: '',
        transcript: '',
        tags: [],
        isStarred: false,
        isArchived: false,
      };

      const createdRecording = await createRecording(recordingData);
      console.log(`[uploadRecordings] Success: ${file.name} -> ID: ${createdRecording._id.toString()}, Duration: ${duration}s`);

      // Update user's storage usage
      await incrementStorageUsed(firebaseUid, buffer.length);

      // Auto-transcription
      const user = await findUserByFirebaseUid(firebaseUid);
      if (user?.transcriptionSettings?.autoTranscribe) {
        // Use after() to run transcription in the background after the response is sent
        // This prevents the upload request from timing out
        after(async () => {
          try {
            console.log(`[uploadRecordings] Background: Auto-transcribing recording ${createdRecording._id.toString()}...`);

            await updateRecording(createdRecording._id.toString(), firebaseUid, {
              transcriptionStatus: 'processing',
            });

            const fileUrl = await getSignedR2Url(r2Key, 1800);
            const result = await transcribeAudio(fileUrl);

            // Parallelize LLM operations
            const [summary, transliteratedSegments] = await Promise.all([
              generateSummary(result.text, result.languageCode),
              generateTransliteration(result.segments, result.languageCode)
            ]);

            // Generate embedding from summary
            const summaryEmbedding = summary ? await generateEmbedding(summary) : [];

            await updateRecording(createdRecording._id.toString(), firebaseUid, {
              transcriptionStatus: 'completed',
              fullTranscript: transliteratedSegments,
              languageCode: result.languageCode,
              summary,
              summaryEmbedding,
            });

            // Calculate and record billed usage
            const billedDuration = calculateBilledDuration(duration);
            await incrementTranscriptionUsed(firebaseUid, billedDuration);
            console.log(`[uploadRecordings] Recorded usage: ${billedDuration}s (Actual: ${duration}s)`);

            // Delete from ElevenLabs
            await deleteTranscript(result.transcriptionId);
            console.log(`[uploadRecordings] Background: Transcription complete for ${createdRecording._id.toString()}`);
          } catch (transcriptionError) {
            console.error(`[uploadRecordings] Background: Transcription failed for ${createdRecording._id.toString()}:`, transcriptionError);
            await updateRecording(createdRecording._id.toString(), firebaseUid, {
              transcriptionStatus: 'failed',
            });
          }
        });
      }

      uploadedCount++;
    } catch (error) {
      console.error(`[uploadRecordings] ❌ Failed to upload file ${file.name}:`, error);
      errors.push(file.name);
    }
  }
  console.log(`[uploadRecordings] Complete. Uploaded: ${uploadedCount}, Errors: ${errors.length}`);

  if (errors.length > 0) {
    return {
      success: uploadedCount > 0,
      count: uploadedCount,
      error: `Failed to upload: ${errors.join(', ')}`,
    };
  }

  return { success: true, count: uploadedCount };
}
