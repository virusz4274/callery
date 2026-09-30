'use server';

import { deleteRecordings as deleteRecordingsFromDb } from '@/lib/db/recordings';
import { deleteFromR2 } from '@/lib/r2';
import { decrementStorageUsed } from '@/lib/db/users';
import { reportUsage } from '@/lib/stripe/usage';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';

/**
 * Delete recordings from MongoDB and R2.
 */
export async function deleteRecordings(
  recordingIds: string[]
): Promise<{ success: boolean; message: string }> {
  const authSubject = await getAuthSubjectFromSession();

  if (!authSubject) {
    return { success: false, message: 'Not authenticated' };
  }

  if (!recordingIds || recordingIds.length === 0) {
    return { success: false, message: 'No recordings specified' };
  }

  try {
    // Delete from MongoDB and get the deleted recordings (for R2 keys and file sizes)
    const deletedRecordings = await deleteRecordingsFromDb(recordingIds, authSubject);

    if (deletedRecordings.length === 0) {
      return { success: false, message: 'No recordings found to delete' };
    }

    // Delete from R2
    const r2Errors: string[] = [];
    let totalSizeDeleted = 0;

    // Delete from R2 in parallel


    const deletePromises = deletedRecordings.map(async (recording) => {
      try {
        await deleteFromR2(recording.r2Key);
        return { size: recording.fileSize, error: null };
      } catch (r2Error) {
        console.error(`Error deleting ${recording.r2Key} from R2:`, r2Error);
        r2Errors.push(recording.r2Key);
        return { size: 0, error: r2Error };
      }
    });

    const results = await Promise.all(deletePromises);
    totalSizeDeleted = results.reduce((acc, curr) => acc + curr.size, 0);

    // Update user's storage usage
    if (totalSizeDeleted > 0) {
      await decrementStorageUsed(authSubject, totalSizeDeleted);
      // Report negative usage (refund/decrement) to Stripe
      // Convert bytes to GB and negate
      const refundGb = -(totalSizeDeleted / (1024 * 1024 * 1024));
      await reportUsage(authSubject, 'storage', refundGb);
    }

    if (r2Errors.length > 0) {
      return {
        success: true,
        message: `Deleted ${deletedRecordings.length} recording(s) from database. ${r2Errors.length} file(s) could not be deleted from storage.`,
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
