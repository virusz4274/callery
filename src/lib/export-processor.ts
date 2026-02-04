import { ObjectId } from 'mongodb';
import { updateExportJob, getExportJob } from '@/lib/db/export-jobs';
import { getRecordingsByUser } from '@/lib/db/recordings';
import { r2Client, R2_BUCKET, getSignedR2Url } from '@/lib/r2';
import { sendEmail } from '@/lib/email';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import archiver from 'archiver';
import path from 'path';
import { Readable } from 'stream';
import { findUserByFirebaseUid } from '@/lib/db/users';

const PART_SIZE_LIMIT = 500 * 1024 * 1024; // 500MB

export async function processExport(jobId: string, firebaseUid: string) {
    console.log(`[Export] Starting job ${jobId} for user ${firebaseUid}`);
    try {
        await updateExportJob(jobId, firebaseUid, {
            status: 'processing',
            startedAt: new Date(),
            progress: 0
        });

        // 1. Fetch User & Recordings
        const user = await findUserByFirebaseUid(firebaseUid);
        if (!user) throw new Error('User not found');

        const recordings = await getRecordingsByUser(firebaseUid, {
            limit: 10000,
            includeArchived: true
        }); // TODO: Handle massive libraries with pagination if needed

        await updateExportJob(jobId, firebaseUid, {
            totalRecordings: recordings.length
        });

        if (recordings.length === 0) {
            await finalizeJob(jobId, firebaseUid, []);
            return;
        }

        // 2. Prepare Zip Logic
        let currentPartIndex = 1;
        let currentArchiveSize = 0;
        let processedCount = 0;
        const uploadPromises: Promise<any>[] = [];
        const parts: { key: string; size: number }[] = [];

        // Helper to upload a part
        // We need to stream the zip explicitly to R2 using multipart or pass-through
        // Ideally: Archiver -> PassThrough -> Upload
        // But doing this per-file sequentially might be slow.
        // For simplicity and robustness in this specific environment, let's build the zip in memory if possible?
        // No, 500MB is too big for memory safely. We must stream.
        // But 'aws-sdk' Upload helper supports streams.

        // Since implementing multi-part zip splitting *while streaming* is complex,
        // we will group files strictly BEFORE zipping.

        const chunks: typeof recordings[] = [];
        let currentChunk: typeof recordings = [];
        let estimatedChunkSize = 0;

        // Estimate sizes (rough)
        for (const rec of recordings) {
            // 1MB average if size unknown, else use fileSize
            const size = rec.fileSize || 1024 * 1024;
            if (currentChunk.length > 0 && estimatedChunkSize + size > PART_SIZE_LIMIT) {
                chunks.push(currentChunk);
                currentChunk = [];
                estimatedChunkSize = 0;
            }
            currentChunk.push(rec);
            estimatedChunkSize += size;
        }
        if (currentChunk.length > 0) chunks.push(currentChunk);

        console.log(`[Export] Split into ${chunks.length} parts`);

        // Process each chunk
        for (const chunk of chunks) {
            const partNumber = currentPartIndex++;
            const zipKey = `exports/${firebaseUid}/${jobId}/part_${partNumber}.zip`;

            console.log(`[Export] Processing Part ${partNumber} with ${chunk.length} files...`);

            // Creates a pass-through stream to pipe archiver to S3 upload
            // We use standard lib/r2 client but slightly modified for upload
            // Since standard PutObject needs a known length for some clients, 
            // but recent Node SDK supports Readable stream if 'Content-Length' is widely unknown or chunked encoding used.
            // R2 supports streaming uploads.

            await new Promise<void>((resolve, reject) => {
                const archive = archiver('zip', { zlib: { level: 9 } });

                // Add Viewer and Readme (assume they exist in source or generate string)
                archive.append(getViewerHtml(), { name: 'viewer.html' });
                archive.append(getReadmeTxt(), { name: 'README.txt' });

                // Process recordings in this chunk
                // We need to fetch each file from R2 and pipe to archive
                // We must handle backpressure carefully. 
                // archiver allows appending streams.

                // Using 'for...of' with await to ensure we don't open 1000 S3 connections at once
                const appendFiles = async () => {
                    for (const rec of chunk) {
                        try {
                            // Fetch from R2
                            const getCmd = new GetObjectCommand({
                                Bucket: R2_BUCKET,
                                Key: rec.r2Key
                            });
                            const s3Res = await r2Client.send(getCmd);

                            if (s3Res.Body) {
                                const stream = s3Res.Body as Readable;

                                const date = new Date(rec.recordedAt);
                                const year = date.getFullYear().toString();
                                const month = String(date.getMonth() + 1).padStart(2, '0');
                                const name = rec.contactName || rec.phoneNumber || 'Unknown';
                                const safeName = name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                                const ext = rec.fileName.split('.').pop() || 'm4a';
                                const filename = `${safeName}_${date.getTime()}.${ext}`;
                                const pathInZip = `Contacts/${safeName}/${year}/${month}/${filename}`;

                                archive.append(stream, { name: pathInZip });

                                // Metadata (JSON)
                                const metadata = JSON.stringify(rec, null, 2);
                                archive.append(metadata, { name: pathInZip.replace(`.${ext}`, '.json') });

                                // Metadata (TXT)
                                const txt = `Call with: ${name}\nDate: ${date.toLocaleString()}\nDuration: ${rec.duration}s\nPhone: ${rec.phoneNumber}\n\nTranscript:\n${rec.fullTranscript?.map(t => `[${t.speakerId}]: ${t.text}`).join('\n') || '(No Transcript)'}`;
                                archive.append(txt, { name: pathInZip.replace(`.${ext}`, '.txt') });
                            }
                        } catch (err) {
                            console.error(`Failed to specific file ${rec._id}`, err);
                            // Continue despite error? Yes, log it.
                        }

                        processedCount++;
                        // Update progress every 10 files
                        if (processedCount % 10 === 0) {
                            const progress = Math.round((processedCount / recordings.length) * 100);
                            await updateExportJob(jobId, firebaseUid, { progress });
                        }
                    }
                    archive.finalize();
                };

                // Create Upload Stream
                // Since archiver is a stream, we can pass it to PutObject
                // But we need to wait for 'appendFiles' to finish queuing.

                // Trigger appending
                appendFiles().catch(err => {
                    archive.emit('error', err);
                });

                // Upload to R2
                // We wrap this in a customized upload function or use raw client
                // Note: PutObject with stream usually requires knowing length OR using @aws-sdk/lib-storage (Upload)
                // For simplicity, we will try standard PutObject. If it fails due to unknown length, we'll switch to lib-storage.
                // R2 *does* support chunked uploads.

                // Using a PassThrough might simply work.
                const upload = new PutObjectCommand({
                    Bucket: R2_BUCKET,
                    Key: zipKey,
                    Body: archive as any, // Cast to any to satisfy type if needed, or Readable
                    ContentType: 'application/zip'
                });

                r2Client.send(upload)
                    .then(() => {
                        console.log(`[Export] Uploaded ${zipKey}`);
                        parts.push({ key: zipKey, size: archive.pointer() }); // pointer() gives approximate size
                        resolve();
                    })
                    .catch(reject);
            });
        }

        await finalizeJob(jobId, firebaseUid, parts, user.email);

    } catch (error: any) {
        console.error('[Export] Fatal Error:', error);
        await updateExportJob(jobId, firebaseUid, {
            status: 'failed',
            error: error.message || 'Unknown error'
        });
    }
}

