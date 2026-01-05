'use server';

import { ObjectId } from 'mongodb';
import { cookies } from 'next/headers';
import { getAuth } from 'firebase-admin/auth';
import { getFirebaseAdminApp } from '@/lib/firebase/admin';
import {
  uploadToR2WithMetadata,
  generateRecordingKey,
  extractFileExtension,
  validateAudioMimeType,
  sanitizePhoneNumber
} from '@/lib/r2';
import { createRecording } from '@/lib/db/recordings';
import { incrementStorageUsed } from '@/lib/db/users';
import { findContactByPhone, findContactByName } from '@/lib/db/contacts';

// Initialize Firebase Admin
getFirebaseAdminApp();

/**
 * Get the Firebase UID from the session cookie.
 */
async function getFirebaseUidFromSession(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');

    if (!sessionCookie || !sessionCookie.value) {
      return null;
    }
    const decodedToken = await getAuth().verifySessionCookie(sessionCookie.value, true);
    return decodedToken.uid;
  } catch (error) {
    console.error('Error verifying session:', error);
    return null;
  }
}

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

      // Parse contact info from filename if possible
      // Expected format: "Call recording ContactName_YYMMDD_HHMMSS.mp3"
      const contactInfo = parseContactFromFilename(file.name);

      // Extract and validate file extension
      const extension = extractFileExtension(file.name);
      const mimeType = file.type || 'audio/mpeg';

      // Validate MIME type
      if (!validateAudioMimeType(mimeType)) {
        console.warn(`Skipping file ${file.name}: Invalid MIME type ${mimeType}`);
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
      };

      if (googleContactId) {
        metadata['google-contact-id'] = googleContactId;
      }

      // Upload to R2 with metadata
      await uploadToR2WithMetadata(r2Key, buffer, mimeType, metadata);

      // Create recording in MongoDB
      await createRecording({
        firebaseUid,
        contactId: contactId ? new ObjectId(contactId) : null,
        contactName,
        phoneNumber,
        r2Key,
        fileName: file.name,
        originalFileName: file.name,
        standardizedDisplayName: displayName,
        fileSize: buffer.length,
        mimeType,
        duration: 0, // Will be updated when transcription is done
        recordedAt: contactInfo.date || recordedAt,
        transcriptionStatus: 'pending',
        transcriptSnippet: '',
        transcript: '',
        tags: [],
        isStarred: false,
        isArchived: false,
      });

      // Update user's storage usage
      await incrementStorageUsed(firebaseUid, buffer.length);

      uploadedCount++;
    } catch (error) {
      console.error(`Failed to upload file ${file.name}:`, error);
      errors.push(file.name);
    }
  }

  if (errors.length > 0) {
    return {
      success: uploadedCount > 0,
      count: uploadedCount,
      error: `Failed to upload: ${errors.join(', ')}`,
    };
  }

  return { success: true, count: uploadedCount };
}

/**
 * Parse contact info and date from a recording filename.
 * Expected format: "Call recording ContactName_YYMMDD_HHMMSS.ext"
 */
function parseContactFromFilename(filename: string): {
  name: string | null;
  phoneNumber: string | null;
  date: Date | null;
} {
  const prefix = 'Call recording ';
  if (!filename.startsWith(prefix)) {
    // Try to extract any useful info from the filename
    const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
    return {
      name: nameWithoutExt || null,
      phoneNumber: null,
      date: null,
    };
  }

  const mainPart = filename.substring(prefix.length);
  const nameWithoutExt = mainPart.replace(/\.[^.]+$/, '');

  // Try to match: ContactName_YYMMDD_HHMMSS
  const match = nameWithoutExt.match(/(.+)_(\d{6})_(\d{6})$/);

  if (!match) {
    return {
      name: nameWithoutExt || null,
      phoneNumber: null,
      date: null,
    };
  }

  const contact = match[1];
  const dateStr = match[2];
  const timeStr = match[3];

  // Check if contact is a phone number
  const isPhoneNumber = /^[\d+\-\s()]+$/.test(contact.replace(/_/g, ' '));

  // Parse date
  let date: Date | null = null;
  try {
    const year = 2000 + parseInt(dateStr.substring(0, 2));
    const month = parseInt(dateStr.substring(2, 4)) - 1;
    const day = parseInt(dateStr.substring(4, 6));
    const hours = parseInt(timeStr.substring(0, 2));
    const minutes = parseInt(timeStr.substring(2, 4));
    const seconds = parseInt(timeStr.substring(4, 6));
    date = new Date(year, month, day, hours, minutes, seconds);
    if (isNaN(date.getTime())) {
      date = null;
    }
  } catch {
    date = null;
  }

  return {
    name: isPhoneNumber ? null : contact.replace(/_/g, ' '),
    phoneNumber: isPhoneNumber ? contact.replace(/_/g, '') : null,
    date,
  };
}
