import type Stripe from 'stripe';
import { Collections } from '@/lib/mongodb';
import type { Plan, User } from '@/lib/db/types';
import { billingDependencies, type BillingDependencies } from './runtime';
import { stripeObjectId, invoiceLinePriceId } from './objects';
import { creditBaseFunds, getBillingAccount, ledgerKey } from './ledger';
import { DELETED_BILLING_ACCOUNTS } from './financial-settlement';
import { processorFeeUsdMicros } from './fees';
import { redeemPlanCredit } from './plan-credit-economics';
import type { BillingChangeOperation } from './plan-change';
import { assertHostedPlanInvoice } from './plan-change-payment';
import { NORMAL_PRORATION_POLICY_VERSION } from './subscription-schedule';

/** Complete pagination is mandatory for both proof of purchase and source-of-funds accounting. */
export async function completeInvoiceLines(stripe: Stripe, invoice: Stripe.Invoice): Promise<Stripe.InvoiceLineItem[]> {
    const lines = [...invoice.lines.data];
    let more = invoice.lines.has_more;
    while (more) {
        const page = await stripe.invoices.listLineItems(invoice.id, { limit: 100, starting_after: lines.at(-1)!.id });
        if (!page.data.length) throw new Error('Incomplete invoice line pagination.');
        lines.push(...page.data); more = page.has_more;
    }
    return lines;
}

export function lineNetPrincipal(line: Stripe.InvoiceLineItem): number {
    // Stripe's subtotal already excludes taxes. Historical responses without
    // it need only embedded inclusive taxes removed from the amount.
    const subtotal = line.subtotal ?? line.amount - (line.taxes || []).filter(tax => tax.tax_behavior === 'inclusive').reduce((sum, tax) => sum + tax.amount, 0);
    return Math.max(0, subtotal - (line.discount_amounts || []).reduce((sum, item) => sum + item.amount, 0));
}

function isPriceBinding(value: unknown): value is string {
    return typeof value === 'string' && /^price_[a-zA-Z0-9_]+$/.test(value);
}

async function redeemInvoiceCredits(user: User, invoice: Stripe.Invoice, principalMinor: number, otherMinor: number, runtime: BillingDependencies) {
    const { db, stripe } = runtime;
    const operationId = invoice.metadata?.billingOperationId || invoice.parent?.subscription_details?.metadata?.billingOperationId;
    let inlineMinor = 0;
    if (operationId && ['subscription_update', 'manual'].includes(invoice.billing_reason || '')) {
        const operation = await db.collection<{ _id: string; authSubject: string; customerId: string; invoiceId?: string;
            preview: { baseCreditMinor: number }; creditPolicyVersion?: string }>('billing_operations').findOne({ _id: operationId, authSubject: user.authSubject, customerId: user.stripeCustomerId });
        if (operation?.creditPolicyVersion === NORMAL_PRORATION_POLICY_VERSION) return;
        if (operation && (!operation.invoiceId || operation.invoiceId === invoice.id)) {
            inlineMinor = Math.min(operation.preview.baseCreditMinor, principalMinor);
            await redeemPlanCredit(user.authSubject, operationId, invoice.id, inlineMinor, db);
        }
    }
    const fresh = await db.collection<User>(Collections.USERS).findOne({ _id: user._id })
        || await db.collection<User>(DELETED_BILLING_ACCOUNTS).findOne({ _id: user._id });
    if (!fresh) throw new Error('The credit funding account is unavailable.');
    const reservations = Object.values(getBillingAccount(fresh).planCreditReservations || {});
    if (!reservations.some(row => row.state === 'applied' && row.amountMicros > (row.redeemedMicros || 0))) return;
    let consumedMinor = 0;
    for await (const transaction of stripe.customers.listBalanceTransactions(user.stripeCustomerId!, { limit: 100 })) {
        if (transaction.type === 'applied_to_invoice' && transaction.currency === 'usd' && transaction.amount > 0
            && stripeObjectId(transaction.invoice) === invoice.id) consumedMinor += transaction.amount;
    }
    // Invoice balance is not a prepaid usage wallet. Uncovered non-base charges
    // reduce what can be attributed to an earned base/lifetime credit redemption.
    let budgetMicros = Math.max(0, Math.min(principalMinor - inlineMinor, consumedMinor - otherMinor)) * 10_000;
    budgetMicros -= Math.max(0, reservations.reduce((sum, row) => sum + (row.redemptionReceipts?.[ledgerKey(invoice.id)] || 0), 0) - inlineMinor * 10_000);
    for (const reservation of reservations) {
        if (budgetMicros <= 0) break;
        if (reservation.state !== 'applied' || reservation.redemptionReceipts?.[ledgerKey(invoice.id)] !== undefined) continue;
        const amount = Math.min(budgetMicros, reservation.amountMicros - (reservation.redeemedMicros || 0));
        if (!amount) continue;
        await redeemPlanCredit(user.authSubject, reservation.id, invoice.id, Math.floor(amount / 10_000), db);
        budgetMicros -= Math.floor(amount / 10_000) * 10_000;
    }
}

