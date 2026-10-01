import { authFetch } from '@/lib/api-client';
import type { Recording } from '@/lib/types';

/**
 * Download a recording's audio file. Fetches a fresh signed URL, then
 * triggers a browser download. Falls back to opening the URL when the
 * download attribute is ignored (cross-origin signed URLs).
 */
export async function downloadRecording(recording: Recording): Promise<void> {
    const response = await authFetch(`/api/recordings/${recording.id}/play`);
    if (!response.ok) {
        throw new Error('Failed to get download URL');
    }
    const data = await response.json();
    const url = data.playbackUrl as string | undefined;
    if (!url) {
        throw new Error('No download URL returned');
    }

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = recording.fileName || 'recording';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}
