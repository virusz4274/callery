
'use server';

import fs from 'fs/promises';
import path from 'path';

export async function deleteRecordings(
  recordingsToDelete: { id: string, filePath: string }[]
): Promise<{ success: boolean; message: string }> {
  
  const publicDir = path.join(process.cwd(), 'public');
  const deletedFiles: string[] = [];
  const errors: string[] = [];

  for (const rec of recordingsToDelete) {
    try {
      const fullPath = path.join(publicDir, rec.filePath);
      
      // Basic security check to prevent path traversal
      if (!fullPath.startsWith(publicDir)) {
        throw new Error(`Invalid path: ${rec.filePath}`);
      }
      
      await fs.unlink(fullPath);
      deletedFiles.push(rec.id);

    } catch (error) {
      console.error(`Failed to delete file ${rec.filePath}:`, error);
      let errorMessage = `Failed to delete recording ${rec.id}.`;
      if (error instanceof Error && error.name === 'ENOENT') {
        errorMessage = `File not found for recording ${rec.id}. It may have already been deleted.`;
      }
      errors.push(errorMessage);
    }
  }

  if (errors.length > 0) {
    return { success: false, message: errors.join(' ') };
  }

  return { success: true, message: `${deletedFiles.length} recording(s) deleted successfully.` };
}
