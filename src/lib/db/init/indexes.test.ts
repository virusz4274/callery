import assert from 'node:assert/strict';
import test from 'node:test';
import { MongoServerError, type Db, type Document, type IndexDescription, type MongoClient } from 'mongodb';
import { Collections, getCachedMongoDb } from '@/lib/mongodb';
import { ensureBillingIndexes, BILLING_INDEX_GROUPS } from '@/lib/stripe/database';
import { createCoreIndexes, initializationIndexGroups, inspectInitializationIndexes } from './indexes';
import { initializationIndexName } from '@/lib/db/index-definitions';
import { ensureIntegrationIndexes } from '@/lib/integrations/database';

class IndexDatabase {
    indexes = new Map<string, Document[]>();
    writes: string[] = [];
    failCollection?: string;
    listCollections(filter: { name?: RegExp } = {}) {
        return { toArray: async () => [...this.indexes.keys()].filter(name => !filter.name || filter.name.test(name)).map(name => ({ name })) };
    }
    collection(name: string) {
        return {
            listIndexes: () => ({ toArray: async () => {
                if (!this.indexes.has(name)) throw new MongoServerError({ code: 26, message: 'NamespaceNotFound' });
                return structuredClone(this.indexes.get(name)!);
            } }),
            createIndexes: async (indexes: IndexDescription[]) => {
                this.writes.push(`create:${name}`);
                if (this.failCollection === name) { this.failCollection = undefined; throw new Error('temporary index failure'); }
                const current = this.indexes.get(name) ?? [];
                for (const index of indexes) {
                    const document = { ...structuredClone(index), name: initializationIndexName(index), v: 2 };
                    if (!current.some(value => value.name === document.name)) current.push(document);
                }
                this.indexes.set(name, current);
                return indexes.map(initializationIndexName);
            },
            dropIndex: async (indexName: string) => {
                this.writes.push(`drop:${name}.${indexName}`);
                const current = this.indexes.get(name) ?? [];
                if (!current.some(value => value.name === indexName)) throw new MongoServerError({ code: 27, message: 'IndexNotFound' });
                this.indexes.set(name, current.filter(index => index.name !== indexName));
            },
        };
    }
    asDb() { return this as unknown as Db; }
}

const legacyTtl = { key: { receivedAt: 1 }, name: 'receivedAt_ttl_90d', expireAfterSeconds: 90 * 24 * 60 * 60, v: 2 };

test('initialization index inspection is read-only and shares all creation definitions', async () => {
    const database = new IndexDatabase();
    const missing = await inspectInitializationIndexes(database.asDb(), Collections);
    assert.equal(missing.missing.length, initializationIndexGroups(Collections).reduce((sum, group) => sum + group.indexes.length, 0));
    assert.deepEqual(missing.conflicts, []);
    assert.equal(database.writes.length, 0);
    assert.equal(database.indexes.size, 0);
    await createCoreIndexes(database.asDb(), Collections);
    assert.deepEqual(await inspectInitializationIndexes(database.asDb(), Collections), { missing: [], conflicts: [], replacements: [] });
    for (const group of BILLING_INDEX_GROUPS) assert.ok(group.indexes.every(index => index.expireAfterSeconds === undefined));
});

test('only exact legacy Stripe receipt TTL is replaced; processed TTL retains failed work', async () => {
    const database = new IndexDatabase();
    database.indexes.set(Collections.STRIPE_WEBHOOK_EVENTS, [legacyTtl]);
    database.indexes.set(Collections.TRANSCRIPTION_WEBHOOK_EVENTS, [legacyTtl]);
    const preview = await inspectInitializationIndexes(database.asDb(), Collections);
    assert.deepEqual(preview.replacements, [{ collection: Collections.STRIPE_WEBHOOK_EVENTS, name: legacyTtl.name }]);
    assert.equal(database.writes.length, 0);
    await Promise.all([createCoreIndexes(database.asDb(), Collections), createCoreIndexes(database.asDb(), Collections)]);
    const indexes = database.indexes.get(Collections.STRIPE_WEBHOOK_EVENTS)!;
    assert.equal(indexes.some(index => index.name === legacyTtl.name), false);
    assert.deepEqual(indexes.find(index => index.name === 'processedAt_ttl_90d'), {
        key: { processedAt: 1 }, name: 'processedAt_ttl_90d', expireAfterSeconds: 90 * 24 * 60 * 60,
        partialFilterExpression: { status: 'processed' }, v: 2,
    });
    assert.ok(database.indexes.get(Collections.TRANSCRIPTION_WEBHOOK_EVENTS)!.some(index => index.name === legacyTtl.name));
    assert.ok(database.writes.filter(write => write.startsWith('drop:')).every(write => write === 'drop:stripe_webhook_events.receivedAt_ttl_90d'));
});

