import test from 'node:test';
import assert from 'node:assert/strict';
import { getBillingAccount, ledgerKey } from './ledger';
import { refundableBaseMicros, redeemPlanCredit, reservePlanCredit, settlePlanCredit } from './plan-credit-economics';
import { MemoryBillingDatabase, userFixture } from './test-support';

function accountFixture() {
    const account = getBillingAccount({});
    account.fundingLots.base = { id: 'base', reference: 'in_original', source: 'stripe', kind: 'base', amountMicros: 10_000_000,
        creditedMicros: 0, costMicros: 1_500_000, reservedCostMicros: 500_000, protectedOperatingCostMicros: 200_000,
        processorFeeMicros: 0, createdAt: new Date() };
    account.recognizedRevenueMicros = 10_000_000;
    account.recognizedCostMicros = 1_500_000;
    account.reservedCostMicros = 500_000;
    account.usageFunding = { recurring: { revenueMicros: 0, costMicros: 0, reservedCostMicros: 0 },
        lifetime: { revenueMicros: 0, costMicros: 0, reservedCostMicros: 0 } };
    return account;
}

test('accepted legacy principal retains its original $2 expense commitment', () => {
    const account = accountFixture();
    assert.equal(refundableBaseMicros(account), 8_000_000);
    assert.equal(account.fundingLots.base.protectedOperatingCostMicros, 200_000,
        'Protected obligations are already part of the reserved $0.50 and are not subtracted twice');
});

test('accepted legacy credits preserve fractional principal and expense exhaustion', () => {
    const account = accountFixture();
    account.fundingLots.base.creditedMicros = 1_000_001;
    assert.equal(refundableBaseMicros(account), 6_999_999);
    account.fundingLots.base.costMicros = 9_000_000;
    account.recognizedCostMicros = 9_000_000;
    assert.equal(refundableBaseMicros(account), 0);
});

test('unattributed costs and explicit financial review cannot release base principal', () => {
    const account = accountFixture();
    account.recognizedCostMicros++;
    assert.equal(refundableBaseMicros(account), 0);
    account.recognizedCostMicros--;
    account.reservedCostMicros++;
    assert.equal(refundableBaseMicros(account), 0);
    account.reservedCostMicros--;
    account.costReview = { reason: 'unknown_provider_response', evidenceId: 'unknown', at: new Date() };
    assert.equal(refundableBaseMicros(account), 0);
});

test('missing or malformed cost totals cannot turn unknown cash obligations into credit', () => {
    const account = accountFixture();
    assert.equal(refundableBaseMicros({ fundingLots: account.fundingLots }), 0);
    account.fundingLots.base.costMicros = Number.NaN;
    assert.equal(refundableBaseMicros(account), 0);
    account.fundingLots.base.costMicros = 1_500_000;
    account.usageFunding!.recurring.revenueMicros = Number.NaN;
    assert.equal(refundableBaseMicros(account), 0);
});

test('unused prepaid credit is a liability and does not expand refundable base principal', () => {
    const account = accountFixture();
    account.fundingLots.prepaid = { id: 'prepaid', reference: 'cg_usage', source: 'stripe', kind: 'prepaid', amountMicros: 50_000_000,
        creditedMicros: 0, spentMicros: 0, costMicros: 0, reservedCostMicros: 0, processorFeeMicros: 0, createdAt: new Date() };
    account.prepaidFundedMicros = 50_000_000;
    assert.equal(refundableBaseMicros(account), 8_000_000);
});

test('the legacy accounting fallback retains actual global costs once', () => {
    const account = accountFixture();
    delete account.usageFunding;
    account.recognizedCostMicros = 2_000_000;
    assert.equal(refundableBaseMicros(account), 7_500_000);
});

test('incurred but unrecognized prepaid fees retain operating cash once without spending customer credit', () => {
    const account = accountFixture();
    account.fundingLots.prepaid = { id: 'prepaid', reference: 'cg_usage', source: 'stripe', kind: 'prepaid', amountMicros: 5_000_000,
        creditedMicros: 0, spentMicros: 1_000_000, costMicros: 100_000, reservedCostMicros: 0,
        processorFeeMicros: 300_000, processorFeeRecognizedMicros: 100_000, createdAt: new Date() };
    account.usageFunding!.recurring.costMicros = 100_000;
    account.recognizedCostMicros += 100_000;
    assert.equal(refundableBaseMicros(account), 7_700_000,
        'Recognized $0.10 and unrecognized $0.20 processor expenses consume cash exactly once');
    account.usageFunding!.recurring.revenueMicros = 300_000;
    assert.equal(refundableBaseMicros(account), 8_000_000,
        'Genuinely earned uncommitted revenue can fund all of that fee without an extra base holdback');
    assert.equal(account.fundingLots.prepaid.spentMicros, 1_000_000);
});

test('prepaid fee protection also applies before historical accounts have funding cohorts', () => {
    const account = accountFixture();
    delete account.usageFunding;
    account.fundingLots.prepaid = { id: 'prepaid', reference: 'cg_usage', source: 'stripe', kind: 'prepaid', amountMicros: 5_000_000,
        creditedMicros: 0, spentMicros: 0, costMicros: 0, reservedCostMicros: 0, processorFeeMicros: 300_000,
        processorFeeRecognizedMicros: 0, createdAt: new Date() };
    assert.equal(refundableBaseMicros(account), 7_700_000);
});

test('credit reservation, redemption and cancellation preserve original principal exactly once', async () => {
    const account = accountFixture(), database = new MemoryBillingDatabase(), db = database.asDb();
    database.collection('users').values.push(userFixture({ billingAccount: account }) as never);
    await reservePlanCredit('owner', 'switch', 800, db);
    await reservePlanCredit('owner', 'switch', 800, db);
    assert.equal(refundableBaseMicros(getBillingAccount(database.user())), 0);
    await assert.rejects(reservePlanCredit('owner', 'other', 1, db), /credit changed/);
    await redeemPlanCredit('owner', 'switch', 'in_new', 800, db);
    await redeemPlanCredit('owner', 'switch', 'in_new', 800, db);
    await settlePlanCredit('owner', 'switch', true, db);
    let current = getBillingAccount(database.user());
    assert.equal(current.fundingLots.base.creditedMicros, 0);
    assert.equal(current.recognizedRevenueMicros, 10_000_000);
    assert.equal(Object.keys(current.fundingLots).length, 1);
    assert.equal(current.planCreditReservations![ledgerKey('switch')].redeemedMicros, 8_000_000);
    await reservePlanCredit('owner', 'canceled', 800, db);
    await settlePlanCredit('owner', 'canceled', false, db);
    await settlePlanCredit('owner', 'canceled', false, db);
    current = getBillingAccount(database.user());
    assert.equal(current.fundingLots.base.creditedMicros, 0);
    assert.equal(refundableBaseMicros(current), 8_000_000);
});
