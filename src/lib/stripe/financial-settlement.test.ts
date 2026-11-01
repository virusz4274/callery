import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import type Stripe from 'stripe';
import { MemoryBillingDatabase, userFixture, clone } from './test-support';
import { getBillingAccount } from './ledger';
import { INTERNAL_STORAGE_EXPENSES } from '@/lib/integrations/internal-storage-expenses';
import { PROCESSING_BUDGETS } from './legacy-processing-budget';

const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === './invoice-verification' && context.parentURL?.endsWith('/stripe/financial-settlement.ts')) {
        return { url: `data:text/javascript,${encodeURIComponent('export async function verifyUsageInvoice() {}')}`, shortCircuit: true };
    }
    return next(specifier, context);
} });
const { DELETED_BILLING_ACCOUNTS, financialAccountSnapshot, processFinancialSettlements, reopenFinancialSettlement, retainFinancialSettlement } = await import('./financial-settlement');
hooks.deregister();

function memoryDatabase() {
    const memory = new MemoryBillingDatabase();
    for (const name of ['billing_settlements', DELETED_BILLING_ACCOUNTS]) {
        const rows = memory.collection(name);
        const originalUpdate = rows.updateOne.bind(rows);
        Object.assign(rows, { async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>, options?: { upsert?: boolean }) {
            let found = await rows.findOne(filter);
            if (!found && options?.upsert) {
                await rows.insertOne({ _id: filter._id, ...update.$setOnInsert as object });
                found = await rows.findOne(filter);
            }
            if (!found) return { matchedCount: 0, modifiedCount: 0 };
            const result = await originalUpdate(filter, update);
            const additions = update.$addToSet as Record<string, unknown> | undefined;
            for (const [key, addition] of Object.entries(additions || {})) {
                const latest = (await rows.findOne({ _id: found._id }))!;
                const values = (latest[key] || []) as unknown[];
                const extra = addition && typeof addition === 'object' && '$each' in addition ? (addition as { $each: unknown[] }).$each : [addition];
                await originalUpdate({ _id: found._id }, { $set: { [key]: [...new Set([...values, ...extra])] } });
            }
            return result;
        } });
    }
    return memory;
}
function fixture(subject = 'owner') {
    const memory = memoryDatabase();
    const user = userFixture({ authSubject: subject, disabled: true });
    memory.collection(DELETED_BILLING_ACCOUNTS).values.push(user as unknown as Record<string, unknown>);
    memory.collection('billing_settlements').values.push({ _id: subject, customerId: `cus_${subject}`, state: 'pending', createdAt: new Date(), updatedAt: new Date(), revision: 1 });
    return { memory, db: memory.asDb(), user };
}
function resetDue(memory: MemoryBillingDatabase) { for (const row of memory.collection('billing_settlements').values) row.nextCheckAt = new Date(0); }
function iterator<T>(values: T[]) { return { async *[Symbol.asyncIterator]() { for (const value of values) yield clone(value); } }; }