test('unknown Stripe TTL definitions and required-option conflicts stop before any writes', async () => {
    for (const changed of [
        { ...legacyTtl, expireAfterSeconds: 1 },
        { ...legacyTtl, partialFilterExpression: { status: 'processed' } },
        { ...legacyTtl, key: { updatedAt: 1 } },
        { ...legacyTtl, name: 'custom_received_expiry' },
        { key: { processedAt: 1 }, name: 'processedAt_ttl_90d', expireAfterSeconds: legacyTtl.expireAfterSeconds },
    ]) {
        const database = new IndexDatabase();
        database.indexes.set(Collections.STRIPE_WEBHOOK_EVENTS, [changed]);
        const preview = await inspectInitializationIndexes(database.asDb(), Collections);
        assert.ok(preview.conflicts.length > 0);
        await assert.rejects(createCoreIndexes(database.asDb(), Collections), /review|Review/);
        assert.equal(database.writes.length, 0);
        assert.deepEqual(database.indexes.get(Collections.STRIPE_WEBHOOK_EVENTS), [changed]);
    }
    const database = new IndexDatabase();
    database.indexes.set(Collections.PLANS, [{ key: { key: 1 }, name: 'key_unique', unique: false }]);
    await assert.rejects(createCoreIndexes(database.asDb(), Collections), /plans.key_unique/);
    assert.equal(database.writes.length, 0);
    for (const collection of ['billing_settlements', Collections.USERS]) {
        const financial = new IndexDatabase();
        const unsafe = { key: { expiresAt: 1 }, name: 'unsafe_financial_ttl', expireAfterSeconds: 1 };
        financial.indexes.set(collection, [unsafe]);
        const inspection = await inspectInitializationIndexes(financial.asDb(), Collections);
        assert.ok(inspection.conflicts.some(conflict => conflict.collection === collection && conflict.name === unsafe.name));
        await assert.rejects(createCoreIndexes(financial.asDb(), Collections), /explicit settlement/);
        assert.equal(financial.writes.length, 0);
        assert.deepEqual(financial.indexes.get(collection), [unsafe]);
    }
});

test('financial collections outside the required manifest receive read-only TTL inspection', async () => {
    const database = new IndexDatabase();
    const unsafe = { key: { expiresAt: 1 }, name: 'unsafe_budget_ttl', expireAfterSeconds: 0 };
    const custom = { key: { costPolicyVersion: 1 }, name: 'operator_lookup' };
    database.indexes.set('billing_operator_budget', [unsafe, custom]);
    const inspection = await inspectInitializationIndexes(database.asDb(), Collections);
    assert.ok(inspection.conflicts.some(conflict => conflict.collection === 'billing_operator_budget' && conflict.name === unsafe.name));
    assert.equal(inspection.missing.some(index => index.collection === 'billing_operator_budget'), false);
    assert.equal(database.writes.length, 0);
    await assert.rejects(createCoreIndexes(database.asDb(), Collections), /billing_operator_budget.unsafe_budget_ttl/);
    assert.equal(database.writes.length, 0);
    assert.deepEqual(database.indexes.get('billing_operator_budget'), [unsafe, custom]);
    database.indexes.set('billing_operator_budget', [custom]);
    await createCoreIndexes(database.asDb(), Collections);
    assert.ok(database.writes.every(write => !write.endsWith(':billing_operator_budget')));
    assert.deepEqual(database.indexes.get('billing_operator_budget'), [custom]);
});

test('billing index initialization shares one promise and retries after a failure', async () => {
    const database = new IndexDatabase();
    database.failCollection = 'billing_catalog_versions';
    const outcomes = await Promise.allSettled([ensureBillingIndexes(database.asDb()), ensureBillingIndexes(database.asDb())]);
    assert.ok(outcomes.every(outcome => outcome.status === 'rejected'));
    assert.equal(database.writes.filter(write => write === 'create:billing_deleted_accounts').length, 1);
    await Promise.all([ensureBillingIndexes(database.asDb()), ensureBillingIndexes(database.asDb())]);
    const count = database.writes.length;
    await ensureBillingIndexes(database.asDb());
    assert.equal(database.writes.length, count);
    assert.equal(database.writes.filter(write => write === 'create:billing_deleted_accounts').length, 2);
});

test('explicit initialization repairs missing billing and integration constraints after runtime cache completion', async () => {
    const database = new IndexDatabase();
    await ensureBillingIndexes(database.asDb());
    await ensureIntegrationIndexes(database.asDb());
    await createCoreIndexes(database.asDb(), Collections);
    database.indexes.set('billing_prepaid_topups', database.indexes.get('billing_prepaid_topups')!.filter(index => index.name !== 'paymentIntentId_1'));
    database.indexes.set('integration_tokens', database.indexes.get('integration_tokens')!.filter(index => index.name !== 'token_hash_unique'));
    assert.deepEqual((await inspectInitializationIndexes(database.asDb(), Collections)).missing, [
        { collection: 'integration_tokens', name: 'token_hash_unique' },
        { collection: 'billing_prepaid_topups', name: 'paymentIntentId_1' },
    ]);
    await createCoreIndexes(database.asDb(), Collections);
    assert.deepEqual(await inspectInitializationIndexes(database.asDb(), Collections), { missing: [], conflicts: [], replacements: [] });
});

