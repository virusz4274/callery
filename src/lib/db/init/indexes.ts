import type { Db, Document, IndexDescription } from 'mongodb';
import { logger } from '@/lib/logger';
import { initializeIntegrationIndexes, INTEGRATION_INDEX_GROUPS } from '@/lib/integrations/database';
import { initializeBillingIndexes, BILLING_INDEX_GROUPS } from '@/lib/stripe/database';
import { initializationIndexName, type InitializationIndexGroup } from '@/lib/db/index-definitions';
import { SHARING_INDEX_GROUPS } from '@/lib/recording-share-indexes';
import { SEARCH_INDEX_GROUPS } from '@/lib/search/passages';

export type CollectionsMap = {
    TEAM_INVITATIONS: string;
    USERS: string;
    USAGE_EVENTS: string;
    RECORDINGS: string;
    CONTACTS: string;
    PLANS: string;
    EXPORT_JOBS: string;
    ADMIN_LOGS: string;
    NOTIFICATIONS: string;
    EXTERNAL_SERVICE_INCIDENTS: string;
    SUPPORT_MESSAGES: string;
    RATE_LIMIT_BUCKETS: string;
    STRIPE_WEBHOOK_EVENTS: string;
    TRANSCRIPTION_WEBHOOK_EVENTS: string;
};

type IndexTask = {
    label: string;
    collection: string;
    indexes: IndexDescription[];
    errorMessage: string;
};