class ScriptedStripe {
    sessions: Record<string, unknown>[] = [];
    subscriptionRows: Record<string, unknown>[] = [];
    invoiceRows: Record<string, unknown>[] = [];
    intentRows = new Map<string, Record<string, unknown>>();
    calls: string[] = [];
    onExpire?: (session: Record<string, unknown>) => void;
    onInvoices?: () => Promise<void>;
    loseExpireResponse = false;
    creditNotes = { list: () => iterator([]) };
    checkout = { sessions: {
        list: () => { this.calls.push('sessions:list'); return iterator(this.sessions); },
        expire: async (id: string) => { this.calls.push(`expire:${id}`); const row = this.sessions.find(row => row.id === id)!; row.status = 'expired'; this.onExpire?.(row); if (this.loseExpireResponse) throw new Error('Response lost'); return clone(row); },
        retrieve: async (id: string) => { this.calls.push(`session:retrieve:${id}`); return clone(this.sessions.find(row => row.id === id)!); },
    } };
    subscriptions = {
        list: () => { this.calls.push('subscriptions:list'); return iterator(this.subscriptionRows); },
        retrieve: async (id: string) => clone(this.subscriptionRows.find(row => row.id === id)!),
        update: async (id: string, input: Record<string, unknown>) => { this.calls.push(`schedule:${id}`); const row = this.subscriptionRows.find(row => row.id === id)!; Object.assign(row, input); return clone(row); },
        cancel: async (id: string, input: Record<string, unknown>) => { assert.deepEqual(input, { invoice_now: true, prorate: false }); this.calls.push(`cancel:${id}`); const row = this.subscriptionRows.find(row => row.id === id)!; row.status = 'canceled'; return clone(row); },
    };
    paymentIntents = {
        retrieve: async (id: string) => clone(this.intentRows.get(id)!),
        cancel: async (id: string) => { this.calls.push(`intent:cancel:${id}`); const row = this.intentRows.get(id)!; row.status = 'canceled'; return clone(row); },
    };
    invoices = {
        retrieve: async (id: string) => clone(this.invoiceRows.find(row => row.id === id)!),
        list: (input: { status?: string }) => {
            const self = this;
            return { async *[Symbol.asyncIterator]() { await self.onInvoices?.(); for (const invoice of self.invoiceRows) if (!input.status || invoice.status === input.status) yield clone(invoice); } };
        },
        update: async (id: string, input: Record<string, unknown>) => { this.calls.push(`invoice:update:${id}:${input.auto_advance}`); const row = this.invoiceRows.find(row => row.id === id)!; Object.assign(row, input); return clone(row); },
        finalizeInvoice: async (id: string) => { this.calls.push(`invoice:finalize:${id}`); const row = this.invoiceRows.find(row => row.id === id)!; row.status = 'paid'; return clone(row); },
    };
    asStripe() { return this as unknown as Stripe; }
}
function subscription(id: string, subject = 'owner', future = false) {
    return { id, customer: `cus_${subject}`, metadata: { authSubject: subject }, status: 'active', items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + (future ? 86400 : -1), price: { recurring: { usage_type: 'licensed' } } }] } };
}

test('a restored user rotates out of the financial queue so another deletion can settle', async () => {
    const { memory, db } = fixture('restored');
    memory.collection('users').values.push(userFixture({ authSubject: 'restored' }) as unknown as Record<string, unknown>);
    memory.collection(DELETED_BILLING_ACCOUNTS).values.push(userFixture({ authSubject: 'deleted', disabled: true }) as unknown as Record<string, unknown>);
    memory.collection('billing_settlements').values.push({ _id: 'deleted', customerId: 'cus_deleted', state: 'pending', createdAt: new Date(), updatedAt: new Date() });
    const stripe = new ScriptedStripe();
    await processFinancialSettlements(db, stripe.asStripe(), 1);
    assert.equal(stripe.calls.length, 0);
    assert.ok(memory.collection('billing_settlements').values[0].nextCheckAt as Date > new Date());
    assert.equal((await processFinancialSettlements(db, stripe.asStripe(), 1)).settled, 1);
    assert.equal(memory.collection('billing_settlements').values[1].state, 'settled');
});

test('already canceled subscriptions cannot finalize drafts until accepted async work is drained', async () => {
    const { memory, db, user } = fixture();
    user.billingAccount = getBillingAccount({});
    user.billingAccount.reservations.accepted = { id: 'accepted', state: 'reserved', kind: 'transcription', maximumCostMicros: 100, retailMicros: 0, allocations: {}, createdAt: new Date(), expiresAt: new Date() };
    const stripe = new ScriptedStripe();
    stripe.subscriptionRows = [{ ...subscription('sub_old'), status: 'canceled' }];
    stripe.invoiceRows = [{ id: 'in_final', status: 'draft', auto_advance: true, parent: { subscription_details: { subscription: 'sub_old' } } }];
    assert.equal((await processFinancialSettlements(db, stripe.asStripe())).review, 1);
    assert.ok(stripe.calls.includes('invoice:update:in_final:false'));
    assert.ok(!stripe.calls.includes('invoice:finalize:in_final'));
    Object.assign(user.billingAccount!.reservations.accepted, { state: 'settled', costBasis: 'committed_cap', outcome: 'completed' });
    resetDue(memory);
    await processFinancialSettlements(db, stripe.asStripe());
    assert.ok(stripe.calls.includes('invoice:finalize:in_final'));
    resetDue(memory);
    assert.equal((await processFinancialSettlements(db, stripe.asStripe())).settled, 1);
});

