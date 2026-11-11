import { getMongoDb, Collections } from '@/lib/mongodb';
import { sendNotificationEmail } from '@/lib/email';
import type { User } from '@/lib/db/types';
import { logger } from '@/lib/logger';
import { checkUserAccess } from '@/lib/access-control-common';

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export interface DigestStats {
    recordings: number;
    seconds: number;
    topContacts: { name: string; count: number }[];
}

/**
 * Collect activity stats for one user in the half-open interval [since, until).
 */
export async function collectDigestStats(authSubject: string, since: Date, until: Date): Promise<DigestStats> {
    const db = await getMongoDb();
    const match = { authSubject, recordedAt: { $gte: since, $lt: until } };
    const rows = await db
        .collection(Collections.RECORDINGS)
        .aggregate([
            { $match: match },
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
            { $match: match },
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
    if (stats.recordings === 0 || !checkUserAccess(user).allowed) return false;

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
 * covering the seven days ending at the captured run time; monthly digests
 * on the 1st cover the previous calendar month, ending at this month's start.
 * Both intervals include their start and exclude their end.
 */
export function digestWindow(
    preference: 'off' | 'weekly' | 'monthly',
    now: Date = new Date()
): { period: 'weekly' | 'monthly'; since: Date; until: Date } | null {
    if (preference === 'weekly' && now.getUTCDay() === 1) {
        return { period: 'weekly', since: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), until: new Date(now) };
    }
    if (preference === 'monthly' && now.getUTCDate() === 1) {
        const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        return { period: 'monthly', since, until };
    }
    return null;
}
