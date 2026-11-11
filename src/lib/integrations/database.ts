import { type Db } from 'mongodb';
import { getMongoDb } from '@/lib/mongodb';
import { ApiError } from './contracts';
import type { InitializationIndexGroup } from '@/lib/db/index-definitions';

export const IntegrationCollections = { tokens: 'integration_tokens', uploads: 'integration_uploads', jobs: 'integration_jobs' } as const;

// Required unique indexes are checked at runtime as well as by db:init. Never
// serve an apparently healthy API when deduplication cannot be enforced.
const ready = new WeakMap<Db, Promise<void>>();
export const INTEGRATION_INDEX_GROUPS: InitializationIndexGroup[] = [
    { collection: 'integration_oauth_connections', indexes: [{ key: { owner: 1, createdAt: -1 }, name: 'oauth_connection_owner' }] },
    { collection: 'oauthClient', indexes: [{ key: { clientId: 1 }, unique: true, name: 'oauth_client_id' }] },
    { collection: 'oauthConsent', indexes: [{ key: { userId: 1, clientId: 1 }, name: 'oauth_consent_user_client' }] },
    { collection: 'oauthRefreshToken', indexes: [{ key: { token: 1 }, unique: true, name: 'oauth_refresh_hash' }, { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'oauth_refresh_expiry' }] },
    { collection: 'oauthAccessToken', indexes: [{ key: { token: 1 }, unique: true, name: 'oauth_access_hash' }, { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'oauth_access_expiry' }] },
    { collection: IntegrationCollections.tokens, indexes: [
        { key: { hash: 1 }, unique: true, name: 'token_hash_unique' },
        { key: { owner: 1, createdAt: -1 }, name: 'token_owner' },
    ] },
    { collection: IntegrationCollections.uploads, indexes: [
        { key: { owner: 1, integrationId: 1, requestKey: 1 }, unique: true, partialFilterExpression: { requestKey: { $type: 'string' } }, name: 'upload_request_unique' },
        { key: { state: 1, expiresAt: 1, leaseUntil: 1 }, name: 'upload_worker' },
    ] },
    { collection: IntegrationCollections.jobs, indexes: [
        { key: { state: 1, leaseUntil: 1, createdAt: 1 }, name: 'job_worker' },
        { key: { batchId: 1, state: 1 }, name: 'batch_job_state' },
        { key: { owner: 1, kind: 1, searchProfileId: 1, state: 1, recordingId: 1 }, name: 'search_index_owner_queue' },
    ] },
    { collection: 'transcription_batches', indexes: [
        { key: { owner: 1, createdAt: -1 }, name: 'transcription_batch_owner' },
        { key: { status: 1, updatedAt: 1 }, name: 'transcription_batch_worker' },
    ] },
    { collection: 'transcription_imports', indexes: [{ key: { owner: 1, createdAt: -1 } }] },
    { collection: 'recordings', indexes: [
        { key: { ingestionId: 1 }, unique: true, partialFilterExpression: { ingestionId: { $type: 'string' } }, name: 'ingestion_unique' },
        { key: { authSubject: 1, 'integration.source': 1, 'integration.externalId': 1 }, unique: true, partialFilterExpression: { 'integration.externalId': { $type: 'string' }, 'integration.source': { $type: 'string' } }, name: 'external_recording_unique' },
        { key: { authSubject: 1, bulkImportId: 1, transcriptionBatchId: 1, recordingDateKey: -1 }, name: 'transcription_waiting' },
    ] },
];

async function awaitInitialization(db: Db, pending: Promise<void>): Promise<void> {
    try { await pending; }
    catch (error) {
        if (ready.get(db) === pending) ready.delete(db);
        throw error;
    }
}

/** Explicit db:init rechecks every index and replaces stale runtime proof. */
export async function initializeIntegrationIndexes(db: Db): Promise<void> {
    const pending = (async () => {
        for (const group of INTEGRATION_INDEX_GROUPS) await db.collection(group.collection).createIndexes(group.indexes);
    })();
    ready.set(db, pending);
    await awaitInitialization(db, pending);
}

export async function ensureIntegrationIndexes(db: Db): Promise<void> {
    const pending = ready.get(db);
    if (!pending) return initializeIntegrationIndexes(db);
    await awaitInitialization(db, pending);
}

export async function integrationDb(): Promise<Db> {
    const db = await getMongoDb();
    try { await ensureIntegrationIndexes(db); }
    catch { throw new ApiError(503, 'api_not_ready', 'Integration database indexes are unavailable.', 60); }
    return db;
}
