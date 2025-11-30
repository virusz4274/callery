
'use server';

import fs from 'fs/promises';
import path from 'path';

export async function uploadRecordings(
  formData: FormData
): Promise<{ success: boolean; count: number, error?: string }> {
  const files = formData.getAll('files') as File[];

  if (!files || files.length === 0) {
    return { success: false, count: 0, error: 'No files were uploaded.' };
  }

  const injestDir = path.join(process.cwd(), 'injest');

  try {
    await fs.mkdir(injestDir, { recursive: true });
  } catch (error) {
    console.error('Failed to create injest directory:', error);
    return { success: false, count: 0, error: 'Failed to create upload directory on the server.' };
  }
  
  let uploadedCount = 0;
  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      // Sanitize filename to prevent path traversal
      const safeFilename = path.basename(file.name);
      await fs.writeFile(path.join(injestDir, safeFilename), buffer);
      uploadedCount++;
    } catch (error) {
        console.error(`Failed to save file ${file.name}:`, error);
        // We can decide to stop on first error or continue
        // For now, we'll stop and report the issue
        return { success: false, count: uploadedCount, error: `Failed to save file ${file.name} on the server.`};
    }
  }

  return { success: true, count: uploadedCount };
}
