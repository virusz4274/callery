import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { MongoClient, MongoServerError } from 'mongodb';
import { Collections, getCachedMongoDb } from '@/lib/mongodb';
import { createCoreIndexes, inspectInitializationIndexes } from './indexes';
import { ensureBillingIndexes } from '@/lib/stripe/database';
import { ensureIntegrationIndexes } from '@/lib/integrations/database';

const uri = process.env.VOSIFT_TEST_MONGODB_URI;

test('standalone Mongo creates exact billing constraints and preserves unresolved webhook events', { skip: !uri }, async t => {
    const client = await new MongoClient(uri!, { serverSelectionTimeoutMS: 15_000 }).connect();
    const db = getCachedMongoDb(client, `vt_indexes_${randomUUID().replaceAll('-', '').slice(0, 18)}`);
    try {
        const events = db.collection(Collections.STRIPE_WEBHOOK_EVENTS);
        const old = new Date(Date.now() - 100 * 24 * 60 * 60_000);
        // The old TTL is recognizable even on a non-empty installation.
        await events.createIndex({ receivedAt: 1 }, { name: 'receivedAt_ttl_90d', expireAfterSeconds: 90 * 24 * 60 * 60 });
        await events.insertMany([
            { type: 'test', status: 'failed', receivedAt: new Date(), processedAt: old },
            { type: 'test', status: 'processing', receivedAt: new Date() },
            { type: 'test', status: 'processed', receivedAt: new Date(), processedAt: new Date() },
        ]);
        const beforeCollections = await db.listCollections({}, { nameOnly: true }).toArray();
        const beforeIndexes = await events.listIndexes().toArray();
        const dryRun = await inspectInitializationIndexes(db, Collections);
        assert.ok(dryRun.missing.length > 0);
        assert.deepEqual(dryRun.replacements, [{ collection: Collections.STRIPE_WEBHOOK_EVENTS, name: 'receivedAt_ttl_90d' }]);
        assert.deepEqual(await db.listCollections({}, { nameOnly: true }).toArray(), beforeCollections);
        assert.deepEqual(await events.listIndexes().toArray(), beforeIndexes);

        await t.test('simultaneous setup replaces only the recognized TTL', async () => {
            await Promise.all([createCoreIndexes(db, Collections), createCoreIndexes(db, Collections)]);
            await createCoreIndexes(db, Collections);
            assert.deepEqual(await inspectInitializationIndexes(db, Collections), { missing: [], conflicts: [], replacements: [] });
            const indexes = await events.listIndexes().toArray();
            const ttl = indexes.find(index => index.name === 'processedAt_ttl_90d')!;
            assert.deepEqual(ttl.key, { processedAt: 1 });
            assert.deepEqual(ttl.partialFilterExpression, { status: 'processed' });
            assert.equal(ttl.expireAfterSeconds, 90 * 24 * 60 * 60);
            assert.equal(indexes.some(index => index.name === 'receivedAt_ttl_90d'), false);
            await events.updateMany({}, { $set: { receivedAt: old } });
            assert.equal(await events.countDocuments({ status: { $in: ['failed', 'processing'] } }), 2);
            assert.equal(await events.countDocuments({ status: 'processed', processedAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60_000) } }), 0);
        });

        await t.test('explicit reruns repair missing constraints despite a completed runtime cache', async () => {
            await ensureBillingIndexes(db);
            await ensureIntegrationIndexes(db);
            await db.collection('billing_prepaid_topups').dropIndex('paymentIntentId_1');
            await db.collection('integration_tokens').dropIndex('token_hash_unique');
            const missing = (await inspectInitializationIndexes(db, Collections)).missing;
            assert.ok(missing.some(index => index.collection === 'billing_prepaid_topups' && index.name === 'paymentIntentId_1'));
            assert.ok(missing.some(index => index.collection === 'integration_tokens' && index.name === 'token_hash_unique'));
            await createCoreIndexes(db, Collections);
            assert.deepEqual(await inspectInitializationIndexes(db, Collections), { missing: [], conflicts: [], replacements: [] });
        });

        await t.test('financial identity is unique while customer lookup remains nonunique', async () => {
            const grants = db.collection('billing_grant_transfers');
            await grants.insertOne({ fromGrantId: 'grant_original', state: 'ready' });
            await assert.rejects(grants.insertOne({ fromGrantId: 'grant_original', state: 'creating' }), (error: unknown) => error instanceof MongoServerError && error.code === 11000);
            const topups = db.collection('billing_prepaid_topups');
            await topups.insertOne({ paymentIntentId: 'pi_confirmed', state: 'completed' });
            await assert.rejects(topups.insertOne({ paymentIntentId: 'pi_confirmed', state: 'creating' }), (error: unknown) => error instanceof MongoServerError && error.code === 11000);
            await topups.insertMany([{ state: 'creating' }, { state: 'creating' }]);
            await db.collection(Collections.USERS).insertMany([{ authSubject: 'one', stripeCustomerId: 'cus_legacy' }, { authSubject: 'two', stripeCustomerId: 'cus_legacy' }]);
            await db.collection('billing_deleted_accounts').insertMany([{ authSubject: 'deleted_one', stripeCustomerId: 'cus_legacy' }, { authSubject: 'deleted_two', stripeCustomerId: 'cus_legacy' }]);
            for (const collection of ['billing_grant_transfers', 'billing_prepaid_topups', 'billing_deleted_accounts', 'billing_settlements', 'usage_events']) {
                assert.ok((await db.collection(collection).listIndexes().toArray()).every(index => index.expireAfterSeconds === undefined));
            }
        });

        await t.test('a users TTL is an explicit financial conflict and is never removed', async () => {
            const users = db.collection(Collections.USERS);
            await users.createIndex({ expiresAt: 1 }, { name: 'unsafe_users_ttl', expireAfterSeconds: 0 });
            const snapshot = await users.listIndexes().toArray();
            const inspection = await inspectInitializationIndexes(db, Collections);
            assert.ok(inspection.conflicts.some(index => index.collection === Collections.USERS && index.name === 'unsafe_users_ttl'));
            await assert.rejects(createCoreIndexes(db, Collections), /Financial records require explicit settlement/);
            assert.deepEqual(await users.listIndexes().toArray(), snapshot);
            // This disposable fixture is removed only so the next independent case can run.
            await users.dropIndex('unsafe_users_ttl');
        });

        await t.test('financial collections without required secondary indexes still reject TTL expiry', async () => {
            const budget = db.collection('billing_operator_budget');
            await budget.createIndex({ expiresAt: 1 }, { name: 'unsafe_budget_ttl', expireAfterSeconds: 0 });
            const snapshot = await budget.listIndexes().toArray();
            const inspection = await inspectInitializationIndexes(db, Collections);
            assert.ok(inspection.conflicts.some(index => index.collection === 'billing_operator_budget' && index.name === 'unsafe_budget_ttl'));
            assert.equal(inspection.missing.some(index => index.collection === 'billing_operator_budget'), false);
            await assert.rejects(createCoreIndexes(db, Collections), /billing_operator_budget.unsafe_budget_ttl/);
            assert.deepEqual(await budget.listIndexes().toArray(), snapshot);
            await budget.dropIndex('unsafe_budget_ttl');
            await createCoreIndexes(db, Collections);
            assert.deepEqual((await budget.listIndexes().toArray()).map(index => index.name), ['_id_']);
        });

        await t.test('unknown TTL conflict is preserved with no index changes', async () => {
            await events.createIndex({ receivedAt: 1 }, { name: 'receivedAt_ttl_90d', expireAfterSeconds: 10 });
            const snapshot = await events.listIndexes().toArray();
            const inspection = await inspectInitializationIndexes(db, Collections);
            assert.ok(inspection.conflicts.some(index => index.name === 'receivedAt_ttl_90d'));
            assert.deepEqual(inspection.replacements, []);
            await assert.rejects(createCoreIndexes(db, Collections), /Unrecognized Stripe webhook TTL/);
            assert.deepEqual(await events.listIndexes().toArray(), snapshot);
        });
    } finally { await db.dropDatabase(); await client.close(); }
});
