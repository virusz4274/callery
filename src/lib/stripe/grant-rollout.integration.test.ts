import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import type { User } from '@/lib/db/types';
import { ensureBillingIndexes } from './database';
import { withBillingLease } from './billing-lock';
import { ensureUsageGrantScope, reconcileUsageGrantScopes, GRANT_TRANSFERS, type GrantTransfer } from './grant-transfer';
import { transferFixture, rolloutTariffs } from './grant-transfer.test-support';
import { processUsagePriceRollouts, scheduleCatalogUsageRollouts, USAGE_PRICE_ROLLOUTS, type UsagePriceRollout } from './usage-price-rollout';
import { getBillingAccount } from './ledger';
import { scheduleFixture } from './subscription-schedule.test-support';

test('isolated Mongo grant transfers and notified monthly tariff rollouts survive crashes and contention', { skip: !process.env.VOSIFT_TEST_MONGODB_URI }, async t => {
    const client = new MongoClient(process.env.VOSIFT_TEST_MONGODB_URI!, { serverSelectionTimeoutMS: 15_000 });
    const db = client.db(`vt_grants_${randomUUID().replaceAll('-', '').slice(0, 18)}`);
    try {
        await client.connect(); await ensureBillingIndexes(db);
        async function reset(withFunds: boolean) {
            for (const row of await db.listCollections().toArray()) await db.collection(row.name).deleteMany({});
            const fixture = transferFixture(withFunds);
            await db.collection<User>('users').insertOne(fixture.user);
            return { ...fixture, runtime: { db, stripe: fixture.stripe.asStripe() } };
        }
        await t.test('lost create response and concurrent reconcilers keep one replacement and original principal', async () => {
            const { stripe, runtime, user } = await reset(true), before = getBillingAccount(user);
            stripe.loseCreate = true;
            await assert.rejects(withBillingLease(db, 'owner', value => ensureUsageGrantScope(value, ['price_next_storage', 'price_next_transcription'], runtime)), /response lost/);
            assert.ok((await db.collection<User>('users').findOne({ authSubject: 'owner' }))!.billingGrantTransfer);
            const results = await Promise.allSettled([reconcileUsageGrantScopes(runtime), reconcileUsageGrantScopes(runtime)]);
            assert.ok(results.some(value => value.status === 'fulfilled'));
            assert.equal(stripe.createCalls, 1);
            const stored = (await db.collection<User>('users').findOne({ authSubject: 'owner' }))!;
            assert.equal(stored.billingGrantTransfer, undefined); assert.deepEqual(getBillingAccount(stored), before);
            assert.equal(await db.collection<GrantTransfer>(GRANT_TRANSFERS).countDocuments({ state: 'ready' }), 1);
        });
        await t.test('a deleted account resumes only financial replacement through its retained tombstone', async () => {
            const { stripe, runtime } = await reset(true); stripe.loseExpire = true;
            await assert.rejects(withBillingLease(db, 'owner', value => ensureUsageGrantScope(value, ['price_next_storage', 'price_next_transcription'], runtime)), /response lost/);
            const original = (await db.collection<User>('users').findOne({ authSubject: 'owner' }))!;
            const erased = { ...original, disabled: true }; delete (erased as Partial<User>).email;
            await db.collection<User>('billing_deleted_accounts').insertOne(erased);
            await db.collection<User>('users').deleteOne({ _id: original._id });
            assert.equal(await reconcileUsageGrantScopes(runtime), 1);
            assert.equal(await db.collection<User>('users').countDocuments({}), 0);
            assert.equal((await db.collection<User>('billing_deleted_accounts').findOne({ authSubject: 'owner' }))!.billingGrantTransfer, undefined);
            assert.equal(stripe.createCalls, 1); assert.equal(stripe.subscriptionUpdates, 0);
        });
        await t.test('competing publications create one notice and adopt prepared Stripe schedule boundaries', async () => {
            for (const row of await db.listCollections().toArray()) await db.collection(row.name).deleteMany({});
            const fixture = scheduleFixture(false), { stripe, user, advance, state } = fixture;
            await db.collection<User>('users').insertOne(user);
            const base = { db, stripe: stripe.asStripe() }, target = rolloutTariffs('mongo_new'), another = rolloutTariffs('mongo_another');
            for (const [id, tariffs] of [['next', target], ['another', another]] as const) await db.collection<{ _id: string; state: string; plans: unknown[] }>('billing_catalog_bundles').insertOne({ _id: id, state: 'published', plans: [{ plan: { key: user.planKey }, usageTariffs: tariffs, catalogVersion: `${id}:${user.planKey}` }] });
            await Promise.all([scheduleCatalogUsageRollouts(undefined, 'next', base, 'next:1'), scheduleCatalogUsageRollouts(undefined, 'another', base, 'another:1')]);
            assert.equal(await db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).countDocuments({ state: 'notifying' }), 1);
            let now = new Date('2026-10-21T12:00:00Z'), emails = 0;
            const runtime = { ...base, now: () => now, sendEmail: async () => { emails++; return true; } };
            await processUsagePriceRollouts(runtime);
            let job = (await db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).findOne({ authSubject: 'owner' }))!;
            assert.ok(job.effectiveAt!.getTime() - job.noticedAt!.getTime() >= 30 * 86400_000);
            assert.equal(emails, 1); assert.equal(await db.collection('notifications').countDocuments({}), 1);
            now = new Date('2026-10-22T12:00:00Z'); await processUsagePriceRollouts(runtime);
            job = (await db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).findOne({ _id: job._id }))!;
            assert.equal(job.scheduleCoordinator, 1); assert.equal(job.state, 'prepared');
            assert.equal(state.creates, 1); assert.equal(stripe.subscriptionUpdates, 0);
            now = job.effectiveAt!;
            advance(now); // Stripe executes its prepared phase independently of app reconciliation.
            await Promise.all([processUsagePriceRollouts(runtime), processUsagePriceRollouts(runtime)]);
            job = (await db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).findOne({ _id: job._id }))!;
            assert.equal(job.state, 'applied'); assert.equal(stripe.subscriptionUpdates, 0);
            const stored = (await db.collection<User>('users').findOne({ _id: user._id }))!;
            assert.equal(stored.billingUsageCatalogVersion, job.targetCatalogVersion);
            assert.deepEqual(stored.billingUsageTariffs, job.targetTariffs);
            assert.equal(stored.billingPaidBasePeriod?.invoiceId, 'in_renewal');
            await db.collection<{ _id: string; state: string; plans: unknown[] }>('billing_catalog_bundles').insertOne({ _id: 'original', state: 'published', plans: [{ plan: { key: user.planKey }, usageTariffs: user.billingUsageTariffs, catalogVersion: `original:${user.planKey}` }] });
            // Reusing a historic bundle must not collide with an earlier
            // publication, notice or the single owned schedule coordinator.
            for (const [bundleId, publicationId] of [['original', 'rollback:2'], [job.targetBundleId, 'republish:3']]) {
                assert.equal(await scheduleCatalogUsageRollouts(undefined, bundleId, runtime, publicationId), 1);
                await processUsagePriceRollouts(runtime);
                let next = (await db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).findOne({ publicationId }))!;
                assert.ok(next.effectiveAt!.getTime() - next.noticedAt!.getTime() >= 30 * 86400_000);
                now = new Date(next.noticedAt!.getTime() + 86400_000); await processUsagePriceRollouts(runtime);
                next = (await db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).findOne({ _id: next._id }))!;
                assert.equal(next.state, 'prepared');
                now = next.effectiveAt!; advance(now);
                await processUsagePriceRollouts(runtime);
                assert.equal((await db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).findOne({ _id: next._id }))!.state, 'applied');
            }
            assert.equal(state.creates, 1); assert.equal(state.updates, 3);
            assert.equal(stripe.subscriptionUpdates, 0); assert.equal(stripe.expireCalls, 0); assert.equal(stripe.createCalls, 0);
            assert.equal(emails, 3);
            assert.equal(await db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).countDocuments({ state: 'applied' }), 3);
        });
        await t.test('a changed customer generation fences a scheduled notice before any Stripe mutation', async () => {
            const { runtime, stripe, user } = await reset(false);
            await db.collection<{ _id: string; state: string; plans: unknown[] }>('billing_catalog_bundles').insertOne({ _id: 'generation', state: 'published', plans: [{ plan: { key: 'standard' }, usageTariffs: rolloutTariffs('generation'), catalogVersion: 'generation:standard' }] });
            await scheduleCatalogUsageRollouts(undefined, 'generation', runtime, 'generation:1');
            await db.collection<User>('users').updateOne({ _id: user._id }, { $set: { stripeCustomerGeneration: 1 } });
            await processUsagePriceRollouts({ ...runtime, sendEmail: async () => { throw new Error('Unexpected notice'); } });
            assert.equal((await db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).findOne({ authSubject: 'owner' }))!.state, 'needs_review');
            assert.equal(stripe.subscriptionUpdates, 0); assert.equal(stripe.createCalls, 0);
        });
    } finally {
        try { await db.dropDatabase(); } finally { await client.close(); }
    }
});