/** Only confirmed provider cash creates refundable funding. Invoice-credit payments never mint it. */
export async function syncPaidInvoiceFunding(invoiceId: string, dependencies?: BillingDependencies) {
    const runtime = await billingDependencies(dependencies), { db, stripe } = runtime;
    const invoice = await stripe.invoices.retrieve(invoiceId);
    if (invoice.status !== 'paid') return;
    const customerId = stripeObjectId(invoice.customer);
    const user = customerId && (await db.collection<User>(Collections.USERS).findOne({ stripeCustomerId: customerId })
        || await db.collection<User>(DELETED_BILLING_ACCOUNTS).findOne({ stripeCustomerId: customerId }));
    if (!user) return;
    const lines = await completeInvoiceLines(stripe, invoice);
    const operationId = invoice.metadata?.billingOperationId || invoice.parent?.subscription_details?.metadata?.billingOperationId;
    const operation = operationId && await db.collection<BillingChangeOperation>('billing_operations').findOne({ _id: operationId,
        authSubject: user.authSubject, customerId: user.stripeCustomerId });
    const hosted = operation && operation.paymentMode === 'hosted_invoice' ? operation : undefined;
    if (invoice.metadata?.purpose === 'plan_change_payment' && !hosted) throw new Error('The hosted plan payment has no owned operation proof.');
    if (hosted) await assertHostedPlanInvoice(hosted, invoice, stripe);
    const hostedLine = (line: Stripe.InvoiceLineItem) => hosted?.hostedInvoice?.lines.find(proof => proof.key === line.metadata?.hostedLineKey);
    const originalPriceId = (line: Stripe.InvoiceLineItem) => hosted
        ? hostedLine(line)?.originalPriceId
        : invoiceLinePriceId(line);
    const mapped = [...await db.collection<Plan>(Collections.PLANS).find({}).toArray(),
        ...(await db.collection<{ plan: Plan }>('billing_catalog_versions').find({}).toArray()).map(version => version.plan)];
    // Installation templates deliberately have no Stripe binding. A missing
    // original Price on a retention adjustment must never match those templates.
    const baseIds = new Set(mapped.filter(plan => plan.interval !== 'lifetime').map(plan => plan.stripePriceId).filter(isPriceBinding));
    const lifetimeIds = new Set(mapped.filter(plan => plan.interval === 'lifetime').map(plan => plan.stripePriceId).filter(isPriceBinding));
    const matchesPurchase = (line: Stripe.InvoiceLineItem, ids: Set<string>, role: 'base' | 'lifetime') => {
        const priceId = originalPriceId(line);
        return line.amount > 0 && isPriceBinding(priceId) && ids.has(priceId)
            && (!hosted || hostedLine(line)?.role === role)
            && line.metadata?.purpose !== 'consumed_benefit_retention';
    };
    const base = lines.filter(line => matchesPurchase(line, baseIds, 'base'));
    const lifetime = lines.filter(line => matchesPurchase(line, lifetimeIds, 'lifetime'));
    if (!base.length && !lifetime.length) return;
    const retention = lines.filter(line => line.amount > 0 && operationId && line.metadata?.billingOperationId === operationId
        && line.metadata?.purpose === 'consumed_benefit_retention');
    const principalLines = new Set([...base, ...lifetime, ...retention]);
    const principalMinor = [...principalLines].reduce((sum, line) => sum + lineNetPrincipal(line), 0);
    const otherLines = lines.filter(line => !principalLines.has(line));
    let grantDebitsMinor = 0;
    if (otherLines.some(line => line.amount > 0)) for await (const transaction of stripe.billing.creditBalanceTransactions.list({ customer: customerId!, limit: 100 })) {
        const debit = transaction.debit;
        if (transaction.type === 'debit' && debit?.type === 'credits_applied' && stripeObjectId(debit.credits_applied?.invoice) === invoice.id
            && debit.amount.monetary?.currency === 'usd') grantDebitsMinor += debit.amount.monetary.value;
    }
    const other = otherLines.reduce((sum, line) => sum + Math.max(0, line.amount), 0);
    const taxes = (invoice.total_taxes || []).reduce((sum, tax) => sum + tax.amount, 0);
    await redeemInvoiceCredits(user, invoice, [...base, ...lifetime].reduce((sum, line) => sum + lineNetPrincipal(line), 0),
        Math.max(0, other - grantDebitsMinor) + taxes, runtime);
    let cashMinor = 0, feeMicros = 0, feesMeasured = true;
    for await (const payment of stripe.invoicePayments.list({ invoice: invoice.id, limit: 100 })) {
        const intentId = stripeObjectId(payment.payment.payment_intent);
        if (payment.status !== 'paid' || payment.payment.type !== 'payment_intent' || !intentId) continue;
        const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge.balance_transaction'] });
        if (intent.status !== 'succeeded' || stripeObjectId(intent.customer) !== customerId || intent.currency !== 'usd') continue;
        const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
        if (!charge || !charge.paid || charge.refunded || charge.disputed) continue;
        const balance = typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
        cashMinor += Math.min(payment.amount_paid || 0, intent.amount_received);
        try {
            if (!balance) throw new Error('Processor fee settlement is not available yet. Retry funding reconciliation.');
            feeMicros += processorFeeUsdMicros(balance);
        } catch (error) {
            if (hosted && hosted.creditPolicyVersion !== NORMAL_PRORATION_POLICY_VERSION) throw error;
            feesMeasured = false;
        }
    }
    const fundedMinor = Math.min(principalMinor, Math.max(0, cashMinor - Math.max(0, other - grantDebitsMinor) - taxes));
    if (!fundedMinor) return;
    const id = `stripe-invoice:${invoice.id}`;
    await creditBaseFunds(user.authSubject, { id, amountMicros: fundedMinor * 10_000, reference: invoice.id,
        kind: lifetime.length ? 'lifetime' : 'base', ...(feesMeasured ? { processorFeeMicros: feeMicros } : {}) }, db);
}

