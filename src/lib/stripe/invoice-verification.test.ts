import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { MemoryBillingDatabase, userFixture } from './test-support';
import { verifyUsageInvoice } from './invoice-verification';
import { usageTariffFixture, archiveUsageTariffFixture } from './usage-test-support';
import { accumulateUsageCharge, createUsageAmountAccumulator, usageRoundingReserve, type UsageTariffPair } from './usage-tariff';
import { getBillingAccount, ledgerKey } from './ledger';

async function fixture(definitions: { id: string; pair: UsageTariffPair; quantity: number; minor: number }[] = [
    { id: 'audio', pair: usageTariffFixture(), quantity: 4, minor: 1 },
]) {
    const memory = new MemoryBillingDatabase(), db = memory.asDb(), account = getBillingAccount({});
    account.prepaidFundedMicros = 1_000_000;
    account.fundingLots.paid = { id: 'paid', reference: 'grant', source: 'stripe', kind: 'prepaid', amountMicros: 1_000_000,
        spentMicros: 0, creditedMicros: 0, costMicros: 0, reservedCostMicros: 0, processorFeeMicros: 0, createdAt: new Date() };
    account.usageFunding = { recurring: { revenueMicros: 0, costMicros: 0, reservedCostMicros: 0 }, lifetime: { revenueMicros: 0, costMicros: 0, reservedCostMicros: 0 } };
    account.periods.period = { id: 'period', start: new Date(0), end: new Date(200_000), consumedSeconds: 0, storagePeakBytes: 0,
        chargeablePeakBytes: 0, storageCostMicros: 0, storageBilledMilliGiB: 0, storageChargedMicros: 0, usageAmounts: {} };
    account.currentPeriodId = 'period';
    for (const row of definitions) {
        await archiveUsageTariffFixture(db, row.pair);
        const tariff = row.pair.transcription, bucket = createUsageAmountAccumulator(tariff);
        const amount = accumulateUsageCharge(bucket, row.quantity);
        bucket.roundingReservedMicros = usageRoundingReserve(bucket);
        account.periods.period.usageAmounts![ledgerKey(`transcription:${tariff.priceId}`)] = bucket;
        account.prepaidSpentMicros += amount.debitMicros; account.fundingLots.paid.spentMicros! += amount.debitMicros;
        account.recognizedRevenueMicros += amount.debitMicros;
        account.usageFunding[tariff.usageTier].revenueMicros += amount.debitMicros;
        account.prepaidReservedMicros += bucket.roundingReservedMicros;
        memory.collection('usage_events').values.push({ _id: row.id, customerId: 'cus_owner', authSubject: 'owner', type: 'transcription', timestamp: 100,
            tariff, catalogVersion: tariff.catalogVersion, meterPriceId: tariff.priceId, value: row.quantity, reportedValue: row.quantity,
            pending: false, state: 'accepted', processingStatus: 'processed' });
    }
    memory.collection('users').values.push(userFixture({ billingAccount: account }) as unknown as Record<string, unknown>);
    const lines = definitions.map(row => ({ id: `il_${row.id}`, amount: row.minor, subtotal: row.minor, quantity: row.quantity,
        period: { start: 0, end: 200 }, pricing: { price_details: { price: row.pair.transcription.priceId } }, discount_amounts: [] }));
    const invoice = { id: 'in_usage', customer: 'cus_owner', status: 'paid', currency: 'usd', lines: { data: [{ id: 'il_base', amount: 1000, pricing: null }], has_more: true } };
    let debitOverride: number | undefined, pages = 0;
    const stripe = {
        invoices: { retrieve: async () => invoice, listLineItems: async () => { pages++; return { data: lines, has_more: false }; } },
        prices: { retrieve: async (id: string) => { const tariff = definitions.find(row => row.pair.transcription.priceId === id)!.pair.transcription;
            return { currency: 'usd', recurring: { meter: tariff.meterId }, billing_scheme: 'per_unit', unit_amount_decimal: tariff.unitAmountDecimal }; } },
        billing: { meters: { retrieve: async (id: string) => { const tariff = definitions.find(row => row.pair.transcription.meterId === id)!.pair.transcription;
            return { event_name: tariff.eventName, default_aggregation: { formula: tariff.aggregation } }; } },
        creditBalanceTransactions: { list: async function* () { for (const line of lines) yield { type: 'debit', debit: { type: 'credits_applied',
            amount: { monetary: { currency: 'usd', value: debitOverride ?? line.subtotal } }, credits_applied: { invoice: invoice.id, invoice_line_item: line.id } } }; } } },
    };
    return { memory, deps: { db, stripe: stripe as unknown as Stripe }, invoice, lines, setDebit: (value: number) => { debitOverride = value; }, pages: () => pages };
}
test('invoice proof requires processed usage, paginated exact quantities and matching applied credit debits', async () => {
    const f = await fixture(), row = f.memory.collection('usage_events').values[0];
    row.processingStatus = 'accepted';
    assert.equal(await verifyUsageInvoice('in_usage', f.deps), 0);
    row.processingStatus = 'processed';
    f.lines[0].quantity = 8; await assert.rejects(verifyUsageInvoice('in_usage', f.deps), /quantity/);
    f.lines[0].quantity = 4; f.setDebit(0); await assert.rejects(verifyUsageInvoice('in_usage', f.deps), /credit consumption/);
    f.setDebit(1); assert.equal(await verifyUsageInvoice('in_usage', f.deps), 1);
    assert.equal(row.invoiceId, 'in_usage'); assert.equal(row.state, 'billed');
    assert.ok(f.pages() >= 4);
    assert.equal(await verifyUsageInvoice('in_usage', f.deps), 1);
    assert.equal(Object.keys(f.memory.user().billingAccount!.invoiceReconciliations!).length, 1);
});
test('a draft invoice is never final financial inclusion proof', async () => {
    const f = await fixture(); f.invoice.status = 'draft';
    assert.equal(await verifyUsageInvoice('in_usage', f.deps), 0);
    assert.equal(f.memory.collection('usage_events').values[0].invoiceId, undefined);
});
test('unsupported usage discounts require net grant accounting rather than a profitability decision', async () => {
    const f = await fixture();
    Object.assign(f.lines[0], { discount_amounts: [{ amount: 1, discount: 'di_fixture' }] });
    await assert.rejects(verifyUsageInvoice('in_usage', f.deps), /net charge and prepaid grant reconciliation/);
    assert.equal(f.memory.collection('usage_events').values[0].invoiceId, undefined);
    assert.equal(f.memory.user().billingAccount!.invoiceReconciliations, undefined);
});
test('a conversion invoice verifies old and Lifetime quantities against separate frozen Stripe prices', async () => {
    const f = await fixture([{ id: 'old', pair: usageTariffFixture(), quantity: 4, minor: 1 },
        { id: 'new', pair: usageTariffFixture('lifetime', { audioPrice: '0.1' }), quantity: 20, minor: 2 }]);
    assert.equal(await verifyUsageInvoice('in_usage', f.deps), 2);
    assert.deepEqual(f.memory.collection('usage_events').values.map(row => row.billedQuantity), [4, 20]);
    assert.equal(Object.keys(f.memory.user().billingAccount!.invoiceReconciliations!).length, 2);
    f.lines[1].quantity = 4;
    await assert.rejects(verifyUsageInvoice('in_usage', f.deps), /quantity/);
});
test('sub-microdollar source fractions settle at invoice rounding without silently retaining a debit', async () => {
    const f = await fixture([{ id: 'fractional', pair: usageTariffFixture('lifetime', { audioPrice: '0.00006' }), quantity: 2, minor: 0 }]);
    assert.equal(f.memory.user().billingAccount!.prepaidSpentMicros, 1);
    assert.equal(await verifyUsageInvoice('in_usage', f.deps), 1);
    assert.equal(f.memory.user().billingAccount!.prepaidSpentMicros, 0);
    assert.equal(f.memory.user().billingAccount!.prepaidReservedMicros, 0);
    assert.equal(await verifyUsageInvoice('in_usage', f.deps), 1);
    assert.equal(f.memory.user().billingAccount!.prepaidSpentMicros, 0);
});