function coreIndexTasks(collections: CollectionsMap): IndexTask[] {
    return [
        {
            label: 'Search embedding cache', collection: 'search_embedding_cache',
            indexes: [{ key: { expiresAt: 1 }, name: 'search_embedding_expiry', expireAfterSeconds: 0 }, { key: { subject: 1 }, name: 'search_embedding_subject' }],
            errorMessage: 'Search embedding cache index creation failed:',
        },
        {
            label: 'Processing execution policies', collection: 'processing_execution_policies',
            indexes: [{ key: { subject: 1, state: 1, updatedAt: 1 }, name: 'processing_execution_subject_state' }],
            errorMessage: 'Processing execution index creation failed:',
        },
        {
            label: 'Provider call observations', collection: 'processing_provider_calls',
            indexes: [{ key: { subject: 1, createdAt: 1 }, name: 'processing_provider_subject_createdAt' }],
            errorMessage: 'Provider call observation index creation failed:',
        },
        {
            label: 'AI cost receipts', collection: 'ai_cost_receipts',
            indexes: [{ key: { subject: 1, createdAt: 1 }, name: 'ai_cost_subject_createdAt' }],
            errorMessage: 'AI cost receipt index creation failed:',
        },
        {
            label: 'Export object cleanup', collection: 'export_object_cleanup',
            indexes: [{ key: { subject: 1, jobId: 1 }, name: 'export_write_owner' }, { key: { state: 1, leaseUntil: 1, expiresAt: 1 }, name: 'export_write_cleanup_due' }],
            errorMessage: 'Export object cleanup index creation failed:',
        },
        {
            label: 'Team invitations', collection: collections.TEAM_INVITATIONS,
            indexes: [{ key: { email: 1 }, unique: true, name: 'invitation_email_unique' }],
            errorMessage: 'Team invitation index creation failed:',
        },
        {
            label: 'Usage Events', collection: collections.USAGE_EVENTS,
            indexes: [{ key: { pending: 1, retryAt: 1, leaseUntil: 1, createdAt: 1 }, name: 'pending_usage' }],
            errorMessage: 'Usage event index creation failed:',
        },
        {
            label: 'Users',
            collection: collections.USERS,
            indexes: [
                { key: { authSubject: 1 }, unique: true, name: 'authSubject_unique' },
                { key: { email: 1 }, name: 'email' },
            ],
            errorMessage: '⚠️ Users index creation failed:',
        },
        {
            label: 'Recordings',
            collection: collections.RECORDINGS,
            indexes: [
                { key: { 'transcriptionCompletionPending.jobId': 1 }, name: 'deferred_transcription_completion', partialFilterExpression: { 'transcriptionCompletionPending.jobId': { $type: 'string' } } },
                { key: { authSubject: 1, recordedAt: -1 }, name: 'authSubject_recordedAt' },
                { key: { recordedAt: -1, _id: -1 }, name: 'company_recordedAt' },
                { key: { authSubject: 1, contactId: 1 }, name: 'authSubject_contactId' },
                { key: { authSubject: 1, normalizedPhoneNumber: 1 }, name: 'authSubject_normalizedPhoneNumber' },
                { key: { r2Key: 1 }, unique: true, name: 'r2Key_unique' },
                { key: { authSubject: 1, isArchived: 1 }, name: 'authSubject_isArchived' },
                { key: { transcriptionQueuedJobId: 1 }, name: 'transcription_queue_marker', partialFilterExpression: { transcriptionQueuedJobId: { $type: 'string' } } },
            ],
            errorMessage: '⚠️ Recordings index creation failed:',
        },
        {
            label: 'Contacts',
            collection: collections.CONTACTS,
            indexes: [
                { key: { authSubject: 1, googleContactId: 1 }, unique: true, name: 'authSubject_googleContactId_unique' },
                { key: { authSubject: 1, normalizedName: 1 }, name: 'authSubject_normalizedName' },
                { key: { authSubject: 1, normalizedPhoneNumbers: 1 }, name: 'authSubject_normalizedPhoneNumbers' },
            ],
            errorMessage: '⚠️ Contacts index creation failed (likely duplicates):',
        },
        {
            label: 'Plans',
            collection: collections.PLANS,
            indexes: [
                { key: { key: 1 }, unique: true, name: 'key_unique' },
                { key: { name: 1 }, unique: true, name: 'name_unique' },
            ],
            errorMessage: '⚠️ Plans index creation failed:',
        },
        {
            label: 'Admin Logs',
            collection: collections.ADMIN_LOGS,
            indexes: [
                { key: { createdAt: -1 }, name: 'createdAt_desc' },
                { key: { adminId: 1 }, name: 'adminId' },
                { key: { action: 1 }, name: 'action' },
            ],
            errorMessage: '⚠️ Admin Logs index creation failed:',
        },
        {
            label: 'Notifications',
            collection: collections.NOTIFICATIONS,
            indexes: [
                { key: { userId: 1, isRead: 1, createdAt: -1 }, name: 'userId_isRead_createdAt' },
                { key: { userId: 1, createdAt: -1, _id: -1 }, name: 'userId_createdAt_id' },
                { key: { userId: 1, eventKey: 1 }, name: 'userId_eventKey_unique', unique: true, partialFilterExpression: { eventKey: { $type: 'string' } } },
            ],
            errorMessage: '⚠️ Notifications index creation failed:',
        },
        {
            label: 'External Service Incidents',
            collection: collections.EXTERNAL_SERVICE_INCIDENTS,
            indexes: [
                { key: { dedupeKey: 1, status: 1 }, name: 'dedupeKey_status' },
                { key: { status: 1, lastSeenAt: -1 }, name: 'status_lastSeenAt' },
                { key: { provider: 1, operation: 1, status: 1 }, name: 'provider_operation_status' },
            ],
            errorMessage: '⚠️ External service incidents index creation failed:',
        },
        {
            label: 'Support Messages',
            collection: collections.SUPPORT_MESSAGES,
            indexes: [
                { key: { authSubject: 1, createdAt: -1 }, name: 'authSubject_createdAt' },
                { key: { email: 1, createdAt: -1 }, name: 'email_createdAt' },
                { key: { deliveryStatus: 1, createdAt: -1 }, name: 'deliveryStatus_createdAt' },
            ],
            errorMessage: '⚠️ Support messages index creation failed:',
        },
        {
            label: 'Export Jobs',
            collection: collections.EXPORT_JOBS,
            indexes: [
                { key: { authSubject: 1, createdAt: -1 }, name: 'authSubject_createdAt' },
                { key: { status: 1, updatedAt: -1 }, name: 'status_updatedAt' },
                { key: { archiveExpiresAt: 1, cleanedAt: 1 }, name: 'archive_cleanup_due' },
                { key: { costReservationId: 1 }, unique: true, partialFilterExpression: { costReservationId: { $type: 'string' } }, name: 'export_cost_reservation_unique' },
            ],
            errorMessage: '⚠️ Export jobs index creation failed:',
        },
        {
            label: 'Stripe Webhook Events',
            collection: collections.STRIPE_WEBHOOK_EVENTS,
            indexes: [
                { key: { status: 1, updatedAt: -1 }, name: 'status_updatedAt' },
                // Retain unresolved events; dedupe expires only after successful processing.
                { key: { processedAt: 1 }, name: 'processedAt_ttl_90d', expireAfterSeconds: 90 * 24 * 60 * 60, partialFilterExpression: { status: 'processed' } },
            ],
            errorMessage: '⚠️ Stripe webhook events index creation failed:',
        },
        {
            label: 'Transcription Webhook Events',
            collection: collections.TRANSCRIPTION_WEBHOOK_EVENTS,
            indexes: [
                { key: { status: 1, updatedAt: -1 }, name: 'status_updatedAt' },
                { key: { recordingId: 1, provider: 1, updatedAt: -1 }, name: 'recordingId_provider_updatedAt' },
                // Keep dedupe history for 90 days.
                { key: { receivedAt: 1 }, name: 'receivedAt_ttl_90d', expireAfterSeconds: 90 * 24 * 60 * 60 },
            ],
            errorMessage: '⚠️ Transcription webhook events index creation failed:',
        },
        {
            label: 'Rate Limit Buckets',
            collection: collections.RATE_LIMIT_BUCKETS,
            indexes: [
                { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 },
            ],
            errorMessage: '⚠️ Rate limit bucket index creation failed:',
        },
    ];
}