test('Checkout completion racing expiration is discovered and its new subscription is canceled', async () => {
    const { db } = fixture();
    const stripe = new ScriptedStripe();
    stripe.sessions = [{ id: 'cs_open', status: 'open', metadata: { authSubject: 'owner' } }, { id: 'cs_foreign', status: 'open', metadata: { authSubject: 'somebody-else' } }];
    stripe.subscriptionRows = [subscription('sub_foreign', 'somebody-else')];
    stripe.onExpire = session => { session.status = 'complete'; session.payment_status = 'paid'; session.subscription = 'sub_late'; stripe.subscriptionRows.push({ ...subscription('sub_late'), metadata: {} }); };
    assert.equal((await processFinancialSettlements(db, stripe.asStripe())).settled, 1);
    assert.ok(stripe.calls.indexOf('expire:cs_open') < stripe.calls.indexOf('subscriptions:list'));
    assert.ok(stripe.calls.includes('cancel:sub_late'));
    assert.ok(!stripe.calls.includes('expire:cs_foreign'));
    assert.ok(!stripe.calls.includes('cancel:sub_foreign'));
});

test('pending checkout payment holds settlement while existing subscriptions are still scheduled to stop', async () => {
    const { db, memory } = fixture();
    const stripe = new ScriptedStripe();
    stripe.sessions = [{ id: 'cs_pending', status: 'complete', payment_status: 'unpaid', payment_intent: 'pi_processing', metadata: { authSubject: 'owner' } }];
    stripe.intentRows.set('pi_processing', { id: 'pi_processing', status: 'processing' });
    stripe.subscriptionRows = [subscription('sub_existing', 'owner', true)];
    assert.equal((await processFinancialSettlements(db, stripe.asStripe())).review, 1);
    assert.ok(stripe.calls.includes('schedule:sub_existing'));
    assert.equal(memory.collection('billing_settlements').values[0].state, 'review');
    assert.match(String(memory.collection('billing_settlements').values[0].lastError), /payment is still pending/);
});

test('lost expiration responses are recovered and stale worker completion cannot overwrite a late reopen', async () => {
    const { db, memory } = fixture();
    const stripe = new ScriptedStripe();
    stripe.sessions = [{ id: 'cs_open', status: 'open', metadata: { authSubject: 'owner' } }];
    stripe.loseExpireResponse = true;
    let reopened = false;
    stripe.onInvoices = async () => { if (!reopened) { reopened = true; await reopenFinancialSettlement('owner', 'cus_owner', 'sub_new', db); } };
    await processFinancialSettlements(db, stripe.asStripe());
    assert.ok(stripe.calls.includes('session:retrieve:cs_open'));
    const row = memory.collection('billing_settlements').values[0];
    assert.equal(row.state, 'pending');
    assert.equal(row.revision, 2);
    assert.deepEqual(row.subscriptionIds, ['sub_new']);
});

test('retention reopens settled references and saves Checkout recovery IDs without return URLs', async () => {
    const { db, memory, user } = fixture();
    memory.collection('billing_settlements').values[0].state = 'settled';
    memory.collection('billing_settlements').values[0].settledAt = new Date(0);
    user.stripeSubscriptionId = 'sub_new';
    user.pendingCheckout = { attemptId: 'attempt', phase: 'open', sessionId: 'cs_open', planKey: 'standard', priceId: 'price_base', createdAt: new Date(), expiresAt: new Date(), url: 'https://checkout.test/private', params: { success_url: 'https://app.test/private-user', cancel_url: 'https://app.test/private-user' } };
    const snapshot = financialAccountSnapshot(user);
    assert.equal(snapshot.pendingCheckout?.sessionId, 'cs_open');
    assert.equal(snapshot.pendingCheckout?.url, undefined);
    assert.equal(snapshot.pendingCheckout?.params.success_url, undefined);
    await retainFinancialSettlement(user, db);
    const row = memory.collection('billing_settlements').values[0];
    assert.equal(row.state, 'pending');
    assert.equal(row.settledAt, undefined);
    assert.deepEqual(row.subscriptionIds, ['sub_new']);
});