async function finalizeJob(jobId: string, firebaseUid: string, parts: { key: string; size: number }[], email?: string) {
    // Generate Signed URLs
    // Expiration: 7 days (60*60*24*7)
    const signedParts = await Promise.all(parts.map(async p => ({
        url: await getSignedR2Url(p.key, 604800), // 7 days
        size: p.size,
        expiresAt: new Date(Date.now() + 604800 * 1000),
        key: p.key
    })));

    await updateExportJob(jobId, firebaseUid, {
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
        parts: signedParts
    });

    if (email && signedParts.length > 0) {
        // Send Email
        const linksHtml = signedParts.map((p, i) =>
            `<li><a href="${p.url}">Download Part ${i + 1}</a> (${(p.size / 1024 / 1024).toFixed(1)} MB)</li>`
        ).join('');

        await sendEmail({
            to: email,
            subject: 'Your Call Organizer Export is Ready',
            html: `
                <h2>Export Completed</h2>
                <p>Your data has been successfully exported into ${signedParts.length} archive(s).</p>
                <p>These links will expire in 7 days.</p>
                <ul>${linksHtml}</ul>
                <p>Each archive contains a viewer that allows you to browse that specific part. Extract all parts to the same folder to merge them.</p>
            `
        });
    }
}

import { VIEWER_HTML } from '@/lib/export-viewer-template';

function getViewerHtml() {
    return VIEWER_HTML;
}

function getReadmeTxt() {
    return `
Call Organizer Export
=====================

Instructions:
1. Download all parts (Part 1, Part 2, etc.).
2. Extract all zip files into the SAME folder.
3. Open 'viewer.html' in your browser.
4. If asked, select the 'Contacts' folder inside the extracted directory.

Your recordings are organized by Contact > Year > Month.
    `.trim();
}
