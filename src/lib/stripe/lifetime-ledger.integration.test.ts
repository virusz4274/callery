import { reserveLegacyCostFixture } from './legacy-test-support';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import type { User } from '@/lib/db/types';
import { fixtureUsageTariffs, userFixture } from './test-support';
import { quoteUsageQuantity } from './usage-tariff';
import { archiveUsageTariffFixture } from './usage-test-support';
import { creditBaseFunds, creditPrepaidFunds, getBillingAccount, ledgerKey, mutateBillingAccount, putStoragePeak, reconcileUsageInvoiceRounding, settleTranscription } from './ledger';
import { drainLedgerOutbox } from './usage';
import { BILLING_CATALOG } from './catalog';
import { BillingSyncPendingError } from './billing-errors';

test('standalone Lifetime accounting retains monetary precision, funding provenance and conversion peaks', { skip: !process.env.VOSIFT_TEST_MONGODB_URI }, async t => {
    const client = new MongoClient(process.env.VOSIFT_TEST_MONGODB_URI!, { serverSelectionTimeoutMS: 15_000 });
    const db = client.db(`vt_lifeledger_${randomUUID().replaceAll('-', '').slice(0, 20)}`);
    const previous = process.env.MANAGED_COST_POLICY_JSON;
    const policy = { version: 'isolated-lifetime-ledger', reviewedAt: '2026-01-01', expiresAt: '2099-01-01', paymentFeeBasisPoints: 0, paymentFixedMicros: 0,
        minimumTopupMicros: 5_000_000, recoveryReserveMicros: 1, lifetimeHostingReserveMicros: 1, infrastructureMicrosPerAudioMinute: 100, infrastructureMicrosPerGiB: 100,
        aiBundleMicrosPerAudioMinute: 100, aiBundleFixedMicros: 100, storageCostMicrosPerGiBMonth: 20_000, storageOperationsMicrosPerGiBMonth: 1000,
        providers: { soniox: { costMicrosPerAudioMinute: 1000, fixedMicros: 0 }, gemini: { costMicrosPerAudioMinute: 1000, fixedMicros: 0 }, elevenlabs: { costMicrosPerAudioMinute: 1000, fixedMicros: 0 } }, ai: {},
        exports: { fixedMicros: 1, perGiBMicros: 1, maximumSourceBytes: 1000, recoveryReserveMicros: 1 },
        lifetimeUsage: { audioOverheadMicrosPerMinute: 10, recordingOverheadMicros: 10, storageOverheadMicrosPerGiBMonth: 100 } };
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify(policy);
    try {
        await client.connect(); const now = new Date();
        const tariffs = fixtureUsageTariffs('lifetime', { storage: 'price_life_storage', transcription: 'price_life_audio' }, BILLING_CATALOG.version, { storage: '0.002154123456', transcription: '0.0103' });
        const recurring = fixtureUsageTariffs('recurring', { storage: 'price_recurring_storage', transcription: 'price_recurring_audio' });
        await archiveUsageTariffFixture(db, tariffs); await archiveUsageTariffFixture(db, recurring);
        const user = userFixture({ storageUsed: 0, storageAllocation: 0, transcriptionUsed: 0, transcriptionAllocation: 0, stripeCurrentPeriodStart: now,
            stripeSubscriptionId: 'sub_life', billingEntitlement: { source: 'lifetime', grantedAt: now }, billingUsageTariffs: tariffs,
            stripeMetering: { subscriptionId: 'sub_life', storagePriceId: 'price_life_storage', transcriptionPriceId: 'price_life_audio', verifiedAt: now } });
        await db.collection<User>('users').insertOne(user);
        await creditBaseFunds('owner', { id: 'life', amountMicros: 250_000_000, reference: 'in_life', kind: 'lifetime', processorFeeMicros: 0 }, db);
        await creditPrepaidFunds('owner', { id: 'wallet', amountMicros: 50_000, source: 'stripe', reference: 'grant_wallet', processorFeeMicros: 0 }, db);
        await t.test('concurrent reservations cannot overspend sub-cent wallet holds', async () => {
            const results = await Promise.allSettled(Array.from({ length: 10 }, (_, n) => reserveLegacyCostFixture('owner', { id: `hold:${n}`, retailMicros: 103,
                maximumCostMicros: 100, usageTier: 'lifetime', kind: 'transcription', expiresAt: now }, db)));
            assert.equal(results.filter(row => row.status === 'fulfilled').length, 5);
            const stored = await db.collection<User>('users').findOne({ authSubject: 'owner' });
            assert.equal(getBillingAccount(stored!).prepaidReservedMicros, 50_000);
        });
        await t.test('replayed completion and finalized zero-cent line consume provider cost once', async () => {
            const current = await db.collection<User>('users').findOne({ authSubject: 'owner' });
            const reservationId = Object.values(getBillingAccount(current!).reservations).find(row => row.state === 'reserved')!.id;
            const input = { id: reservationId, consumedSeconds: 15, allowanceSeconds: 0, acceptedAt: now, customerId: 'cus_owner', subscriptionId: 'sub_life',
                reservationId, actualCostMicros: 100, usageTier: 'lifetime' as const, tariff: tariffs.transcription, meterPriceId: 'price_life_audio' };
            await mutateBillingAccount('owner', (account, latest) => settleTranscription(account, latest, input), db);
            await mutateBillingAccount('owner', (account, latest) => settleTranscription(account, latest, input), db);
            assert.equal(await drainLedgerOutbox('owner', db), 1);
            const event = await db.collection('usage_events').findOne({ authSubject: 'owner', type: 'transcription' });
            assert.equal(event!.value, 1); assert.equal(event!.eventName, BILLING_CATALOG.lifetime.meters.transcription.eventName); assert.equal(event!.tariff.unitPriceAtoms, tariffs.transcription.unitPriceAtoms);
            await mutateBillingAccount('owner', async account => {
                const period = account.periods[account.currentPeriodId!];
                await reconcileUsageInvoiceRounding(account, { type: 'transcription', meterPriceId: 'price_life_audio', usageTier: 'lifetime',
                    periodStart: period.start.getTime() / 1000, periodEnd: period.end.getTime() / 1000, exactAtoms: quoteUsageQuantity(tariffs.transcription, 1).exactAtoms, principalMinor: 0, subject: 'owner', db });
            }, db);
            const stored = await db.collection<User>('users').findOne({ authSubject: 'owner' }), account = getBillingAccount(stored!);
            assert.equal(account.prepaidSpentMicros, 0); assert.equal(account.costReview, undefined);
            assert.equal(account.fundingLots[ledgerKey('life')].costMicros, 100);
        });
        await t.test('monthly-to-Lifetime storage carries earned peak without replaying it at the new price', async () => {
            const GiB = 1073741824;
            await creditPrepaidFunds('owner', { id: 'wallet-more', amountMicros: 1_000_000, source: 'stripe', reference: 'grant_more', processorFeeMicros: 0 }, db);
            await db.collection<User>('users').updateOne({ authSubject: 'owner' }, { $set: { billingEntitlement: { source: 'subscription', grantedAt: now }, storageAllocation: GiB, billingUsageTariffs: recurring,
                'stripeMetering.storagePriceId': 'price_recurring_storage', 'stripeMetering.transcriptionPriceId': 'price_recurring_audio' } });
            await assert.rejects(mutateBillingAccount('owner', (account, latest) => putStoragePeak(account, latest, 2 * GiB, now), db), BillingSyncPendingError);
            const paidThrough = new Date(now); paidThrough.setUTCMonth(paidThrough.getUTCMonth() + 1);
            await db.collection<User>('users').updateOne({ authSubject: 'owner' }, { $set: {
                stripePriceId: 'price_recurring_base', billingPaidBasePeriod: {
                    customerId: user.stripeCustomerId!, customerGeneration: user.stripeCustomerGeneration || 0,
                    subscriptionId: user.stripeSubscriptionId!, basePriceId: 'price_recurring_base',
                    start: now, end: paidThrough, invoiceId: 'in_isolated_recurring_base_paid',
                },
            } });
            await mutateBillingAccount('owner', (account, latest) => putStoragePeak(account, latest, 2 * GiB, now), db);
            await db.collection<User>('users').updateOne({ authSubject: 'owner' }, { $set: { billingEntitlement: { source: 'lifetime', grantedAt: now }, storageAllocation: 0, billingUsageTariffs: tariffs,
                'stripeMetering.storagePriceId': 'price_life_storage', 'stripeMetering.transcriptionPriceId': 'price_life_audio' } });
            await mutateBillingAccount('owner', (account, latest) => putStoragePeak(account, latest, 2 * GiB, now), db);
            const stored = await db.collection<User>('users').findOne({ authSubject: 'owner' }), account = getBillingAccount(stored!), period = account.periods[account.currentPeriodId!];
            assert.equal(period.storageChargedMicros, 200_000 + quoteUsageQuantity(tariffs.storage, 1000).floorMicros);
            assert.equal(Object.values(account.outbox).filter(row => row.type === 'storage').length, 2);
        });
    } finally {
        try { await db.dropDatabase(); } finally { await client.close(); }
        if (previous === undefined) delete process.env.MANAGED_COST_POLICY_JSON; else process.env.MANAGED_COST_POLICY_JSON = previous;
    }
});
