import { testProcessingCostEvidence } from './processing-test-support';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import type Stripe from 'stripe';
import type { User } from '@/lib/db/types';
import { createOrResumeCheckout } from './checkout';
import { applyOneTimeCheckoutPlan, reconcileLifetimeUsage } from './lifetime';
import { billingFence, withBillingLease, BillingBusyError } from './billing-lock';
import { claimWebhookEvent, finishWebhookEvent } from './webhook-events';
import { userFixture, planFixture, FakeBillingStripe, MemoryBillingDatabase, seedPublishedCatalogFixture } from './test-support';

// Actual standalone MongoDB proves the compare-and-set filters and aggregation updates.
// The provider boundary stays fake: no real Stripe objects, customers or charges are created.
test('billing concurrency and crash recovery on standalone MongoDB', { skip: !process.env.VOSIFT_TEST_MONGODB_URI }, async t => {
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify({ version: 'integration-fixture', reviewedAt: '2020-01-01', expiresAt: '2099-01-01',
        paymentFeeBasisPoints: 0, paymentFixedMicros: 0, stripeBillingFeeBasisPoints: 0, stripeBillingFixedMicros: 0, minimumTopupMicros: 5_000_000, infrastructureMicrosPerAudioMinute: 0, infrastructureMicrosPerGiB: 0,
        aiBundleMicrosPerAudioMinute: 0, aiBundleFixedMicros: 0, storageCostMicrosPerGiBMonth: 100, storageOperationsMicrosPerGiBMonth: 0,
        recoveryReserveMicros: 1, lifetimeHostingReserveMicros: 1, lifetimeUsage: { audioOverheadMicrosPerMinute: 0, recordingOverheadMicros: 0, storageOverheadMicrosPerGiBMonth: 0 },
        providers: { soniox: { costMicrosPerAudioMinute: 100, fixedMicros: 0 }, gemini: { costMicrosPerAudioMinute: 100, fixedMicros: 0 }, elevenlabs: { costMicrosPerAudioMinute: 100, fixedMicros: 0 } },
        ...testProcessingCostEvidence(), exports: { fixedMicros: 0, perGiBMicros: 0, maximumSourceBytes: 1_000_000, recoveryReserveMicros: 1 } });
    const client = await new MongoClient(process.env.VOSIFT_TEST_MONGODB_URI!).connect();
    const db = client.db(`vt_billing_${randomUUID().replaceAll('-', '').slice(0, 20)}`);
    const users = db.collection<User>('users');
    const urls = { success: 'https://app.example.test/success', cancel: 'https://app.example.test/cancel' };
    try {
        await users.createIndex({ authSubject: 1 }, { unique: true });
        const catalogFixture = new MemoryBillingDatabase();
        seedPublishedCatalogFixture(catalogFixture, [planFixture(), planFixture({ key: 'pro' }), planFixture({ key: 'lifetime', interval: 'lifetime', stripePriceId: 'price_lifetime' })], 'integration-fixture');
        for (const name of ['plans', 'billing_catalog_versions', 'billing_catalog_bundles', 'billing_catalog_state']) await db.collection(name).insertMany(catalogFixture.collection(name).values as never[]);
        await t.test('concurrent Checkout claims and response-loss recovery create a single remote session', async () => {
            await users.insertOne(userFixture());
            const stripe = new FakeBillingStripe();
            const deps = { db, stripe: stripe.asStripe() };
            const outcomes = await Promise.allSettled(Array.from({ length: 12 }, () => createOrResumeCheckout('owner', planFixture(), urls, deps)));
            const fulfilled = outcomes.filter(value => value.status === 'fulfilled');
            assert.ok(fulfilled.length >= 1);
            for (const value of fulfilled) assert.equal(value.value, 'https://checkout.stripe.test/cs_1');
            assert.equal(stripe.sessionCreates, 1);
            for (const value of outcomes) if (value.status === 'rejected') assert.ok(value.reason instanceof BillingBusyError);
            assert.equal(await createOrResumeCheckout('owner', planFixture(), urls, deps), 'https://checkout.stripe.test/cs_1');
            await users.deleteMany({});
            await users.insertOne(userFixture());
            const lost = new FakeBillingStripe(); lost.throwAfterSessionCreate = true;
            const lostDeps = { db, stripe: lost.asStripe() };
            await assert.rejects(createOrResumeCheckout('owner', planFixture(), urls, lostDeps), /Response lost/);
            await createOrResumeCheckout('owner', planFixture(), urls, lostDeps);
            assert.equal(lost.sessionCreates, 1);
        });
        await t.test('lifetime remote success survives lost response and preserves the monthly allowance window', async () => {
            await users.deleteMany({});
            await users.insertOne(userFixture());
            const stripe = new FakeBillingStripe(); stripe.throwAfterSubscriptionCreate = true;
            const deps = { db, stripe: stripe.asStripe() };
            await applyOneTimeCheckoutPlan(stripe.paidLifetime(), deps);
            assert.equal((await users.findOne({ authSubject: 'owner' }))?.lifetimeUsageSetup?.state, 'retrying');
            await reconcileLifetimeUsage('owner', deps);
            assert.equal(stripe.subscriptionCreates, 1);
            await users.updateOne({ authSubject: 'owner' }, { $set: { storageUsed: 10, storagePeakUsed: 300, transcriptionUsed: 100 } });
            stripe.subscriptionValues[0].status = 'canceled';
            await reconcileLifetimeUsage('owner', deps, { resume: true });
            let user = await users.findOne({ authSubject: 'owner' });
            assert.equal(user?.storagePeakUsed, 300);
            assert.equal(user?.transcriptionUsed, 100);
            assert.equal(user?.billingEntitlement?.source, 'lifetime');
            assert.ok(user?.stripeMetering);
            await users.updateOne({ authSubject: 'owner' }, { $set: { storagePeakUsed: 25, transcriptionUsed: 50 } });
            await reconcileLifetimeUsage('owner', deps);
            user = await users.findOne({ authSubject: 'owner' });
            assert.equal(user?.storagePeakUsed, 25);
            assert.equal(user?.transcriptionUsed, 50);
        });
        await t.test('stale billing and webhook lease owners cannot acknowledge or overwrite a replacement worker', async () => {
            let release!: () => void;
            let enter!: () => void;
            const wait = new Promise<void>(resolve => { release = resolve; });
            const entered = new Promise<void>(resolve => { enter = resolve; });
            const stale = withBillingLease(db, 'owner', async (user, owner) => {
                enter(); await wait;
                return users.updateOne(billingFence(user, owner), { $set: { planKey: 'stale' } });
            });
            await entered;
            await users.updateOne({ authSubject: 'owner' }, { $set: { 'stripeBillingLease.until': new Date(0) } });
            await withBillingLease(db, 'owner', async (user, owner) => { await users.updateOne(billingFence(user, owner), { $set: { planKey: 'replacement' } }); });
            release();
            assert.equal((await stale).matchedCount, 0);
            assert.equal((await users.findOne({ authSubject: 'owner' }))?.planKey, 'replacement');
            const event = { id: 'evt_one', type: 'invoice.paid', created: Math.floor(Date.now() / 1000) } as Stripe.Event;
            assert.equal(await claimWebhookEvent(db, event, 'old'), 'claimed');
            await db.collection('stripe_webhook_events').updateOne({ _id: event.id } as never, { $set: { updatedAt: new Date(0) } });
            assert.equal(await claimWebhookEvent(db, event, 'next'), 'claimed');
            assert.equal(await finishWebhookEvent(db, event.id, 'old'), false);
            assert.equal(await finishWebhookEvent(db, event.id, 'next'), true);
        });
    } finally { try { await db.dropDatabase(); } finally { await client.close(); } }
});
