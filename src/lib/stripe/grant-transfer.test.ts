import test from 'node:test';
import assert from 'node:assert/strict';
import { getBillingAccount, getPrepaidState } from './ledger';
import { activeGrantIdsForUser, prepareGrantTransfer as prepareOwnedGrantTransfer, GRANT_TRANSFERS, type GrantTransfer, handlePlannedGrantExpiry, ensureUsageGrantScope, reconcileUsageGrantScopes, reconcileGrantLineages, suspendGrantLineage } from './grant-transfer';
import { transferFixture } from './grant-transfer.test-support';
import { withBillingLease } from './billing-lock';

const target = ['price_new_storage', 'price_new_transcription'];
async function prepareGrantTransfer(...[user, lot, prices, operationId, runtime]: Parameters<typeof prepareOwnedGrantTransfer>) {
    return withBillingLease(runtime.db, user.authSubject, async current => {
        await runtime.db.collection('users').updateOne({ _id: current._id }, { $set: { billingGrantTransfer: { operationId, startedAt: new Date(), reason: 'test-owned-transfer' } } });
        return prepareOwnedGrantTransfer(current, lot, prices, operationId, runtime);
    });
}
test('grant scope transfer preserves principal and fees while funding earned but uninvoiced usage', async () => {
    const { memory, user, stripe, runtime } = transferFixture(), before = getBillingAccount(user), lot = Object.values(before.fundingLots)[0];
    const moved = await prepareGrantTransfer(user, lot, target, 'rollout', runtime);
    assert.equal(moved!.replacementAmountMinor, 500);
    const replacement = stripe.grants.get(moved!.replacementGrantId!)!;
    assert.deepEqual(replacement.applicability_config.scope.prices!.map(row => row.id).sort(), ['price_new_storage', 'price_new_transcription', 'price_old_storage', 'price_old_transcription']);
    assert.deepEqual(getBillingAccount(memory.user()), before);
    assert.equal(getPrepaidState(memory.user()).availableMicros, 4_000_000);
    await prepareGrantTransfer(memory.user(), lot, target, 'rollout', runtime);
    assert.equal(stripe.createCalls, 1);
    assert.deepEqual(await activeGrantIdsForUser(memory.user(), runtime), [replacement.id]);
});
test('only the exact expired remainder moves after earlier invoices consumed credit', async () => {
    const { user, stripe, runtime } = transferFixture();
    stripe.addTransaction('cg_original', 'debit', 'credits_applied', 100);
    const moved = await prepareGrantTransfer(user, Object.values(user.billingAccount!.fundingLots)[0], target, 'rollout', runtime);
    assert.equal(moved!.replacementAmountMinor, 400);
    assert.equal(stripe.grants.get(moved!.replacementGrantId!)!.amount.monetary!.value, 400);
});
test('lost expiry and replacement responses recover without duplicate grants or funding', async () => {
    for (const lost of ['loseExpire', 'loseCreate'] as const) {
        const { user, stripe, runtime, memory } = transferFixture(), lot = Object.values(user.billingAccount!.fundingLots)[0];
        stripe[lost] = true;
        await assert.rejects(prepareGrantTransfer(user, lot, target, 'rollout', runtime), /response lost/);
        await prepareGrantTransfer(user, lot, target, 'rollout', runtime);
        assert.equal((memory.collection(GRANT_TRANSFERS).values[0] as unknown as GrantTransfer).state, 'ready'); assert.equal(stripe.createCalls, 1);
    }
});
test('expiry without an authoritative debit proof leaves replacement funding unavailable', async () => {
    const { memory, user, stripe, runtime } = transferFixture(); stripe.omitExpiryDebit = true;
    await assert.rejects(prepareGrantTransfer(user, Object.values(user.billingAccount!.fundingLots)[0], target, 'rollout', runtime), /exact expired-credit debit/);
    assert.equal(stripe.createCalls, 0);
    const row = memory.collection(GRANT_TRANSFERS).values[0] as unknown as GrantTransfer;
    assert.equal(row.state, 'expiring');
});
test('past uninvoiced service periods block expiry before old funding eligibility can be lost', async () => {
    const { memory, user, stripe, runtime } = transferFixture();
    memory.collection('usage_events').values.push({ _id: 'old-event', authSubject: 'owner', customerId: 'cus_owner', value: 4, state: 'accepted', periodEnd: new Date('2026-01-01') });
    await assert.rejects(prepareGrantTransfer(user, Object.values(user.billingAccount!.fundingLots)[0], target, 'rollout', runtime), /earlier usage invoice/);
    assert.equal(stripe.expireCalls, 0); assert.equal(stripe.createCalls, 0);
});
test('a late ancestor invoice void suspends descendants and revokes unused original funding once', async () => {
    const { memory, user, stripe, runtime } = transferFixture();
    const moved = await prepareGrantTransfer(user, Object.values(user.billingAccount!.fundingLots)[0], target, 'rollout', runtime);
    assert.equal(await handlePlannedGrantExpiry('cg_original', runtime), true);
    assert.equal(getPrepaidState(memory.user()).availableMicros, 4_000_000);
    stripe.addTransaction('cg_original', 'credit', 'credits_application_invoice_voided', 100);
    await handlePlannedGrantExpiry('cg_original', runtime);
    assert.ok(stripe.grants.get(moved!.replacementGrantId!)!.expires_at);
    assert.equal(getPrepaidState(memory.user()).availableMicros, 0);
    assert.equal(getBillingAccount(memory.user()).prepaidSpentMicros, 1_000_000);
    await handlePlannedGrantExpiry('cg_original', runtime);
    assert.equal(getPrepaidState(memory.user()).availableMicros, 0);
});
test('an immediate plan scope preparation owns an admission hold and restores invoice auto-advance', async () => {
    const { memory, stripe, runtime } = transferFixture();
    stripe.invoiceValues.set('in_draft', { id: 'in_draft', status: 'draft', customer: 'cus_owner', auto_advance: true, period_end: Math.floor(Date.now() / 1000) + 86400, metadata: {}, lines: { data: [] } } as never);
    stripe.loseCreate = true;
    await assert.rejects(withBillingLease(runtime.db, 'owner', user => ensureUsageGrantScope(user, target, runtime)), /response lost/);
    assert.ok(memory.user().billingGrantTransfer);
    assert.equal(stripe.invoiceValues.get('in_draft')!.auto_advance, false);
    await withBillingLease(runtime.db, 'owner', user => ensureUsageGrantScope(user, target, runtime));
    assert.equal(memory.user().billingGrantTransfer, undefined);
    assert.equal(stripe.invoiceValues.get('in_draft')!.auto_advance, true);
    assert.equal(stripe.createCalls, 1);
});
test('erasure during scope replacement completes only the financial transfer through its tombstone', async () => {
    const { memory, stripe, runtime } = transferFixture(); stripe.loseCreate = true;
    await assert.rejects(withBillingLease(runtime.db, 'owner', user => ensureUsageGrantScope(user, target, runtime)), /response lost/);
    const erased = memory.collection('users').values.shift()!;
    erased.disabled = true; delete erased.email;
    memory.collection('billing_deleted_accounts').values.push(erased);
    assert.equal(await reconcileUsageGrantScopes(runtime), 1);
    assert.equal(memory.collection('users').values.length, 0);
    assert.equal(memory.collection('billing_deleted_accounts').values[0].billingGrantTransfer, undefined);
    assert.equal(stripe.createCalls, 1); assert.equal(stripe.subscriptionUpdates, 0);
});
test('a busy lineage owner is isolated until the watcher can obtain its own lease', async () => {
    const { user, runtime, stripe, memory } = transferFixture();
    await prepareGrantTransfer(user, Object.values(user.billingAccount!.fundingLots)[0], target, 'rollout', runtime);
    stripe.addTransaction('cg_original', 'credit', 'credits_application_invoice_voided', 100);
    await assert.rejects(suspendGrantLineage(user, 'cg_original', 'unowned', runtime), /owned account billing lease/);
    await withBillingLease(runtime.db, 'owner', async () => {
        assert.equal(await reconcileGrantLineages(runtime), 0);
        assert.equal(getPrepaidState(memory.user()).availableMicros, 4_000_000);
    });
    assert.equal(await reconcileGrantLineages(runtime), 1);
    assert.equal(getPrepaidState(memory.user()).availableMicros, 0);
});
test('cash reversal also expires a replacement whose successful create response was lost', async () => {
    const { user, runtime, stripe, memory } = transferFixture(); stripe.loseCreate = true;
    await assert.rejects(prepareGrantTransfer(user, Object.values(user.billingAccount!.fundingLots)[0], target, 'rollout', runtime), /response lost/);
    const replacement = stripe.grants.get('cg_replacement_1')!;
    assert.equal((memory.collection(GRANT_TRANSFERS).values[0] as unknown as GrantTransfer).replacementGrantId, undefined);
    await withBillingLease(runtime.db, 'owner', current => suspendGrantLineage(current, 'cg_original', 'cash-reversed', runtime));
    assert.ok(stripe.grants.get(replacement.id)!.expires_at);
    assert.equal(getPrepaidState(memory.user()).availableMicros, 0); assert.equal(stripe.createCalls, 1);
});
