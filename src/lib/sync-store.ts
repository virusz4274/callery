/**
 * Sync Store - IndexedDB-based storage for tracking synced files.
 * Prevents duplicate uploads by tracking file fingerprints.
 */

export type { SyncedFile } from './sync-store/types';

export { generateFingerprint } from './sync-store/fingerprint';

export {
    getLastSyncTime,
    getSyncedCount,
    getSyncedFiles,
    getSyncedFingerprints,
    isSynced,
} from './sync-store/read';

export {
    clearFolderSyncHistory,
    clearSyncHistory,
    markAsSynced,
} from './sync-store/write';
