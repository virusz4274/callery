import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { creditBaseFunds, creditPrepaidFunds, ensurePeriod, getBillingAccount, getPrepaidState, ledgerKey, mutateBillingAccount, putStoragePeak,
    releasePrepaidReservation, reservePrepaidUsage, reserveRetailUsage, settleIncludedTranscription, settleTranscription } from './ledger';
import { userFixture } from './test-support';
import type { User } from '@/lib/db/types';
import { BillingSyncPendingError } from './billing-errors';

// Opt-in, random disposable database only. No application environment file writes.
test('retail-only Mongo accounting works without provider-cost configuration', { skip: !process.env.VOSIFT_TEST_MONGODB_URI }, async t => {
    const client = new MongoClient(process.env.VOSIFT_TEST_MONGODB_URI!, { serverSelectionTimeoutMS: 15_000 });
    const db = client.db(`vt_retail_${randomUUID().replaceAll('-', '').slice(0, 12)}`);
    const previous = process.env.MANAGED_COST_POLICY_JSON;
    delete process.env.MANAGED_COST_POLICY_JSON;
    try {
        await client.connect();
        const at = new Date('2026-10-20'), user = userFixture({ storageUsed: 0, storageAllocation: 0, transcriptionUsed: 0,
            stripeCurrentPeriodStart: new Date('2026-10-01'), billingEntitlement: { source: 'subscription', grantedAt: at },
            stripeSubscriptionId: 'sub_owner', billingSettings: { allowOverage: true },
            stripeMetering: { subscriptionId: 'sub_owner', storagePriceId: 'price_storage', transcriptionPriceId: 'price_transcription', verifiedAt: at },
        });
        await db.collection<User>('users').insertOne(user);
        const stored = async () => (await db.collection<User>('users').findOne({ authSubject: 'owner' }))!;
        await t.test('an unpaid renewal cannot persist a new period or storage baseline and later paid proof opens it once', async () => {
            const subject = 'renewal', next = userFixture({ authSubject: subject, storageUsed: 0, storageAllocation: 1073741824, transcriptionUsed: 0,
                stripeSubscriptionId: 'sub_renewal', stripeSubscriptionStatus: 'active', stripePriceId: 'price_base',
                stripeMetering: { subscriptionId: 'sub_renewal', storagePriceId: 'price_storage', transcriptionPriceId: 'price_transcription', verifiedAt: at },
                stripeCurrentPeriodStart: new Date('2026-10-01'), billingEntitlement: { source: 'subscription', grantedAt: at },
                billingPaidBasePeriod: { customerId: 'cus_owner', customerGeneration: 0, subscriptionId: 'sub_renewal', basePriceId: 'price_base',
                    start: new Date('2026-10-01'), end: new Date('2026-11-01'), invoiceId: 'in_paid_october' } });
            await db.collection<User>('users').insertOne(next);
            await mutateBillingAccount(subject, (account, latest) => putStoragePeak(account, latest, 0, at), db);
            await assert.rejects(mutateBillingAccount(subject, (account, latest) => putStoragePeak(account, latest, 0, new Date('2026-11-01')), db), BillingSyncPendingError);
            let latest = (await db.collection<User>('users').findOne({ authSubject: subject }))!;
            assert.equal(Object.keys(latest.billingAccount!.periods).length, 1); assert.equal(latest.billingRecovery, undefined);
            await db.collection<User>('users').updateOne({ _id: next._id }, { $set: { billingPaidBasePeriod: { ...next.billingPaidBasePeriod!,
                start: new Date('2026-11-01'), end: new Date('2026-12-01'), invoiceId: 'in_paid_november' } } });
            for (let n = 0; n < 2; n++) await mutateBillingAccount(subject, (account, current) => putStoragePeak(account, current, 0, new Date('2026-11-01')), db);
            latest = (await db.collection<User>('users').findOne({ authSubject: subject }))!;
            assert.equal(Object.keys(latest.billingAccount!.periods).length, 2);
            assert.equal(ensurePeriod(getBillingAccount(latest), latest, new Date('2026-11-01')).consumedSeconds, 0);
        });
        await t.test('included audio settles without customer wallet or retained provider funding', async () => {
            await reservePrepaidUsage('owner', { id: 'included', consumedSeconds: 60, includedSeconds: 60, meterQuantity: 0, retailMicros: 0, kind: 'transcription', expiresAt: at }, db);
            for (let n = 0; n < 3; n++) await mutateBillingAccount('owner', (account, latest) => settleTranscription(account, latest, {
                id: 'included', reservationId: 'included', consumedSeconds: 60, allowanceSeconds: 3600, acceptedAt: at,
                customerId: 'cus_owner', subscriptionId: 'sub_owner',
            }), db);
            const latest = await stored(), account = getBillingAccount(latest);
            assert.equal(latest.transcriptionUsed, 60); assert.deepEqual(account.fundingLots, {});
            assert.equal(account.prepaidSpentMicros, 0); assert.equal(account.reservedCostMicros, 0); assert.equal(account.recognizedCostMicros, 0);
            assert.equal(account.receipts[ledgerKey('included')].meterQuantity, 0);
        });
        await t.test('funding is idempotent and retail contention cannot reserve the same funds twice', async () => {
            await creditBaseFunds('owner', { id: 'base', kind: 'base', amountMicros: 10_000_000, reference: 'in_base' }, db);
            for (let n = 0; n < 2; n++) await creditPrepaidFunds('owner', { id: 'deposit', amountMicros: 50_000, source: 'stripe', reference: 'grant_deposit' }, db);
            const outcomes = await Promise.allSettled(Array.from({ length: 10 }, (_, n) => reservePrepaidUsage('owner', {
                id: `retail:${n}`, retailMicros: 10_000, kind: 'transcription', expiresAt: at,
            }, db)));
            assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 5);
            const latest = await stored();
            assert.equal(getPrepaidState(latest).availableMicros, 0); assert.equal(latest.billingAccount?.prepaidFundedMicros, 50_000);
            assert.equal(latest.billingAccount?.reservedCostMicros, 0);
            for (const reservation of Object.values(latest.billingAccount!.reservations)) await releasePrepaidReservation('owner', reservation.id, db);
            assert.equal(getPrepaidState(await stored()).availableMicros, 50_000);
        });
        await t.test('storage baseline, peak and one outbox persist together without expense holds', async () => {
            await creditPrepaidFunds('owner', { id: 'storage-deposit', amountMicros: 1_000_000, source: 'stripe', reference: 'grant_storage' }, db);
            for (const bytes of [1073741824, 1073741824, 0]) await mutateBillingAccount('owner', (account, latest) => putStoragePeak(account, latest, bytes, at), db);
            const account = getBillingAccount(await stored()), period = account.periods[account.currentPeriodId!];
            assert.equal(period.storageChargedMicros, 200_000); assert.equal(period.chargeablePeakBytes, 1073741824);
            assert.equal(period.storageCostMicros, 0); assert.equal(account.reservedCostMicros, 0);
            assert.equal(Object.values(account.outbox).filter(row => row.type === 'storage').length, 1);
            assert.equal(await db.collection('billing_cost_schedules').countDocuments({}), 0);
        });
        await t.test('reverse completion preserves accepted allowance and a failed hold becomes available to future jobs', async () => {
            await mutateBillingAccount('owner', (account, latest) => {
                const period = account.periods[account.currentPeriodId!]; period.includedConsumedSeconds = 0;
                reserveRetailUsage(account, latest, { id: 'reserved-first', periodId: period.id, consumedSeconds: 60, includedSeconds: 60,
                    meterQuantity: 0, retailMicros: 0, kind: 'transcription', expiresAt: at });
                reserveRetailUsage(account, latest, { id: 'paid-second', periodId: period.id, consumedSeconds: 60, includedSeconds: 0,
                    meterQuantity: 4, retailMicros: 10_000, kind: 'transcription', expiresAt: at });
            }, db);
            const second = { id: 'paid-second', reservationId: 'paid-second', consumedSeconds: 60, allowanceSeconds: 60,
                acceptedAt: at, customerId: 'cus_owner', subscriptionId: 'sub_owner' };
            await mutateBillingAccount('owner', (account, latest) => settleTranscription(account, latest, second), db);
            await releasePrepaidReservation('owner', 'reserved-first', db);
            await mutateBillingAccount('owner', (account, latest) => {
                const period = account.periods[account.currentPeriodId!]; assert.equal(period.includedConsumedSeconds, 0);
                reserveRetailUsage(account, latest, { id: 'future', periodId: period.id, consumedSeconds: 60, includedSeconds: 60,
                    meterQuantity: 0, retailMicros: 0, kind: 'transcription', expiresAt: at });
                settleTranscription(account, latest, { ...second, id: 'future', reservationId: 'future' });
            }, db);
            const account = getBillingAccount(await stored()), period = account.periods[account.currentPeriodId!];
            assert.equal(account.receipts[ledgerKey('paid-second')].chargedMicros, 10_000);
            assert.equal(account.receipts[ledgerKey('future')].chargedMicros, 0); assert.equal(period.includedConsumedSeconds, 60);
            assert.equal(account.prepaidSpentMicros, 210_000); assert.equal(account.prepaidReservedMicros, 0);
        });
        await t.test('concurrent one-time trial completion commits its cumulative allowance exactly once', async () => {
            const trial = userFixture({ authSubject: 'trial', planKey: 'free-trial', transcriptionUsed: 45,
                trialEndsAt: new Date('2026-10-25'), billingEntitlement: { source: 'trial', grantedAt: new Date('2026-09-25') } });
            await db.collection<User>('users').insertOne(trial);
            await mutateBillingAccount('trial', (account, latest) => reserveRetailUsage(account, latest, { id: 'trial-audio', consumedSeconds: 15, includedSeconds: 15, meterQuantity: 0,
                retailMicros: 0, kind: 'transcription', expiresAt: at }), db);
            const input = { id: 'trial-audio', reservationId: 'trial-audio', consumedSeconds: 15, acceptedAt: at };
            await Promise.all(Array.from({ length: 5 }, () => mutateBillingAccount('trial', (account, latest) => settleIncludedTranscription(account, latest, input), db)));
            const latest = (await db.collection<User>('users').findOne({ authSubject: 'trial' }))!;
            assert.equal(latest.transcriptionUsed, 60); assert.deepEqual(latest.billingAccount?.periods, {});
            assert.deepEqual(latest.billingAccount?.outbox, {}); assert.equal(latest.trialEndsAt?.toISOString(), '2026-10-25T00:00:00.000Z');
        });
    } finally {
        if (previous === undefined) delete process.env.MANAGED_COST_POLICY_JSON; else process.env.MANAGED_COST_POLICY_JSON = previous;
        await db.dropDatabase().catch(() => undefined); await client.close();
    }
});