export interface InitializationIndexInspection {
    missing: Array<{ collection: string; name: string }>;
    conflicts: Array<{ collection: string; name: string; message: string }>;
    replacements: Array<{ collection: string; name: string }>;
}

export function initializationIndexGroups(collections: CollectionsMap): InitializationIndexGroup[] {
    return [...coreIndexTasks(collections), ...INTEGRATION_INDEX_GROUPS, ...BILLING_INDEX_GROUPS, ...SHARING_INDEX_GROUPS, ...SEARCH_INDEX_GROUPS];
}

function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
    return value;
}

function sameValue(left: unknown, right: unknown): boolean {
    return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function sameKey(left: unknown, right: unknown): boolean {
    // Compound field order defines an index and must not be sorted.
    return JSON.stringify(left) === JSON.stringify(right);
}

function sameOptions(actual: Document, expected: IndexDescription): boolean {
    const flags = ['unique', 'sparse', 'hidden'] as const;
    if (flags.some(flag => Boolean(actual[flag]) !== Boolean(expected[flag]))) return false;
    return ['expireAfterSeconds', 'partialFilterExpression', 'collation', 'wildcardProjection', 'weights', 'default_language', 'language_override', 'textIndexVersion', '2dsphereIndexVersion', 'bits', 'min', 'max', 'bucketSize'].every(option => sameValue(actual[option], (expected as unknown as Document)[option]));
}

function recognizedLegacyStripeTtl(index: Document): boolean {
    return index.name === 'receivedAt_ttl_90d' && sameKey(index.key, { receivedAt: 1 })
        && sameOptions(index, { key: { receivedAt: 1 }, expireAfterSeconds: 90 * 24 * 60 * 60 });
}

async function storedIndexes(db: Db, collection: string): Promise<Document[]> {
    try { return await db.collection(collection).listIndexes().toArray(); }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 26) return [];
        throw error;
    }
}