test('a failed explicit repair invalidates stale billing proof and permits a request retry', async () => {
    const database = new IndexDatabase();
    await createCoreIndexes(database.asDb(), Collections);
    database.indexes.set('billing_prepaid_topups', database.indexes.get('billing_prepaid_topups')!.filter(index => index.name !== 'paymentIntentId_1'));
    database.failCollection = 'billing_prepaid_topups';
    await assert.rejects(createCoreIndexes(database.asDb(), Collections), /temporary index failure/);
    assert.ok((await inspectInitializationIndexes(database.asDb(), Collections)).missing.some(index => index.name === 'paymentIntentId_1'));
    await ensureBillingIndexes(database.asDb());
    assert.deepEqual(await inspectInitializationIndexes(database.asDb(), Collections), { missing: [], conflicts: [], replacements: [] });
});

test('integration cache reuses successful proof and retries after a failed explicit repair', async () => {
    const database = new IndexDatabase();
    await Promise.all([ensureIntegrationIndexes(database.asDb()), ensureIntegrationIndexes(database.asDb())]);
    const writes = database.writes.length;
    await ensureIntegrationIndexes(database.asDb());
    assert.equal(database.writes.length, writes);
    await createCoreIndexes(database.asDb(), Collections);
    database.indexes.set('integration_tokens', database.indexes.get('integration_tokens')!.filter(index => index.name !== 'token_hash_unique'));
    database.failCollection = 'integration_tokens';
    await assert.rejects(createCoreIndexes(database.asDb(), Collections), /temporary index failure/);
    await ensureIntegrationIndexes(database.asDb());
    assert.deepEqual(await inspectInitializationIndexes(database.asDb(), Collections), { missing: [], conflicts: [], replacements: [] });
});

test('Mongo Db handles keep database and client identity for initializer caches', async () => {
    function client() {
        const calls: string[] = [];
        return { calls, options: { dbName: 'primary' }, db(name: string) { calls.push(name); return new IndexDatabase().asDb(); } };
    }
    const first = client(), second = client();
    const handle = getCachedMongoDb(first as unknown as MongoClient);
    assert.equal(getCachedMongoDb(first as unknown as MongoClient), handle);
    assert.equal(getCachedMongoDb(first as unknown as MongoClient, 'primary'), handle);
    assert.notEqual(getCachedMongoDb(first as unknown as MongoClient, 'other'), handle);
    assert.notEqual(getCachedMongoDb(second as unknown as MongoClient), handle);
    await Promise.all([ensureBillingIndexes(handle), ensureBillingIndexes(getCachedMongoDb(first as unknown as MongoClient))]);
    assert.deepEqual(first.calls, ['primary', 'other']);
    assert.deepEqual(second.calls, ['primary']);
});

test('processing and Internal expense indexes preserve unresolved records without TTL', async () => {
    const database = new IndexDatabase();
    await ensureBillingIndexes(database.asDb());
    for (const name of ['billing_internal_cost_receipts', 'billing_processing_budgets', 'billing_internal_storage_expenses']) {
        const indexes = database.indexes.get(name);
        assert.ok(indexes?.length, name);
        assert.ok(indexes.every(index => index.expireAfterSeconds === undefined), name);
    }
    const storage = database.indexes.get('billing_internal_storage_expenses')!;
    assert.ok(storage.some(index => JSON.stringify(index.key) === JSON.stringify({ subject: 1, month: 1 }) && index.unique === true));
    const unsafe = { key: { observedAt: 1 }, name: 'unsafe_internal_ttl', expireAfterSeconds: 0 };
    database.indexes.set('billing_internal_costs', [unsafe]);
    const preview = await inspectInitializationIndexes(database.asDb(), Collections);
    assert.ok(preview.conflicts.some(conflict => conflict.collection === 'billing_internal_costs' && conflict.name === unsafe.name));
});


test('processing notification event identity is unique while ordinary notifications remain unrestricted', () => {
    const group = initializationIndexGroups(Collections).find(value => value.collection === Collections.NOTIFICATIONS);
    const index = group?.indexes.find(value => value.name === 'userId_eventKey_unique');
    assert.deepEqual(index, { key: { userId: 1, eventKey: 1 }, name: 'userId_eventKey_unique', unique: true,
        partialFilterExpression: { eventKey: { $type: 'string' } } });
});


test('deferred transcription completion repair has a matching partial index', () => {
    const group = initializationIndexGroups(Collections).find(value => value.collection === Collections.RECORDINGS);
    assert.deepEqual(group?.indexes.find(value => value.name === 'deferred_transcription_completion'), {
        key: { 'transcriptionCompletionPending.jobId': 1 }, name: 'deferred_transcription_completion',
        partialFilterExpression: { 'transcriptionCompletionPending.jobId': { $type: 'string' } },
    });
});
