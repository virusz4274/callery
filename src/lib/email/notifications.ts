import { getMongoDb, Collections } from '@/lib/mongodb';
import { sendNotificationEmail } from '@/lib/email';
import type { User } from '@/lib/db/types';
import { logger } from '@/lib/logger';

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export interface IngestSummary {
    succeeded: number;
    failed: number;
    failedNames: string[];
}

/**
 * Notify a user about an upload batch, honoring their notification settings.
 * Sends at most one email per batch. Never throws — email must not fail uploads.
 */
export async function notifyIngestComplete(user: User, summary: IngestSummary): Promise<void> {
    const prefs = user.notificationSettings;
    if (!prefs) return;

    const wantSuccess = summary.succeeded > 0 && prefs.ingestSuccess;
    const wantFailure = summary.failed > 0 && prefs.ingestFail;
    if (!wantSuccess && !wantFailure) return;

    try {
        const parts: string[] = [];
        if (wantSuccess) {
            parts.push(`<p>${summary.succeeded} recording${summary.succeeded === 1 ? '' : 's'} uploaded successfully.</p>`);
        }
        if (wantFailure) {
            const names = summary.failedNames.slice(0, 10).map(escapeHtml).join(', ');
            const more = summary.failedNames.length > 10 ? ` and ${summary.failedNames.length - 10} more` : '';
            parts.push(`<p>${summary.failed} file${summary.failed === 1 ? '' : 's'} failed to upload: ${names}${more}.</p>`);
        }
        parts.push('<p style="color:#888;font-size:12px;">You can change these notifications in Settings → Notifications.</p>');

        const subject =
            wantFailure && !wantSuccess
                ? `VoSift: ${summary.failed} upload${summary.failed === 1 ? '' : 's'} failed`
                : `VoSift: ${summary.succeeded} recording${summary.succeeded === 1 ? '' : 's'} uploaded`;

        await sendNotificationEmail({ to: user.email, subject, html: parts.join('\n') });
    } catch (error) {
        logger.error('[notifications] ingest email failed:', error);
    }
}

export interface DigestStats {
    recordings: number;
    seconds: number;
    topContacts: { name: string; count: number }[];
}

/**
 * Collect activity stats for a user since `since` (for digest emails).
 */
export async function collectDigestStats(authSubject: string, since: Date): Promise<DigestStats> {
    const db = await getMongoDb();
    const rows = await db
        .collection(Collections.RECORDINGS)
        .aggregate([
            { $match: { authSubject, recordedAt: { $gte: since } } },
            {
                $group: {
                    _id: null,
                    recordings: { $sum: 1 },
                    seconds: { $sum: '$duration' },
                },
            },
        ])
        .toArray();

    const topContacts = await db
        .collection(Collections.RECORDINGS)
        .aggregate([
            { $match: { authSubject, recordedAt: { $gte: since } } },
            {
                $group: {
                    _id: { $ifNull: ['$contactName', '$phoneNumber'] },
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
            { $limit: 3 },
        ])
        .toArray();

    return {
        recordings: (rows[0]?.recordings as number) ?? 0,
        seconds: Math.round((rows[0]?.seconds as number) ?? 0),
        topContacts: topContacts.map((row) => ({
            name: String(row._id ?? 'Unknown'),
            count: row.count as number,
        })),
    };
}

/**
 * Send a weekly/monthly activity digest. Skips users with no activity in the
 * period so quiet accounts don't get empty mail. Never throws.
 */
export async function sendDigestEmail(
    user: User,
    period: 'weekly' | 'monthly',
    stats: DigestStats
): Promise<boolean> {
    if (stats.recordings === 0) return false;

    try {
        const minutes = Math.round(stats.seconds / 60);
        const contacts = stats.topContacts.length
            ? `<p>Top contacts: ${stats.topContacts.map((c) => `${escapeHtml(c.name)} (${c.count})`).join(', ')}</p>`
            : '';
        const label = period === 'weekly' ? 'last 7 days' : 'last month';

        return await sendNotificationEmail({
            to: user.email,
            subject: `VoSift: your ${period} digest — ${stats.recordings} recordings`,
            html: [
                `<p>Your call activity for the ${label}:</p>`,
                `<p><strong>${stats.recordings}</strong> recordings · <strong>${minutes}</strong> minutes</p>`,
                contacts,
                '<p style="color:#888;font-size:12px;">You can change these notifications in Settings → Notifications.</p>',
            ].join('\n'),
        });
    } catch (error) {
        logger.error('[notifications] digest email failed:', error);
        return false;
    }
}

/**
 * Whether a digest is due on `now` (UTC): weekly digests go out on Mondays
 * covering the previous 7 days; monthly digests on the 1st covering the
 * previous calendar month.
 */
export function digestWindow(
    preference: 'off' | 'weekly' | 'monthly',
    now: Date = new Date()
): { period: 'weekly' | 'monthly'; since: Date } | null {
    if (preference === 'weekly' && now.getUTCDay() === 1) {
        return { period: 'weekly', since: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
    }
    if (preference === 'monthly' && now.getUTCDate() === 1) {
        const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        return { period: 'monthly', since };
    }
    return null;
}