/** Inspect without creating collections, indexes, or any other records. */
export async function inspectInitializationIndexes(db: Db, collections: CollectionsMap): Promise<InitializationIndexInspection> {
    const result: InitializationIndexInspection = { missing: [], conflicts: [], replacements: [] };
    const groups = new Map<string, IndexDescription[]>();
    for (const group of initializationIndexGroups(collections)) groups.set(group.collection, [...(groups.get(group.collection) ?? []), ...group.indexes]);
    // Some durable financial records use only their built-in _id index. They
    // still need TTL inspection, but must not create an empty index group.
    for (const { name } of await db.listCollections({ name: /^billing_/ }, { nameOnly: true }).toArray()) {
        if (!groups.has(name)) groups.set(name, []);
    }
    for (const [collection, expectedIndexes] of groups) {
        const existing = await storedIndexes(db, collection);
        const conflictNames = new Set<string>();
        const conflict = (name: string, message: string) => {
            if (!conflictNames.has(name)) { result.conflicts.push({ collection, name, message }); conflictNames.add(name); }
        };
        if (collection.startsWith('billing_') || collection === collections.USAGE_EVENTS || collection === collections.USERS) {
            for (const index of existing.filter(index => index.expireAfterSeconds !== undefined)) conflict(String(index.name), 'Financial records require explicit settlement before expiry. Review this TTL manually; initialization will not remove it.');
        }
        if (collection === collections.STRIPE_WEBHOOK_EVENTS) {
            for (const index of existing.filter(index => index.expireAfterSeconds !== undefined)) {
                if (recognizedLegacyStripeTtl(index)) result.replacements.push({ collection, name: String(index.name) });
                else if (!(index.name === 'processedAt_ttl_90d' && sameKey(index.key, { processedAt: 1 }) && sameOptions(index, { key: { processedAt: 1 }, expireAfterSeconds: 90 * 24 * 60 * 60, partialFilterExpression: { status: 'processed' } }))) {
                    conflict(String(index.name), 'Unrecognized Stripe webhook TTL could erase unresolved events. Review this index manually; initialization will not remove it.');
                }
            }
        }
        for (const expected of expectedIndexes) {
            const name = initializationIndexName(expected);
            const named = existing.find(index => index.name === name);
            if (named) {
                if (!sameKey(named.key, expected.key) || !sameOptions(named, expected)) conflict(name, 'Existing index keys or options differ from the required definition. Review this index manually; initialization will not remove it.');
                continue;
            }
            const samePattern = existing.find(index => sameKey(index.key, expected.key));
            if (samePattern) {
                conflict(String(samePattern.name), `Existing index uses the required key pattern under a different name or options (expected ${name}). Review it manually; initialization will not remove it.`);
            } else result.missing.push({ collection, name });
        }
    }
    return result;
}

export async function createCoreIndexes(db: Db, collections: CollectionsMap): Promise<void> {
    const inspection = await inspectInitializationIndexes(db, collections);
    if (inspection.conflicts.length) throw new Error(`Database index conflicts: ${inspection.conflicts.map(item => `${item.collection}.${item.name}: ${item.message}`).join(' ')}. No conflicting indexes were removed.`);
    for (const replacement of inspection.replacements) {
        // Re-read immediately before the one recognized destructive schema change.
        const current = (await storedIndexes(db, replacement.collection)).find(index => index.name === replacement.name);
        if (!current) continue;
        if (!recognizedLegacyStripeTtl(current)) throw new Error(`Index ${replacement.collection}.${replacement.name} changed during initialization; review it manually.`);
        try { await db.collection(replacement.collection).dropIndex(replacement.name); }
        catch (error) {
            // A concurrent initializer may have completed this same replacement.
            if (!(error && typeof error === 'object' && 'code' in error && error.code === 27)
                || (await storedIndexes(db, replacement.collection)).some(index => index.name === replacement.name)) throw error;
        }
    }
    for (const task of coreIndexTasks(collections)) {
        try {
            await db.collection(task.collection).createIndexes(task.indexes);
            logger.info(`✅ ${task.label} indexes created`);
        } catch (error) {
            logger.error(task.errorMessage, error);
            throw error;
        }
    }
    await initializeIntegrationIndexes(db);
    await initializeBillingIndexes(db);
    for (const group of [...SHARING_INDEX_GROUPS, ...SEARCH_INDEX_GROUPS]) await db.collection(group.collection).createIndexes(group.indexes);
}
