import { ObjectId, type Db } from 'mongodb';
import type { SystemSettings } from './types/system';

export const INITIAL_SYSTEM_SETTINGS_ID = new ObjectId('000000000000000000000001');

/** Existing installations retain their original ObjectId. Never choose a
 * random settings document when an installation has conflicting singletons. */
export async function readSystemSettingsSingleton(db: Db, collection: string): Promise<SystemSettings | null> {
    const rows = await db.collection<SystemSettings>(collection).find({}).limit(2).toArray();
    if (rows.length > 1) throw new Error('Multiple system settings documents exist. Resolve the conflict explicitly; initialization will not delete or select one.');
    return rows[0] || null;
}
