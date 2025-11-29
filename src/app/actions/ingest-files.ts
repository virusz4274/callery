'use server';

import fs from 'fs/promises';
import path from 'path';

type IngestResult = {
  processedCount: number;
  newRecordings: any[];
  error?: string;
};

// Main function to ingest files
export async function ingestFiles(): Promise<IngestResult> {
  const injestDir = path.join(process.cwd(), 'injest');
  const recordingsDir = path.join(process.cwd(), 'recordings');

  try {
    await fs.mkdir(injestDir, { recursive: true });
    await fs.mkdir(recordingsDir, { recursive: true });

    const files = await fs.readdir(injestDir);
    if (files.length === 0) {
      return { processedCount: 0, newRecordings: [] };
    }

    const processedFiles = [];

    for (const file of files) {
      const parsed = parseFilename(file);
      if (!parsed) {
        console.warn(`Skipping file with unkown format: ${file}`);
        continue;
      }
      
      const { contact, date, extension } = parsed;
      const year = date.getFullYear().toString();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      
      const contactDirName = contact.replace(/[^a-zA-Z0-9-]/g, '_');
      const targetDir = path.join(recordingsDir, contactDirName, year, month);
      await fs.mkdir(targetDir, { recursive: true });
      
      const originalPath = path.join(injestDir, file);
      const newFileName = `call_${date.getTime()}.${extension}`;
      const newPath = path.join(targetDir, newFileName);
      
      await fs.rename(originalPath, newPath);
      
      processedFiles.push({
          contactName: isNaN(parseInt(contact.replace(/\+/g, ''))) ? contact : null,
          phoneNumber: !isNaN(parseInt(contact.replace(/\+/g, ''))) ? contact : 'N/A',
          date: date.toISOString(),
          filePath: path.relative(process.cwd(), newPath),
      });
    }

    return {
      processedCount: processedFiles.length,
      newRecordings: processedFiles,
    };
  } catch (error) {
    console.error('Error during file ingestion:', error);
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return { processedCount: 0, newRecordings: [], error: `Directory not found. Please make sure the '/injest' directory exists.` };
    }
    return {
      processedCount: 0,
      newRecordings: [],
      error: error instanceof Error ? error.message : 'An unknown error occurred.',
    };
  }
}

// Helper function to parse Samsung filename format
function parseFilename(filename: string) {
    const prefix = 'Call recording ';
    if (!filename.startsWith(prefix)) {
      return null;
    }
  
    const mainPart = filename.substring(prefix.length);
    const extension = path.extname(mainPart).substring(1);
    const nameWithoutExt = mainPart.substring(0, mainPart.length - extension.length -1);
    
    // Use a regular expression to handle contact names with spaces
    const match = nameWithoutExt.match(/(.+)_(_?\d{6})_(\d{6})$/);

    if (!match) {
        return null;
    }

    const contact = match[1];
    const dateStr = match[2].replace(/^_/, ''); // remove leading underscore if present
    const timeStr = match[3];

    if (!dateStr || !timeStr || !contact) return null;
  
    try {
      // Assuming YYMMDD format
      const year = 2000 + parseInt(dateStr.substring(0, 2));
      const month = parseInt(dateStr.substring(2, 4)) - 1; // Month is 0-indexed in JS
      const day = parseInt(dateStr.substring(4, 6));
  
      // Assuming HHMMSS format
      const hours = parseInt(timeStr.substring(0, 2));
      const minutes = parseInt(timeStr.substring(2, 4));
      const seconds = parseInt(timeStr.substring(4, 6));
  
      const date = new Date(year, month, day, hours, minutes, seconds);
      
      if (isNaN(date.getTime())) {
          return null;
      }
  
      return { contact, date, extension };
    } catch (e) {
      console.error(`Error parsing date/time for ${filename}`, e);
      return null;
    }
}
