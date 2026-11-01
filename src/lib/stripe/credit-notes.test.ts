import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { Collections } from '@/lib/mongodb';
import { MemoryBillingDatabase, FakeBillingStripe, userFixture, clone } from './test-support';
import { CREDIT_NOTE_REVIEWS, scanSubjectCreditNotes, syncCreditNoteReview } from './credit-notes';
import { DELETED_BILLING_ACCOUNTS } from './financial-settlement';
import { hasBillingIssue } from '@/lib/access-control-common';

function fixture(deleted = false) {
    const memory = new MemoryBillingDatabase(), stripe = new FakeBillingStripe();
    const user = userFixture({ planKey: 'standard', stripeCustomerGeneration: 2, ...(deleted ? { disabled: true } : {}) });
    memory.collection(deleted ? DELETED_BILLING_ACCOUNTS : Collections.USERS).values.push(clone(user) as unknown as Record<string, unknown>);
    stripe.invoiceValues.set('in_paid', { id: 'in_paid', customer: 'cus_owner', status: 'paid' } as Stripe.Invoice);
    return { memory, stripe, deps: { db: memory.asDb(), stripe: stripe.asStripe() } };
}
function note(id = 'cn_balance', extra: Partial<Stripe.CreditNote> = {}): Stripe.CreditNote {
    return { id, customer: 'cus_owner', invoice: 'in_paid', status: 'issued', currency: 'usd', amount: 500,
        pre_payment_amount: 0, post_payment_amount: 500, out_of_band_amount: 0, customer_balance_transaction: 'cbtxn_credit',
        created: 1790812800, refunds: [], ...extra } as Stripe.CreditNote;
}

test('a real credit-note review supersedes an obsolete provider-expense review', async () => {
    const { memory, stripe, deps } = fixture();
    memory.user().billingReview = { reason: 'provider_cost_evidence_requires_review', createdAt: new Date() };
    stripe.creditNoteValues.set('cn_balance', note());
    await syncCreditNoteReview('cn_balance', deps);
    assert.equal(memory.user().billingReview?.reason, 'credit_note_requires_reconciliation');
    assert.equal(memory.collection(CREDIT_NOTE_REVIEWS).values[0].state, 'requires_reconciliation');
});

test('balance and out-of-band credit notes pause spending without replaying cash or changing prepaid principal', async () => {
    const { memory, stripe, deps } = fixture();
    const ledger = { fundingLots: { paid: { amountMicros: 20_000_000, creditedMicros: 0 } }, prepaidFundedMicros: 5_000_000 };
    memory.user().billingAccount = ledger as never;
    const original = clone(memory.user().billingAccount);
    stripe.creditNoteValues.set('cn_balance', note());
    stripe.creditNoteValues.set('cn_external', note('cn_external', { customer_balance_transaction: null, out_of_band_amount: 500 }));
    await scanSubjectCreditNotes('owner', deps);
    await scanSubjectCreditNotes('owner', deps);
    assert.equal(memory.user().billingReview?.reason, 'credit_note_requires_reconciliation');
    assert.equal(hasBillingIssue(memory.user())?.allowed, false);
    assert.deepEqual(memory.user().billingAccount, original);
    assert.equal(memory.collection(CREDIT_NOTE_REVIEWS).values.length, 2);
    assert.equal(memory.collection(CREDIT_NOTE_REVIEWS).values[1].outOfBandMinor, 500);
});

test('authoritative void status does not create a new hold and late events never release an existing review', async () => {
    const { memory, stripe, deps } = fixture();
    stripe.creditNoteValues.set('cn_void', note('cn_void', { status: 'void' }));
    await syncCreditNoteReview('cn_void', deps);
    assert.equal(memory.user().billingReview, undefined);
    assert.equal(memory.collection(CREDIT_NOTE_REVIEWS).values[0].state, 'void');
    stripe.creditNoteValues.set('cn_balance', note());
    await syncCreditNoteReview('cn_balance', deps);
    stripe.creditNoteValues.get('cn_balance')!.status = 'void';
    await syncCreditNoteReview('cn_balance', deps);
    assert.equal(memory.user().billingReview?.reason, 'credit_note_requires_reconciliation');
});

test('credit-note reviews survive erasure and preserve unrelated review holds', async () => {
    const { memory, stripe, deps } = fixture(true);
    const tombstone = memory.collection(DELETED_BILLING_ACCOUNTS).values[0];
    tombstone.billingReview = { reason: 'prepaid_refund_or_dispute', createdAt: new Date() };
    stripe.creditNoteValues.set('cn_balance', note());
    await scanSubjectCreditNotes('owner', deps);
    assert.equal((tombstone.billingReview as { reason: string }).reason, 'prepaid_refund_or_dispute');
    assert.equal(memory.collection(Collections.USERS).values.length, 0);
    assert.equal(memory.collection(CREDIT_NOTE_REVIEWS).values[0].state, 'requires_reconciliation');
    const saved = JSON.stringify(memory.collection(CREDIT_NOTE_REVIEWS).values[0]);
    for (const personal of ['owner@example.test', 'https://pay.stripe.com', 'memo', 'pdf']) assert.ok(!saved.includes(personal));
});

test('credit notes cannot cross customer identity or invoice boundaries', async () => {
    const { memory, stripe, deps } = fixture();
    stripe.creditNoteValues.set('cn_wrong', note('cn_wrong', { customer: 'cus_someone_else' }));
    await assert.rejects(syncCreditNoteReview('cn_wrong', deps), /different customers/);
    assert.equal(memory.user().billingReview, undefined);
    assert.equal(memory.collection(CREDIT_NOTE_REVIEWS).values.length, 0);
});
