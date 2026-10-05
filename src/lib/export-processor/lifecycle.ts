import { ObjectId } from 'mongodb';
import { getExportJob, updateExportJob } from '@/lib/db/export-jobs';
import type { RecordingExportCursor } from '@/lib/db/recordings';
import { findUserByAuthSubject } from '@/lib/db/users';
import { sendEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications';
import { getSignedR2Url } from '@/lib/r2';
import { DOWNLOAD_LINK_TTL_SECONDS } from './constants';
import { toStorageParts } from './part-metadata';
import type { ExportPartMeta } from './types';

export async function persistCheckpoint(params: {
    jobId: string;
    authSubject: string;
    totalRecordings: number;
    processedRecordings: number;
    cursor?: RecordingExportCursor;
    nextPartNumber: number;
    parts: ExportPartMeta[];
}): Promise<void> {
    const progress =
        params.totalRecordings > 0
            ? Math.min(99, Math.round((params.processedRecordings / params.totalRecordings) * 100))
            : 100;

    await updateExportJob(params.jobId, params.authSubject, {
        totalRecordings: params.totalRecordings,
        processedRecordings: params.processedRecordings,
        progress,
        parts: toStorageParts(params.parts),
        checkpoint: {
            nextPartNumber: params.nextPartNumber,
            cursorRecordedAt: params.cursor?.recordedAt,
            cursorId: params.cursor?.id,
        },
    });
}

export async function finalizeJob(
    jobId: string,
    authSubject: string,
    parts: ExportPartMeta[],
    email?: string
) {
    const user = await findUserByAuthSubject(authSubject);
    if (!user) {
        return;
    }

    const signedParts = await Promise.all(
        parts.map(async (part) => ({
            key: part.key,
            size: part.size,
            url: await getSignedR2Url(part.key, DOWNLOAD_LINK_TTL_SECONDS),
            expiresAt: new Date(Date.now() + DOWNLOAD_LINK_TTL_SECONDS * 1000),
        }))
    );

    await updateExportJob(jobId, authSubject, {
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
        processedRecordings: signedParts.length > 0 ? (await getExportJob(jobId, authSubject))?.processedRecordings || 0 : 0,
        parts: signedParts,
        checkpoint: {
            nextPartNumber: signedParts.length + 1,
        },
        error: undefined,
    });

    if (email && signedParts.length > 0) {
        const linksHtml = signedParts
            .map(
                (part, index) =>
                    `<li><a href="${part.url}">Download Part ${index + 1}</a> (${(part.size / 1024 / 1024).toFixed(1)} MB)</li>`
            )
            .join('');

        await sendEmail({
            to: email,
            subject: 'Your Call Organizer Export is Ready',
            html: `
                <h2>Export Completed</h2>
                <p>Your data has been successfully exported into ${signedParts.length} archive(s).</p>
                <p>These links will expire in 7 days.</p>
                <ul>${linksHtml}</ul>
                <p>Each archive contains a viewer that allows you to browse that specific part. Extract all parts to the same folder to merge them.</p>
            `,
        });

        await createNotification(
            new ObjectId(user._id),
            'success',
            'Export Ready',
            `Your data export (${signedParts.length} parts) is ready for download.`,
            '/settings?tab=data'
        );
    }
}
