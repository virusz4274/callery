import 'server-only';
import type { Db } from 'mongodb';
import { Collections, getMongoDb } from './mongodb';
import { readSystemSettingsSingleton } from './db/system-settings-singleton';
import { ProcessingPausedError } from './processing-pause';

export { ProcessingPausedError } from './processing-pause';

export async function processingAvailability(database?: Db): Promise<{ ready: boolean; code?: 'processing_paused' }> {
    const db = database || await getMongoDb();
    const settings = await readSystemSettingsSingleton(db, Collections.SYSTEM_SETTINGS);
    return settings?.processingPaused === true ? { ready: false, code: 'processing_paused' } : { ready: true };
}

/** Check immediately before a provider call; the setting creates no monetary hold. */
export async function assertProcessingAvailable(database?: Db): Promise<void> {
    if (!(await processingAvailability(database)).ready) throw new ProcessingPausedError();
}
