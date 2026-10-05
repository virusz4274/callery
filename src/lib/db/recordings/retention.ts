import { Collections, getMongoDb } from '@/lib/mongodb';
import type { Recording } from '../types';

const POLICY_DAYS: Record<string, number> = {
    '3m': 90,
    '6m': 180,
    '1y': 365,
};

/**
 * Get recordings that should be deleted based on user deletion policies.
 * Returns recordings grouped by authSubject for batch processing.
 */
export async function getExpiredRecordings(
    batchSize: number = 100
): Promise<{ authSubject: string; recordings: Recording[] }[]> {
    const db = await getMongoDb();
    const now = new Date();

    const usersWithPolicies = await db
        .collection<{
            authSubject: string;
            storageSettings: { deletionPolicy: string };
        }>(Collections.USERS)
        .find({
            'storageSettings.deletionPolicy': { $in: ['3m', '6m', '1y'] },
        })
        .project({ authSubject: 1, 'storageSettings.deletionPolicy': 1 })
        .toArray();

    const results: { authSubject: string; recordings: Recording[] }[] = [];

    for (const user of usersWithPolicies) {
        const policy = user.storageSettings?.deletionPolicy;
        const days = POLICY_DAYS[policy];

        if (!days) {
            continue;
        }

        const cutoffDate = new Date(now);
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const expiredRecordings = await db
            .collection<Recording>(Collections.RECORDINGS)
            .find({
                authSubject: user.authSubject,
                recordedAt: { $lt: cutoffDate },
            })
            .limit(batchSize)
            .toArray();

        if (expiredRecordings.length > 0) {
            results.push({
                authSubject: user.authSubject,
                recordings: expiredRecordings,
            });
        }
    }

    return results;
}
