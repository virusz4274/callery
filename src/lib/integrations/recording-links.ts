import { buildAppUrl } from '@/lib/public-url';

/** Links confer no access: the recording viewer resolves the current session. */
export function recordingAppUrl(id: string, target?: { segmentIndex?: number; start?: number; transcriptRevision?: string }) {
    const url = buildAppUrl('/recordings');
    url.searchParams.set('id', id);
    if (target?.segmentIndex !== undefined) url.searchParams.set('segment', String(target.segmentIndex));
    if (target?.start !== undefined && Number.isFinite(target.start) && target.start >= 0) url.searchParams.set('t', String(target.start));
    if (target?.transcriptRevision) url.searchParams.set('revision', target.transcriptRevision);
    return url.toString();
}

export const uploadAppUrl = () => buildAppUrl('/upload').toString();
