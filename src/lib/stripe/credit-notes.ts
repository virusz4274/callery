import { hasBlockingBillingReview } from './financial-review';
import type Stripe from 'stripe';
import type { User } from '@/lib/db/types';
import { Collections } from '@/lib/mongodb';
import { billingDependencies, type BillingDependencies } from './runtime';
import { billingFence, BillingBusyError, withBillingLease } from './billing-lock';
import { DELETED_BILLING_ACCOUNTS } from './financial-settlement';
import { stripeObjectId } from './objects';

export const CREDIT_NOTE_REVIEWS = 'billing_credit_note_reviews';
export interface CreditNoteReview {
    _id: string; authSubject: string; customerId: string; generation: number; invoiceId: string;
    currency: string; amountMinor: number; prePaymentMinor: number; postPaymentMinor: number;
    outOfBandMinor: number; customerBalanceTransactionId?: string; refundIds: string[];
    status: Stripe.CreditNote['status']; state: 'requires_reconciliation' | 'void' | 'reconciled';
    createdAt: Date; checkedAt: Date;
}

/** A credit note can reverse principal without refunding a Stripe charge. Until
 * its precise cash/credit lineage is reconciled, retain the existing ledger and
 * pause spending instead of inventing a refund or recognizing new cash. */
export async function syncCreditNoteReview(id: string, dependencies?: BillingDependencies): Promise<void> {
    const runtime = await billingDependencies(dependencies), { db, stripe } = runtime;
    const note = await stripe.creditNotes.retrieve(id);
    const customerId = stripeObjectId(note.customer), invoiceId = stripeObjectId(note.invoice);
    if (!customerId || !invoiceId || !note.id.startsWith('cn_')) throw new Error('The credit-note financial identity is unavailable.');
    const invoice = await stripe.invoices.retrieve(invoiceId);
    if (stripeObjectId(invoice.customer) !== customerId) throw new Error('The credit note and invoice have different customers.');
    const account = await db.collection<User>(Collections.USERS).findOne({ stripeCustomerId: customerId })
        || await db.collection<User>(DELETED_BILLING_ACCOUNTS).findOne({ stripeCustomerId: customerId });
    if (!account) return;
    await withBillingLease(db, account.authSubject, async (user, owner) => {
        if (user.stripeCustomerId !== customerId || (user.stripeCustomerGeneration || 0) !== (account.stripeCustomerGeneration || 0)) throw new BillingBusyError();
        const previous = await db.collection<CreditNoteReview>(CREDIT_NOTE_REVIEWS).findOne({ _id: note.id });
        if (previous && (previous.authSubject !== user.authSubject || previous.customerId !== customerId || previous.invoiceId !== invoiceId)) throw new Error('The credit-note owner changed.');
        const state = note.status === 'void' ? 'void' : previous?.state === 'reconciled' ? 'reconciled' : 'requires_reconciliation';
        const collection = await db.collection<User>(Collections.USERS).findOne({ _id: user._id }) ? Collections.USERS : DELETED_BILLING_ACCOUNTS;
        if (state === 'requires_reconciliation' && (!hasBlockingBillingReview(user.billingReview) || user.billingReview?.reason === 'credit_note_requires_reconciliation')) {
            const changed = await db.collection<User>(collection).updateOne({ ...billingFence(user, owner),
                stripeCustomerGeneration: user.stripeCustomerGeneration ?? { $exists: false } }, { $set: {
                billingReview: { reason: 'credit_note_requires_reconciliation', createdAt: user.billingReview?.createdAt || new Date() }, updatedAt: new Date(),
            } });
            if (!changed.matchedCount) throw new BillingBusyError();
        }
        await db.collection<CreditNoteReview>(CREDIT_NOTE_REVIEWS).updateOne({ _id: note.id }, { $set: {
            authSubject: user.authSubject, customerId, generation: user.stripeCustomerGeneration || 0, invoiceId,
            currency: note.currency, amountMinor: note.amount, prePaymentMinor: note.pre_payment_amount,
            postPaymentMinor: note.post_payment_amount, outOfBandMinor: note.out_of_band_amount || 0,
            ...(stripeObjectId(note.customer_balance_transaction) ? { customerBalanceTransactionId: stripeObjectId(note.customer_balance_transaction)! } : {}),
            refundIds: (note.refunds || []).map(refund => stripeObjectId(refund.refund)).filter((value): value is string => Boolean(value)),
            status: note.status, state, checkedAt: new Date(),
        }, $setOnInsert: { createdAt: new Date(note.created * 1000) } }, { upsert: true });
    });
}

/** Full account pagination repairs missing credit-note webhooks. */
export async function scanSubjectCreditNotes(subject: string, dependencies: BillingDependencies): Promise<void> {
    const runtime = await billingDependencies(dependencies), { db, stripe } = runtime;
    const user = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject })
        || await db.collection<User>(DELETED_BILLING_ACCOUNTS).findOne({ authSubject: subject });
    if (!user?.stripeCustomerId) return;
    for await (const note of stripe.creditNotes.list({ customer: user.stripeCustomerId, limit: 100 })) {
        await syncCreditNoteReview(note.id, runtime);
    }
}
