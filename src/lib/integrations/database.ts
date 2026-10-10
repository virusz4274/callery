import { type Db } from 'mongodb';
import { getMongoDb } from '@/lib/mongodb';
import { ApiError } from './contracts';

export const IntegrationCollections = { tokens: 'integration_tokens', uploads: 'integration_uploads', jobs: 'integration_jobs' } as const;

// Required unique indexes are checked at runtime as well as by db:init. Never
// serve an apparently healthy API when deduplication cannot be enforced.
const ready = new WeakMap<Db, Promise<void>>();
export async function initializeIntegrationIndexes(db: Db) {
    await db.collection(IntegrationCollections.tokens).createIndexes([
        { key: { hash: 1 }, unique: true, name: 'token_hash_unique' },
        { key: { owner: 1, createdAt: -1 }, name: 'token_owner' },
    ]);
    await db.collection(IntegrationCollections.uploads).createIndexes([
        { key: { owner: 1, integrationId: 1, requestKey: 1 }, unique: true, partialFilterExpression: { requestKey: { $type: 'string' } }, name: 'upload_request_unique' },
        { key: { state: 1, expiresAt: 1, leaseUntil: 1 }, name: 'upload_worker' },
    ]);
    await db.collection(IntegrationCollections.jobs).createIndexes([
        { key: { state: 1, leaseUntil: 1, createdAt: 1 }, name: 'job_worker' },
    ]);
    await db.collection('recordings').createIndexes([
        { key: { ingestionId: 1 }, unique: true, partialFilterExpression: { ingestionId: { $type: 'string' } }, name: 'ingestion_unique' },
        { key: { authSubject: 1, 'integration.source': 1, 'integration.externalId': 1 }, unique: true, partialFilterExpression: { 'integration.externalId': { $type: 'string' }, 'integration.source': { $type: 'string' } }, name: 'external_recording_unique' },
    ]);
}
export async function integrationDb(): Promise<Db> {
    const db = await getMongoDb();
    let promise = ready.get(db);
    if (!promise) { promise = initializeIntegrationIndexes(db); ready.set(db, promise); }
    try { await promise; } catch { ready.delete(db); throw new ApiError(503, 'api_not_ready', 'Integration database indexes are unavailable.', 60); }
    return db;
}
