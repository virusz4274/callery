import { ObjectId } from 'mongodb';
import { getExportJob, updateActiveExportJob } from '@/lib/db/export-jobs';
import type { RecordingExportCursor } from '@/lib/db/recordings';
import { findUserByAuthSubject } from '@/lib/db/users';
import { sendNotificationEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import { createNotification } from '@/lib/notifications';
import { getSignedR2Url } from '@/lib/r2';
import { ARCHIVE_TTL_MS, DOWNLOAD_LINK_TTL_SECONDS } from './constants';
import { toStorageParts } from './part-metadata';
import type { ExportPartMeta } from './types';
import { resolveExportSubject } from '@/lib/team-policy';
import { getExportSourceSnapshot } from './policy';
import { assertExportActive, renewExportParts } from './object-lifecycle';
import { ExportProcessingError, toExportFailure } from './errors';

export async function persistCheckpoint(params: {
    jobId: string;
    authSubject: string;
    totalRecordings: number;
    processedRecordings: number;
    cursor?: RecordingExportCursor;
    nextPartNumber: number;
    parts: ExportPartMeta[];
    workerToken?: string;
}): Promise<void> {
    const progress =
        params.totalRecordings > 0
            ? Math.min(99, Math.round((params.processedRecordings / params.totalRecordings) * 100))
            : 100;

    await assertExportActive(params.authSubject, params.jobId, undefined, params.workerToken);
    await updateActiveExportJob(params.jobId, params.authSubject, {
        totalRecordings: params.totalRecordings,
        processedRecordings: params.processedRecordings,
        progress,
        parts: toStorageParts(params.parts),
        checkpoint: {
            nextPartNumber: params.nextPartNumber,
            cursorRecordedAt: params.cursor?.recordedAt,
            cursorId: params.cursor?.id,
        },
    }, undefined, params.workerToken);
}

export async function finalizeJob(
    jobId: string,
    authSubject: string,
    parts: ExportPartMeta[],
    email?: string,
    workerToken?: string,
) {
    await assertExportActive(authSubject, jobId, undefined, workerToken);
    const user = await findUserByAuthSubject(authSubject);
    if (!user) {
        throw new ExportProcessingError('finalize', 'permission');
    }

    const job = await getExportJob(jobId, authSubject);
    if (!job) throw new ExportProcessingError('finalize', 'cancelled');
    const requester = job.requestedByAuthSubject ? await findUserByAuthSubject(job.requestedByAuthSubject) : user;
    if (!requester || requester.disabled || requester.softDelete?.isDeleted || requester.teamInvitationPending) throw new Error('Export requester is unavailable');
    await resolveExportSubject(requester.authSubject, requester.authSubject === authSubject ? undefined : user._id.toString());

    const signedParts = await Promise.all(
        parts.map(async (part) => ({
            key: part.key,
            size: part.size,
            url: await getSignedR2Url(part.key, DOWNLOAD_LINK_TTL_SECONDS),
            expiresAt: new Date(Date.now() + DOWNLOAD_LINK_TTL_SECONDS * 1000),
        }))
    );
    const currentRevision = job.sourceRevision ? (await getExportSourceSnapshot(authSubject)).revision : undefined;
    const archiveExpiresAt = new Date(Date.now() + ARCHIVE_TTL_MS);

    await assertExportActive(authSubject, jobId, undefined, workerToken);
    await renewExportParts({ ...job, parts: signedParts }, archiveExpiresAt);
    await assertExportActive(authSubject, jobId, undefined, workerToken);
    await updateActiveExportJob(jobId, authSubject, {
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
        processedRecordings: job.processedRecordings,
        parts: signedParts,
        checkpoint: {
            nextPartNumber: signedParts.length + 1,
        },
        error: undefined,
        failure: undefined,
        archiveExpiresAt,
        cacheEligible: Boolean(job.sourceRevision && currentRevision === job.sourceRevision),
    }, undefined, workerToken);

    if (email && signedParts.length > 0) {
        // The archive is already durable. Delivery failures must not turn a
        // successful export into a failed generation or consume its recovery.
        try {
            await assertExportActive(authSubject, jobId);
            await resolveExportSubject(requester.authSubject, requester.authSubject === authSubject ? undefined : user._id.toString());
            const linksHtml = signedParts
                .map(
                    (part, index) =>
                        `<li><a href="${part.url}">Download Part ${index + 1}</a> (${(part.size / 1024 / 1024).toFixed(1)} MB)</li>`
                )
                .join('');

            await sendNotificationEmail({
                to: email,
                subject: 'Your Call Organizer Export is Ready',
                html: `
                <h2>Export Completed</h2>
                <p>Your data has been successfully exported into ${signedParts.length} archive(s).</p>
                <p>These links expire in 15 minutes. Open Data &amp; Export in settings to obtain fresh links. The archive is deleted after 7 days.</p>
                <ul>${linksHtml}</ul>
                <p>Each archive contains a viewer that allows you to browse that specific part. Extract all parts to the same folder to merge them.</p>
            `,
            }).catch(error => logger.warn('[Export] Email notification failed', toExportFailure(error, 'finalize')));

            await createNotification(
                new ObjectId(requester._id),
                'success',
                'Export Ready',
                `Your data export (${signedParts.length} parts) is ready for download.`,
                requester.authSubject === authSubject ? '/settings?tab=data' : `/admin/recordings?employeeId=${user._id.toString()}`
            );
        } catch (error) {
            logger.warn('[Export] Completion notification failed', toExportFailure(error, 'finalize'));
        }
    }
}