test('operator-funded deleted accounts without a Stripe customer retain unresolved cost proof before settlement', async () => {
    const { db, memory, user } = fixture();
    delete user.stripeCustomerId;
    memory.collection('billing_settlements').values = [];
    await retainFinancialSettlement(user, db);
    const reservation = { subject: 'owner', state: 'reserved', id: 'operator:accepted' };
    memory.collection('billing_operator_budget').values.push({ _id: 'managed-operator-costs-v1', reservations: { accepted: reservation } });
    const stripe = new ScriptedStripe();
    assert.equal((await processFinancialSettlements(db, stripe.asStripe())).review, 1);
    assert.equal(stripe.calls.length, 0);
    reservation.state = 'settled';
    resetDue(memory);
    assert.equal((await processFinancialSettlements(db, stripe.asStripe())).review, 1, 'Unverified committed caps remain unresolved');
    Object.assign(reservation, { evidenceId: 'provider:verified' });
    resetDue(memory);
    assert.equal((await processFinancialSettlements(db, stripe.asStripe())).settled, 1);
});

test('account erasure retains grant lineage and cannot settle unresolved price or credit transfers', async () => {
    const { db, memory, user } = fixture();
    user.billingGrantTransfer = { operationId: 'transfer-operation', startedAt: new Date(), reason: 'usage_price_scope_transfer' };
    user.billingUsagePriceRollout = { id: 'rollout', state: 'preparing', targetBundleId: 'new-bundle', effectiveAt: new Date() };
    const snapshot = financialAccountSnapshot(user);
    assert.deepEqual(snapshot.billingGrantTransfer, user.billingGrantTransfer);
    assert.deepEqual(snapshot.billingUsagePriceRollout, user.billingUsagePriceRollout);
    memory.collection('billing_grant_transfers').values.push({ _id: 'transfer', authSubject: 'owner', state: 'creating' });
    const stripe = new ScriptedStripe();
    assert.equal((await processFinancialSettlements(db, stripe.asStripe())).review, 1);
    assert.match(String(memory.collection('billing_settlements').values[0].lastError), /prepaid-credit operations/);
    memory.collection('billing_grant_transfers').values[0].state = 'ready';
    memory.collection('billing_usage_price_rollouts').values.push({ _id: 'rollout', authSubject: 'owner', state: 'scheduled' });
    resetDue(memory);
    assert.equal((await processFinancialSettlements(db, stripe.asStripe())).review, 1);
    memory.collection('billing_usage_price_rollouts').values[0].state = 'canceled';
    delete user.billingGrantTransfer;
    resetDue(memory);
    assert.equal((await processFinancialSettlements(db, stripe.asStripe())).settled, 1);
});

test('missed standalone invoice debt prevents a deleted account from being marked settled', async () => {
    const { db, memory } = fixture();
    const stripe = new ScriptedStripe();
    stripe.invoiceRows = [{ id: 'in_standalone', customer: 'cus_owner', status: 'open', amount_remaining: 500 }];
    const result = await processFinancialSettlements(db, stripe.asStripe());
    assert.equal(result.settled, 0);
    assert.equal(result.review, 1);
    assert.equal(memory.collection('billing_settlements').values[0].state, 'review');
    assert.equal((memory.collection(DELETED_BILLING_ACCOUNTS).values[0].stripePaymentIssues as Record<string, unknown>).in_standalone !== undefined, true);
    assert.ok(!stripe.calls.some(call => call.startsWith('invoice:finalize:')));
});

test('financial pruning never deletes an unresolved plan payment, including canceled cleanup', async () => {
    for (const operation of [{ state: 'needs_review' }, { state: 'canceled', creditReserved: true }]) {
        const { db, memory } = fixture();
        const settlement = memory.collection('billing_settlements').values[0];
        settlement.state = 'settled'; settlement.settledAt = new Date(Date.now() - 91 * 86400_000);
        memory.collection('billing_operations').values.push({ _id: 'unresolved', authSubject: 'owner', ...operation });
        await processFinancialSettlements(db, new ScriptedStripe().asStripe());
        assert.equal(settlement.state, 'review');
        assert.equal(memory.collection(DELETED_BILLING_ACCOUNTS).values.length, 1);
        assert.equal(memory.collection('billing_operations').values.length, 1);
    }
});

