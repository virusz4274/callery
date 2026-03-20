'use server';

// TODO: Migrate all uploads to go directly to Cloudflare R2 from the client.
// Currently files ≤20MB are proxied through this server action, which wastes
// server memory/CPU. The direct-upload pipeline (r2-direct-upload-client.ts +
// direct-upload.ts) already exists and handles large files. Unify all uploads
// to use that path and remove this server-proxied action entirely.
// See also: upload-single-file.ts, next.config.ts bodySizeLimit.

import pLimit from 'p-limit';
import { getFirebaseAdminApp } from '@/lib/firebase/admin';
import { checkUserAccess, checkStorageAccess } from '@/lib/access-control';
import {
  checkAndResetUsageCycle,
  findUserByFirebaseUid,
} from '@/lib/db/users';
import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { logger } from '@/lib/logger';
import { uploadSingleFile } from './upload/upload-single-file';

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

  const generalAccess = checkUserAccess(user);
  if (!generalAccess.allowed) {
    return { success: false, count: 0, error: generalAccess.reason || 'Access denied' };
  }

  const currentUser = await checkAndResetUsageCycle(user);
  const files = formData.getAll('files') as File[];

  if (!files || files.length === 0) {
    return { success: false, count: 0, error: 'No files were uploaded.' };
  }

  let totalUploadSize = 0;
  for (const file of files) {
    totalUploadSize += file.size;
  }

  const storageAccess = checkStorageAccess(currentUser, totalUploadSize);
  if (!storageAccess.allowed) {
    return { success: false, count: 0, error: storageAccess.reason || 'Storage limit exceeded' };
  }

  const limit = pLimit(5);
  const errors: string[] = [];
  let uploadedCount = 0;

  const results = await Promise.all(
    files.map((file) =>
      limit(async () => {
        return uploadSingleFile(file, firebaseUid);
      })
    )
  );

  results.forEach((result) => {
    if (result.success) {
      uploadedCount++;
    } else {
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