/** One-time Checkout normally creates an invoice; retain a conservative cash proof for historical sessions without one. */
export async function syncPaidCheckoutFunding(session: Stripe.Checkout.Session, dependencies?: BillingDependencies) {
    const runtime = await billingDependencies(dependencies), { db, stripe } = runtime;
    const invoiceId = stripeObjectId(session.invoice);
    if (invoiceId) { await syncPaidInvoiceFunding(invoiceId, runtime); return; }
    if (session.invoice_creation?.enabled || session.payment_status !== 'paid') return;
    const intentId = stripeObjectId(session.payment_intent), customerId = stripeObjectId(session.customer);
    if (!intentId || !customerId) return;
    const user = await db.collection<User>(Collections.USERS).findOne({ stripeCustomerId: customerId })
        || await db.collection<User>(DELETED_BILLING_ACCOUNTS).findOne({ stripeCustomerId: customerId });
    if (!user?.lifetimePurchase || user.lifetimePurchase.checkoutSessionId !== session.id) return;
    const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge.balance_transaction'] });
    const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
    const balance = charge && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
    if (intent.status !== 'succeeded' || intent.currency !== 'usd' || stripeObjectId(intent.customer) !== customerId
        || !charge?.paid || charge.refunded || charge.disputed) return;
    const id = `stripe-payment:${intentId}`;
    let feeMicros: number | undefined;
    if (balance) try { feeMicros = processorFeeUsdMicros(balance); } catch { /* Observational fee data does not gate a confirmed purchase. */ }
    await creditBaseFunds(user.authSubject, { id, amountMicros: intent.amount_received * 10_000, reference: intentId,
        kind: 'lifetime', ...(feeMicros !== undefined ? { processorFeeMicros: feeMicros } : {}) }, db);
}
