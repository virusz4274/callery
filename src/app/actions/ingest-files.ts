
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
  const recordingsDir = path.join(process.cwd(), 'public', 'recordings');

  try {
    await fs.mkdir(injestDir, { recursive: true });
    await fs.mkdir(recordingsDir, { recursive: true });

    const files = await fs.readdir(injestDir);
    if (files.length === 0) {
      return { processedCount: 0, newRecordings: [] };
    }

    const processedFiles = [];
    const errors = [];

    for (const file of files) {
      const parsed = parseFilename(file);
      if (!parsed) {
        console.warn(`Skipping file with unknown format: ${file}`);
        continue;
      }
      
      const { contact, date, extension, dateStr, timeStr } = parsed;
      const year = date.getFullYear().toString();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      
      const contactDirName = contact.replace(/[^a-zA-Z0-9-]/g, '_');
      const targetDir = path.join(recordingsDir, contactDirName, year, month);
      
      try {
        await fs.mkdir(targetDir, { recursive: true });
        
        const originalPath = path.join(injestDir, file);
        const newFileName = `${contactDirName}_${dateStr}_${timeStr}.${extension}`;
        const newPath = path.join(targetDir, newFileName);
        
        await fs.rename(originalPath, newPath);
        
        processedFiles.push({
            contactName: isNaN(parseInt(contact.replace(/\+/g, ''))) ? contact : null,
            phoneNumber: !isNaN(parseInt(contact.replace(/\+/g, ''))) ? contact : 'N/A',
            date: date.toISOString(),
            filePath: path.relative(path.join(process.cwd(), 'public'), newPath),
        });
      } catch(moveError) {
         console.error(`Failed to move file ${file}:`, moveError);
         if (moveError instanceof Error) {
            errors.push(`Error processing ${file}: ${moveError.message}`);
         }
      }
    }
    
    if (errors.length > 0) {
      return { 
        processedCount: processedFiles.length, 
        newRecordings: processedFiles,
        error: `Some files could not be processed: ${errors.join(', ')}`
      };
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
      error: error instanceof Error ? error.message : 'An unknown error occurred during ingestion.',
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
    
    const match = nameWithoutExt.match(/(.+)_(\d{6})_(\d{6})$/);

    if (!match) {
        return null;
    }

    const contact = match[1];
    const dateStr = match[2].replace(/^_/, ''); 
    const timeStr = match[3];

    if (!dateStr || !timeStr || !contact) return null;
  
    try {
      const year = 2000 + parseInt(dateStr.substring(0, 2));
      const month = parseInt(dateStr.substring(2, 4)) - 1; 
      const day = parseInt(dateStr.substring(4, 6));
  
      const hours = parseInt(timeStr.substring(0, 2));
      const minutes = parseInt(timeStr.substring(2, 4));
      const seconds = parseInt(timeStr.substring(4, 6));
  
      const date = new Date(year, month, day, hours, minutes, seconds);
      
      if (isNaN(date.getTime())) {
          return null;
      }
  
      return { contact, date, extension, dateStr, timeStr };
    } catch (e) {
      console.error(`Error parsing date/time for ${filename}:`, e);
      return null;
    }
}