test('accepted legacy processing holds and unknown calls remain retained beyond 90 days', async () => {
    for (const unresolved of ['budget', 'unknown-child', 'customer-cost']) {
        const { db, memory, user } = fixture();
        const settlement = memory.collection('billing_settlements').values[0];
        settlement.state = 'settled'; settlement.settledAt = new Date(Date.now() - 91 * 86400_000);
        if (unresolved === 'budget' || unresolved === 'unknown-child') memory.collection(PROCESSING_BUDGETS).values.push({ _id: 'processing', subject: 'owner',
            state: unresolved === 'budget' ? 'active' : 'closed', children: unresolved === 'unknown-child' ? { pending: { state: 'unknown' } } : {} });
        if (unresolved === 'customer-cost') {
            user.billingAccount = getBillingAccount({});
            user.billingAccount.reservations.unknown = { id: 'unknown', kind: 'search:embedding', state: 'settled', outcome: 'unknown', costBasis: 'committed_cap',
                maximumCostMicros: 10, retailMicros: 0, allocations: {}, createdAt: new Date(), expiresAt: new Date() };
        }
        await processFinancialSettlements(db, new ScriptedStripe().asStripe());
        assert.equal(settlement.state, 'review', unresolved);
        assert.equal(memory.collection(DELETED_BILLING_ACCOUNTS).values.length, 1);
        assert.equal(settlement.settledAt, undefined);
    }
});

test('closed processing and physical Internal storage observations prune after 90 days without cost proof', async () => {
    const { db, memory } = fixture();
    const settlement = memory.collection('billing_settlements').values[0];
    settlement.state = 'settled'; settlement.settledAt = new Date(Date.now() - 89 * 86400_000);
    memory.collection(PROCESSING_BUDGETS).values.push({ _id: 'processing', subject: 'owner', state: 'closed', children: { done: { state: 'completed' } } });
    memory.collection(INTERNAL_STORAGE_EXPENSES).values.push({ _id: 'storage', subject: 'owner', costBasis: 'unpriced', estimateStale: true, retainedBytes: 1024 });
    memory.collection('billing_internal_cost_receipts').values.push({ _id: 'archived-internal', subject: 'owner', id: 'done', state: 'settled', outcome: 'completed', actualCostMicros: 12 });
    const deleteCollections = ['billing_settlements', DELETED_BILLING_ACCOUNTS, 'billing_provider_attempts', 'billing_usage_receipts', 'billing_financial_archive',
        'billing_operations', 'billing_prepaid_topups', 'billing_grant_transfers', 'billing_grant_scope_operations', 'billing_usage_price_rollouts', 'billing_subscription_schedules', 'billing_credit_note_reviews',
        'ai_cost_receipts', 'billing_provider_cost_evidence', PROCESSING_BUDGETS, INTERNAL_STORAGE_EXPENSES, 'billing_operator_cost_receipts', 'billing_internal_cost_receipts'];
    for (const name of deleteCollections) {
        const rows = memory.collection(name);
        Object.assign(rows, { deleteMany: async (filter: Record<string, unknown>) => {
            const ids = new Set((await rows.find(filter).toArray()).map(row => String(row._id)));
            rows.values = rows.values.filter(row => !ids.has(String(row._id)));
            return { deletedCount: ids.size };
        }, deleteOne: async (filter: Record<string, unknown>) => {
            const found = await rows.findOne(filter);
            if (!found) return { deletedCount: 0 };
            rows.values = rows.values.filter(row => String(row._id) !== String(found._id));
            return { deletedCount: 1 };
        } });
    }
    await processFinancialSettlements(db, new ScriptedStripe().asStripe());
    assert.equal(memory.collection(PROCESSING_BUDGETS).values.length, 1);
    settlement.settledAt = new Date(Date.now() - 91 * 86400_000);
    await processFinancialSettlements(db, new ScriptedStripe().asStripe());
    for (const name of [PROCESSING_BUDGETS, INTERNAL_STORAGE_EXPENSES, 'billing_internal_cost_receipts', DELETED_BILLING_ACCOUNTS, 'billing_settlements']) {
        assert.equal(memory.collection(name).values.length, 0, name);
    }
});
