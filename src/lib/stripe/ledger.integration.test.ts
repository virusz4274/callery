import { reserveLegacyCostFixture } from './legacy-test-support';
import { testProcessingCostEvidence } from './processing-test-support';
import { archiveUsageTariffFixture } from './usage-test-support';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { userFixture } from './test-support';
import { BILLING_CATALOG } from './catalog';
import { creditBaseFunds, creditPrepaidFunds, getBillingAccount, ledgerKey, mutateBillingAccount, putStoragePeak, releasePrepaidReservation, settleTranscription } from './ledger';
import { drainLedgerOutbox } from './usage';
import { enqueueUsageEvent, flushUsageEvents, type UsageEvent } from './usage-queue';
import { createTranscriptionReceipt, settleFailedTranscription, settleCanonicalTranscription } from './transcription-receipt';
import { incrementTranscriptionUsed } from '@/lib/db/users/usage';

// Opt-in: direct client, isolated random database, no application Mongo cache or saved env mutation.
test('standalone Mongo ledger CAS, crash recovery, canonical replay and meter uncertainty', { skip: !process.env.VOSIFT_TEST_MONGODB_URI }, async t => {
    const client = new MongoClient(process.env.VOSIFT_TEST_MONGODB_URI!, { serverSelectionTimeoutMS: 15_000 });
    const db = client.db(`vt_ledger_${randomUUID().replaceAll('-', '').slice(0, 20)}`);
    const previousPolicy = process.env.MANAGED_COST_POLICY_JSON, previousBilling = process.env.NEXT_PUBLIC_ENABLE_BILLING;
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    process.env.MANAGED_COST_POLICY_JSON = JSON.stringify({ version: 'isolated-test', reviewedAt: '2026-01-01', expiresAt: '2099-01-01', paymentFeeBasisPoints: 0, paymentFixedMicros: 0,
        minimumTopupMicros: 5_000_000, recoveryReserveMicros: 1, lifetimeHostingReserveMicros: 1, infrastructureMicrosPerAudioMinute: 100, infrastructureMicrosPerGiB: 100, aiBundleMicrosPerAudioMinute: 100, aiBundleFixedMicros: 100,
        storageCostMicrosPerGiBMonth: 20_000, storageOperationsMicrosPerGiBMonth: 1000, providers: { soniox: { costMicrosPerAudioMinute: 1000, fixedMicros: 0 }, gemini: { costMicrosPerAudioMinute: 1000, fixedMicros: 0 }, elevenlabs: { costMicrosPerAudioMinute: 1000, fixedMicros: 0 } }, ...testProcessingCostEvidence(300), operatorFunding: { trialLifetimeMicros: 500, grantLifetimeMicros: 500, calendarMonthMicros: 10_000 },
        exports: { fixedMicros: 10, perGiBMicros: 100, maximumSourceBytes: 1000, recoveryReserveMicros: 1_000_000 } });
    try {
        await client.connect();
        const now = new Date(), user = userFixture({ storageUsed: 0, storageAllocation: 0, transcriptionUsed: 0, stripeCurrentPeriodStart: now,
            stripeSubscriptionId: 'sub_fixture', billingSettings: { allowOverage: true }, stripeMetering: { subscriptionId: 'sub_fixture', storagePriceId: 'price_storage', transcriptionPriceId: 'price_transcription', verifiedAt: now } });
        await db.collection('users').insertOne(user);
        await archiveUsageTariffFixture(db, user.billingUsageTariffs!);
        await creditBaseFunds('owner', { id: 'base', amountMicros: 10_000_000, kind: 'base', reference: 'in_fixture' }, db);
        await creditPrepaidFunds('owner', { id: 'grant', amountMicros: 50_000, reference: 'grant_fixture', source: 'stripe' }, db);
        await t.test('included work uses full verified principal with no prepaid customer wallet', async () => {
            const subject = 'included-owner', included = userFixture({ authSubject: subject, storageUsed: 0, transcriptionUsed: 0,
                stripeCurrentPeriodStart: now, stripeSubscriptionId: 'sub_included', billingEntitlement: { source: 'subscription', grantedAt: now },
                stripeMetering: { subscriptionId: 'sub_included', storagePriceId: 'price_storage', transcriptionPriceId: 'price_transcription', verifiedAt: now } });
            await db.collection('users').insertOne(included);
            await creditBaseFunds(subject, { id: 'included-base', amountMicros: 10_000_000, kind: 'base', reference: 'in_included' }, db);
            await reserveLegacyCostFixture(subject, { id: 'included-audio', retailMicros: 0, maximumCostMicros: 6_000_000, kind: 'transcription', expiresAt: now }, db);
            await mutateBillingAccount(subject, (account, latest) => settleTranscription(account, latest, { id: 'included-audio', consumedSeconds: 60,
                allowanceSeconds: 3600, acceptedAt: now, customerId: 'cus_included', subscriptionId: 'sub_included', reservationId: 'included-audio', actualCostMicros: 5_500_000 }), db);
            const account = getBillingAccount((await db.collection('users').findOne({ authSubject: subject })) as never);
            assert.equal(account.prepaidFundedMicros, 0); assert.equal(account.prepaidSpentMicros, 0); assert.equal(account.prepaidReservedMicros, 0);
            assert.equal(account.fundingLots[ledgerKey('included-base')].costMicros, 5_500_000);
            assert.equal(account.receipts[ledgerKey('included-audio')].meterQuantity, 0);
            assert.equal(Object.keys(account.outbox).length, 0); assert.equal(account.costReview, undefined);
            const competing = await Promise.allSettled(['one', 'two'].map(id => reserveLegacyCostFixture(subject, {
                id: `included-followup:${id}`, retailMicros: 0, maximumCostMicros: 3_000_000, kind: 'transcription', expiresAt: now,
            }, db)));
            assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1);
            assert.equal(getBillingAccount((await db.collection('users').findOne({ authSubject: subject })) as never).reservedCostMicros, 3_000_000);
        });
        await t.test('contending workers reserve a finite balance exactly once', async () => {
            const results = await Promise.allSettled(Array.from({ length: 10 }, (_, n) => reserveLegacyCostFixture('owner', {
                id: `hold:${n}`, retailMicros: 10_000, maximumCostMicros: 100, kind: 'fixture', expiresAt: now,
            }, db)));
            assert.equal(results.filter(row => row.status === 'fulfilled').length, 5);
            const account = getBillingAccount((await db.collection('users').findOne({ authSubject: 'owner' })) as never);
            assert.equal(account.prepaidReservedMicros, 50_000);
            for (const reservation of Object.values(account.reservations)) await releasePrepaidReservation('owner', reservation.id, db);
        });
        await t.test('successful audio settled by callback then manual retry emits and charges once', async () => {
            const id = 'transcription-v2:owner:recording:attempt';
            await reserveLegacyCostFixture('owner', { id, retailMicros: 10_000, maximumCostMicros: 100, kind: 'transcription', expiresAt: now }, db);
            const input = { id, consumedSeconds: 15, allowanceSeconds: 0, acceptedAt: now, customerId: 'cus_owner', subscriptionId: 'sub_fixture', reservationId: id, actualCostMicros: 100 };
            await mutateBillingAccount('owner', (account, latest) => settleTranscription(account, latest, input), db);
            await mutateBillingAccount('owner', (account, latest) => settleTranscription(account, latest, input), db);
            await incrementTranscriptionUsed('owner', 15, id, db, now);
            const stored = await db.collection('users').findOne({ authSubject: 'owner' }), account = getBillingAccount(stored as never);
            assert.equal(account.prepaidSpentMicros, 10_000); assert.equal(stored!.transcriptionUsed, 15);
            assert.equal(account.receipts[ledgerKey(id)].meterBlocks, 4);
            assert.equal(Object.values(account.outbox).filter(row => row.type === 'transcription').length, 1);
        });
        await t.test('retained storage baseline and outbox survive commit-before-worker crash', async () => {
            await creditPrepaidFunds('owner', { id: 'more', amountMicros: 1_000_000, reference: 'grant_more', source: 'stripe' }, db);
            await mutateBillingAccount('owner', (account, latest) => putStoragePeak(account, latest, 1073741824, now), db);
            let account = getBillingAccount((await db.collection('users').findOne({ authSubject: 'owner' })) as never);
            assert.equal(Object.values(account.outbox).filter(row => row.type === 'storage').length, 1);
            assert.equal(await drainLedgerOutbox('owner', db), 2);
            account = getBillingAccount((await db.collection('users').findOne({ authSubject: 'owner' })) as never);
            assert.equal(Object.keys(account.outbox).length, 0);
            assert.equal(await db.collection('usage_events').countDocuments({ authSubject: 'owner', type: 'storage' }), 1);
        });
        await t.test('bounded hot history archives before pruning and old enrichment retains its funded parent', async () => {
            const old = new Date(Date.now() - 2 * 3600_000);
            await mutateBillingAccount('owner', account => {
                for (let n = 0; n < 1001; n++) {
                    const id = `archived:${n}`; account.receipts[ledgerKey(id)] = { id, consumedSeconds: 15, meterBlocks: 4, chargedMicros: 10_000, acceptedAt: old, periodId: account.currentPeriodId!, committedCostMicros: 100 };
                }
            }, db);
            await mutateBillingAccount('owner', () => undefined, db);
            assert.equal(await db.collection('billing_usage_receipts').countDocuments({ authSubject: 'owner' }), 250);
            const reservation = await reserveLegacyCostFixture('owner', { id: 'old-enrichment', parentId: 'archived:0', retailMicros: 0, maximumCostMicros: 100, kind: 'enrichment', expiresAt: now }, db);
            assert.equal(reservation.usageCostBudgetMicros, 100);
            await releasePrepaidReservation('owner', 'old-enrichment', db);
        });
        await t.test('trial failures preserve one-time quota without any hidden monetary spending cap', async () => {
            const trial = userFixture({ authSubject: 'trial-owner', storageUsed: 0, transcriptionUsed: 0, trialEndsAt: new Date('2099-01-01'),
                billingEntitlement: { source: 'trial', grantedAt: now } });
            await db.collection('users').insertOne(trial);
            const receipt = await createTranscriptionReceipt(trial, 'trial-recording', 'attempt-1', 'soniox', 'stt-async-v5', 15, 1024, db);
            assert.equal(receipt.operatorReservationId, undefined); assert.ok(receipt.executionPolicy); assert.equal(receipt.billing, null);
            assert.equal(await db.collection('billing_provider_attempts').countDocuments({ authSubject: 'trial-owner' }), 1);
            await settleFailedTranscription('trial-owner', receipt, db);
            await settleFailedTranscription('trial-owner', receipt, db);
            const next = await createTranscriptionReceipt(trial, 'other-recording', 'attempt-2', 'soniox', 'stt-async-v5', 15, 1024, db);
            assert.equal(await db.collection('billing_provider_attempts').countDocuments({ authSubject: 'trial-owner' }), 2);
            await settleCanonicalTranscription('trial-owner', next, db);
            await settleCanonicalTranscription('trial-owner', next, db);
            const stored = await db.collection('users').findOne({ authSubject: 'trial-owner' });
            const account = getBillingAccount(stored as never);
            assert.equal(stored!.transcriptionUsed, 15); assert.deepEqual(account.periods, {});
            assert.equal(account.reservedCostMicros, 0); assert.equal(account.recognizedCostMicros, 0);
            assert.equal(account.prepaidSpentMicros, 0);
        });
        await t.test('uncertain retries and expired timestamps are held without sending', async () => {
            await db.collection('usage_events').deleteMany({});
            for (const [id, timestamp] of [['uncertain', Math.floor(Date.now() / 1000)], ['expired', Math.floor(Date.now() / 1000) - 36 * 86400]] as const) {
                await enqueueUsageEvent({ _id: id, authSubject: 'owner', customerId: 'cus_owner', type: 'transcription', value: 4, timestamp, catalogVersion: BILLING_CATALOG.version, tariff: user.billingUsageTariffs!.transcription }, db);
            }
            await db.collection<UsageEvent>('usage_events').updateOne({ _id: 'uncertain' }, { $set: { firstAttemptAt: new Date(Date.now() - 24 * 3600_000) } });
            let sends = 0;
            assert.deepEqual(await flushUsageEvents(10, { db, send: async () => { sends++; } }), { sent: 0, failed: 2 });
            assert.equal(sends, 0);
            assert.equal(await db.collection<UsageEvent>('usage_events').countDocuments({ state: 'needs_review' }), 2);
        });
    } finally {
        try { await db.dropDatabase(); } finally { await client.close(); }
        if (previousPolicy === undefined) delete process.env.MANAGED_COST_POLICY_JSON; else process.env.MANAGED_COST_POLICY_JSON = previousPolicy;
        if (previousBilling === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = previousBilling;
    }
});
