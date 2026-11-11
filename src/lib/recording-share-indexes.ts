import type { InitializationIndexGroup } from './db/index-definitions';

export const RECORDING_SHARES = 'recording_shares';
export const SHARING_INDEX_GROUPS: InitializationIndexGroup[] = [{ collection: RECORDING_SHARES, indexes: [
    { key: { owner: 1, recordingId: 1, createdAt: -1 }, name: 'recording_shares_owner' },
    { key: { expiresAt: 1 }, name: 'recording_shares_expiry' },
] }];
