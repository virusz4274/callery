import { Collections, getMongoDb } from '@/lib/mongodb';
import type { UpdateProfileBody } from '@/lib/schemas';
import type { User } from '../types';
import { getTeamSettings } from '@/lib/team-policy';

/** Update supplied settings fields without replacing their sibling fields. */
export async function updateUserProfile(authSubject: string, data: UpdateProfileBody): Promise<User | null> {
    if ((data.storageSettings || data.transcriptionSettings) && (await getTeamSettings()).enabled) {
        throw new Error('Retention and processing are managed by your company administrator.');
    }
    const db = await getMongoDb();
    const { notificationSettings, storageSettings, transcriptionSettings, ...profile } = data;
    const fields: Record<string, unknown> = Object.fromEntries(
        Object.entries(profile).filter(([, value]) => value !== undefined)
    );

    for (const [name, settings] of Object.entries({ notificationSettings, storageSettings, transcriptionSettings })) {
        if (settings) {
            for (const [key, value] of Object.entries(settings)) {
                if (value !== undefined) fields[`${name}.${key}`] = value;
            }
        }
    }

    // Pipeline strings are expressions unless explicitly marked as literals.
    const pipeline: Record<string, unknown>[] = [{
        $set: {
            ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { $literal: value }])),
            updatedAt: new Date(),
        },
    }];
    if (data.firstName !== undefined || data.lastName !== undefined) {
        pipeline.push({ $set: { name: { $trim: { input: { $concat: ['$firstName', ' ', '$lastName'] } } } } });
    }

    return db.collection<User>(Collections.USERS).findOneAndUpdate(
        { authSubject }, pipeline, { returnDocument: 'after' }
    );
}
