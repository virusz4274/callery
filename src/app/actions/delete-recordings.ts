'use server';

import { deleteRecordings as deleteRecordingsFromDb, getRecordingsByIds } from '@/lib/db/recordings';
import { deleteFromR2 } from '@/lib/r2';
import { decrementStorageUsed } from '@/lib/db/users';
import { cookies } from 'next/headers';
import { getAdminAuth } from '@/lib/firebase/admin';

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
    const auth = getAdminAuth();
    const decodedToken = await auth.verifySessionCookie(sessionCookie.value, true);
    return decodedToken.uid;
  } catch (error) {
    console.error('Error verifying session:', error);
    return null;
  }
}

/**
 * Delete recordings from MongoDB and R2.
 */
export async function deleteRecordings(
  recordingIds: string[]
): Promise<{ success: boolean; message: string }> {
  const firebaseUid = await getFirebaseUidFromSession();

  if (!firebaseUid) {
    return { success: false, message: 'Not authenticated' };
  }

  if (!recordingIds || recordingIds.length === 0) {
    return { success: false, message: 'No recordings specified' };
  }

  try {
    const candidateRecordings = await getRecordingsByIds(recordingIds, firebaseUid);

    if (candidateRecordings.length === 0) {
      return { success: false, message: 'No recordings found to delete' };
    }

    const r2Errors: string[] = [];
    const successfulDeleteIds: string[] = [];
    const deletePromises = candidateRecordings.map(async (recording) => {
      try {
        await deleteFromR2(recording.r2Key);
        successfulDeleteIds.push(recording._id.toString());
      } catch (r2Error) {
        console.error(`Error deleting ${recording.r2Key} from R2:`, r2Error);
        r2Errors.push(recording.r2Key);
      }
    });

    await Promise.all(deletePromises);

    if (successfulDeleteIds.length === 0) {
      return {
        success: false,
        message: `Unable to delete ${candidateRecordings.length} recording(s) from storage. No database records were removed.`,
      };
    }

    const deletedRecordings = await deleteRecordingsFromDb(successfulDeleteIds, firebaseUid);
    const totalSizeDeleted = deletedRecordings.reduce((acc, curr) => acc + curr.fileSize, 0);

    if (totalSizeDeleted > 0) {
      await decrementStorageUsed(firebaseUid, totalSizeDeleted);
    }

    if (r2Errors.length > 0) {
      return {
        success: true,
        message: `Deleted ${deletedRecordings.length} recording(s). ${r2Errors.length} file(s) could not be removed from storage, so their database records were kept for retry.`,
      };
    }

    return {
      success: true,
      message: `${deletedRecordings.length} recording(s) deleted successfully.`,
    };
  } catch (error) {
    console.error('Error deleting recordings:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
}
