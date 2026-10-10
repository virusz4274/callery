'use server';

import { logger } from '@/lib/logger';

import { deleteRecordings as deleteRecordingsFromDb } from '@/lib/db/recordings';
import { deleteFromR2 } from '@/lib/r2';
import { decrementStorageUsed } from '@/lib/db/users';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { assertRecordingDeletionAllowed, getRecordingForActor, getTeamSettings } from '@/lib/team-policy';
import { findUserByAuthSubject } from '@/lib/db/users';
import { logAdminAction } from './audit-log';
import { revalidatePath } from 'next/cache';

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

  if (!Array.isArray(recordingIds) || recordingIds.length === 0 || recordingIds.length > 100) {
    return { success: false, message: 'No recordings specified' };
  }

  try {
    await assertRecordingDeletionAllowed(authSubject);
    const results = await Promise.all([...new Set(recordingIds)].map(id => getRecordingForActor(id, authSubject)));
    const candidateRecordings = results.filter(recording => recording !== null);

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
        logger.error(`Error deleting ${recording.r2Key} from R2:`, r2Error);
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

    const deletedRecordings = [];
    for (const uploader of new Set(candidateRecordings.map(recording => recording.authSubject))) {
      const ids = candidateRecordings.filter(recording => recording.authSubject === uploader && successfulDeleteIds.includes(recording._id.toString())).map(recording => recording._id.toString());
      if (!ids.length) continue;
      const deleted = await deleteRecordingsFromDb(ids, uploader);
      await decrementStorageUsed(uploader, deleted.reduce((sum, recording) => sum + recording.fileSize, 0));
      deletedRecordings.push(...deleted);
    }
    if ((await getTeamSettings()).enabled) {
      const admin = await findUserByAuthSubject(authSubject);
      await logAdminAction(admin!._id.toString(), 'RECORDING_DELETE', { recordingIds: deletedRecordings.map(r => r._id.toString()) }, undefined, 'SYSTEM');
    }
    revalidatePath('/admin/recordings');
    revalidatePath('/recordings');
    revalidatePath('/files');

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
    logger.error('Error deleting recordings:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
}
