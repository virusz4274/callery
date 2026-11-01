import type { ExportJob } from '@/lib/db/types';
import { getSignedR2Url } from '@/lib/r2';
import { DOWNLOAD_LINK_TTL_SECONDS } from './constants';

/** Short-lived URLs are renewed only after the caller's normal archive authorization. */
export async function refreshExportDownloadLinks(job: ExportJob): Promise<ExportJob> {
    if (job.cleanedAt || job.cleanupPending || job.abortedAt || (job.archiveExpiresAt && job.archiveExpiresAt <= new Date())) {
        return { ...job, status: 'failed', parts: [], error: 'This export archive has expired. Individual recording downloads remain available.' };
    }
    if (job.status !== 'completed') return job;
    const expiresAt = new Date(Math.min(Date.now() + DOWNLOAD_LINK_TTL_SECONDS * 1000, job.archiveExpiresAt?.getTime() ?? Infinity));
    const seconds = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    return { ...job, parts: await Promise.all(job.parts.map(async part => ({ ...part, expiresAt, url: await getSignedR2Url(part.key, seconds) }))) };
}
