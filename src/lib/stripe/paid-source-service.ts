import Stripe from 'stripe';
import type { User } from '@/lib/db/types';
import { Collections } from '@/lib/mongodb';
import type { BillingChangeOperation } from './plan-change';
import type { BillingDependencies } from './runtime';
import { assertHostedPlanInvoice, previewIsolatedHostedInvoice, type HostedPlanInvoiceLine } from './plan-change-payment';
import { completeInvoiceLines, syncPaidInvoiceFunding } from './invoice-funding';
import { getBillingAccount, ledgerKey, type BillingAccount } from './ledger';
import { getInvoiceSubscriptionId, invoiceLinePriceId, stripeObjectId } from './objects';
import { NORMAL_PRORATION_POLICY_VERSION } from './subscription-schedule';
import { hasBlockingFinancialReview } from './financial-review';

export interface PaidSourceServiceCreditBasis {
    version: 1;
    operationId: string;
    invoiceId: string;
    lineKey: string;
    priceId: string;
    period: { start: number; end: number };
    prorationDate: number;
    quantityDecimal: string;
    paidPrincipalMinor: number;
}

const positiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0;
function invalid(message: string): never { throw new Error(`The paid source service needs financial reconciliation: ${message}`); }
function decimalQuantity(value: unknown): bigint | null {
    const match = /^(\d+)(?:\.(\d{1,12}))?$/.exec(String(value));
    return match ? BigInt(match[1]) * BigInt(1_000_000_000_000) + BigInt((match[2] || '').padEnd(12, '0')) : null;
}

/** Only a real paid renewal can supersede an applied hosted service receipt. */
async function hasCurrentNativeRenewal(user: User, subscription: Stripe.Subscription, base: Stripe.SubscriptionItem, priorInvoiceId: string,
    runtime: BillingDependencies): Promise<boolean> {
    const id = stripeObjectId(subscription.latest_invoice);
    if (!id || id === priorInvoiceId) return false;
    const invoice = await runtime.stripe.invoices.retrieve(id);
    if (invoice.status !== 'paid' || invoice.billing_reason !== 'subscription_cycle') return false;
    if (invoice.total > 0 && invoice.amount_paid === 0 && invoice.amount_due > 0) invalid('the renewal payment was deferred to customer debt.');
    if (stripeObjectId(invoice.customer) !== user.stripeCustomerId || getInvoiceSubscriptionId(invoice) !== subscription.id
        || invoice.currency !== subscription.currency) invalid('renewal identity changed.');
    const lines = await completeInvoiceLines(runtime.stripe, invoice);
    const recurring = lines.filter(line => line.parent?.type === 'subscription_item_details'
        && line.parent.subscription_item_details?.proration === false && line.amount > 0
        && line.parent.subscription_item_details.subscription_item === base.id && invoiceLinePriceId(line) === base.price.id);
    if (recurring.length !== 1) invalid('the paid renewal has no unique current base purchase.');
    const line = recurring[0];
    if (line.parent!.subscription_item_details!.subscription !== subscription.id || line.quantity !== 1
        || line.period.start !== base.current_period_start || line.period.end !== base.current_period_end) invalid('the paid renewal period changed.');
    return true;
}

function fundedSourcePrincipal(account: BillingAccount, invoiceId: string): number {
    if (hasBlockingFinancialReview(account)) invalid('funding is under review.');
    const fundingId = `stripe-invoice:${invoiceId}`, cash = account.fundingLots[ledgerKey(fundingId)];
    let cashMicros = 0;
    if (cash) {
        if (cash.id !== fundingId || cash.reference !== invoiceId || cash.kind !== 'base' || cash.source !== 'stripe'
            || !Number.isSafeInteger(cash.amountMicros) || cash.amountMicros < 0 || (cash.revokedMicros || 0) !== 0
            || cash.reversalReceipts?.length) invalid('the original cash receipt is not valid.');
        cashMicros = cash.amountMicros;
    }
    let redeemedMicros = 0;
    for (const [key, credit] of Object.entries(account.planCreditReservations || {})) {
        const redeemed = credit.redemptionReceipts?.[ledgerKey(invoiceId)] || 0;
        if (!redeemed) continue;
        if (key !== ledgerKey(credit.id) || credit.state !== 'applied' || !positiveInteger(redeemed)
            || redeemed > credit.amountMicros || redeemed > (credit.redeemedMicros || 0)) invalid('the paid credit receipt is not valid.');
        let lineage = 0;
        for (const [id, amount] of Object.entries(credit.redeemedAllocations || {})) {
            const ancestor = account.fundingLots[id];
            if (!ancestor || ancestor.kind !== 'base' || ancestor.source !== 'stripe' || !Number.isSafeInteger(amount) || amount < 0
                || amount > (credit.allocations[id] || 0) || amount > ancestor.amountMicros
                || (ancestor.revokedMicros || 0) !== 0 || ancestor.reversalReceipts?.length) invalid('the paid credit funding lineage is incomplete.');
            lineage += amount;
        }
        if (lineage < redeemed || lineage !== credit.redeemedMicros) invalid('the paid credit funding lineage does not balance.');
        redeemedMicros += redeemed;
    }
    if (!Number.isSafeInteger(cashMicros + redeemedMicros)) invalid('the source funding amount is invalid.');
    return cashMicros + redeemedMicros;
}

/** Additive funding synchronization cannot itself revoke a receipt after a
 * missed refund webhook. Read every paid cash ancestor before reusing it. */
async function assertCashHistoryIntact(account: BillingAccount, sourceInvoice: Stripe.Invoice,
    customerId: string, runtime: BillingDependencies): Promise<void> {
    const lots = [account.fundingLots[ledgerKey(`stripe-invoice:${sourceInvoice.id}`)]];
    for (const credit of Object.values(account.planCreditReservations || {})) {
        if (credit.redemptionReceipts?.[ledgerKey(sourceInvoice.id)]) {
            for (const [id, amount] of Object.entries(credit.redeemedAllocations || {})) if (amount) lots.push(account.fundingLots[id]);
        }
    }
    const checked = new Map<string, number>();
    for (const lot of lots) {
        if (!lot || !lot.amountMicros) continue;
        if (checked.has(lot.reference)) {
            if (checked.get(lot.reference)! < lot.amountMicros) invalid('the cash ancestor exceeds its payment.');
            continue;
        }
        if (lot.id !== `stripe-invoice:${lot.reference}` || !lot.reference.startsWith('in_')) invalid('the cash ancestor has no original invoice.');
        const invoice = lot.reference === sourceInvoice.id ? sourceInvoice : await runtime.stripe.invoices.retrieve(lot.reference);
        if (invoice.status !== 'paid' || stripeObjectId(invoice.customer) !== customerId || invoice.currency !== sourceInvoice.currency
            || invoice.amount_remaining !== 0 || (invoice.post_payment_credit_notes_amount || 0) !== 0
            || (invoice.pre_payment_credit_notes_amount || 0) !== 0) invalid('the original cash invoice has been adjusted or is unpaid.');
        let cashMinor = 0;
        for await (const payment of runtime.stripe.invoicePayments.list({ invoice: invoice.id, limit: 100 })) {
            if (payment.status !== 'paid') continue;
            const id = stripeObjectId(payment.payment.payment_intent);
            if (stripeObjectId(payment.invoice) !== invoice.id || payment.currency !== invoice.currency
                || payment.payment.type !== 'payment_intent' || !id || !positiveInteger(payment.amount_paid || 0)) invalid('the original invoice payment needs review.');
            const intent = await runtime.stripe.paymentIntents.retrieve(id, { expand: ['latest_charge'] });
            const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
            if (intent.id !== id || intent.status !== 'succeeded' || stripeObjectId(intent.customer) !== customerId
                || intent.currency !== invoice.currency || !Number.isSafeInteger(intent.amount_received) || intent.amount_received < payment.amount_paid!
                || !charge?.paid || charge.refunded || charge.disputed || (charge.amount_refunded || 0) !== 0) invalid('an original cash payment was refunded, disputed or is unverified.');
            cashMinor += payment.amount_paid!;
        }
        if (!Number.isSafeInteger(cashMinor) || cashMinor * 10_000 < lot.amountMicros) invalid('the original cash payment does not cover its recorded funding.');
        checked.set(lot.reference, cashMinor * 10_000);
    }
}

/** A manual hosted purchase is not a native subscription debit. Ask Stripe to
 * price the unused fraction of that exact paid service, preserving its net
 * discounted price and original tax treatment rather than today's retail rate. */
export async function previewPaidSourceServiceCredit(user: User, subscription: Stripe.Subscription, base: Stripe.SubscriptionItem,
    operationId: string, prorationDate: number, runtime: BillingDependencies): Promise<{
        basis: PaidSourceServiceCreditBasis; line: Stripe.InvoiceLineItem; unusedMinor: number; source: HostedPlanInvoiceLine;
    } | null> {
    if (!operationId || !positiveInteger(prorationDate) || !user.stripeCustomerId || user.stripeSubscriptionId !== subscription.id
        || stripeObjectId(subscription.customer) !== user.stripeCustomerId || subscription.currency !== 'usd'
        || base.quantity !== 1 || base.price.recurring?.usage_type === 'metered'
        || !subscription.items.data.some(item => item.id === base.id && item.price.id === base.price.id)) invalid('the current base identity changed.');
    const operations = runtime.db.collection<BillingChangeOperation>('billing_operations');
    let operation: BillingChangeOperation | null;
    if (user.billingLastAppliedOperationId) operation = await operations.findOne({ _id: user.billingLastAppliedOperationId });
    else {
        const matching = await operations.find({ authSubject: user.authSubject, customerId: user.stripeCustomerId, subscriptionId: subscription.id,
            state: 'applied', kind: 'plan_change', paymentMode: 'hosted_invoice', 'target.stripePriceId': base.price.id,
            'params.items.0.id': base.id }).toArray();
        if (!matching.length) return null;
        matching.sort((a, b) => Number(b.appliedAt) - Number(a.appliedAt));
        if (matching.length > 1 && (!matching[0].appliedAt || !Number.isFinite(Number(matching[0].appliedAt))
            || Number(matching[0].appliedAt) === Number(matching[1].appliedAt))) invalid('the latest hosted purchase cannot be identified.');
        operation = matching[0];
    }
    if (!operation || operation.authSubject !== user.authSubject || operation.customerId !== user.stripeCustomerId
        || operation.subscriptionId !== subscription.id || operation.state !== 'applied' || operation.kind !== 'plan_change'
        || operation.paymentMode !== 'hosted_invoice' || !operation.invoiceId || !operation.hostedInvoice
        || operation.params.items?.[0]?.id !== base.id) invalid('the referenced hosted purchase is missing or ambiguous.');
    // A verified renewal starts a new native paid service period; its original
    // debit, rather than the expired hosted receipt, must drive prorations.
    if (await hasCurrentNativeRenewal(user, subscription, base, operation.invoiceId, runtime)) return null;
    if (operation.target.stripePriceId !== base.price.id) invalid('the hosted purchase does not match the current price.');
    const sources = operation.hostedInvoice.lines.filter(line => line.role === 'base' && line.originalPriceId === base.price.id);
    if (sources.length !== 1 || operation.hostedInvoice.lines.filter(line => line.role === 'base').length !== 1) invalid('the hosted purchase has no unique base service.');
    const source = sources[0], period = source.period;
    if (!positiveInteger(source.netAmountMinor) || !positiveInteger(period.start) || !positiveInteger(period.end)
        || period.start < base.current_period_start || period.start >= period.end || period.end !== base.current_period_end
        || prorationDate < period.start || prorationDate >= period.end) invalid('the purchased service period does not cover this quote.');
    if (source.taxes.some(tax => !tax.rateId || !Number.isSafeInteger(tax.amount) || tax.amount < 0 || tax.behavior !== source.taxBehavior)
        || new Set(source.taxes.map(tax => tax.rateId)).size !== source.taxes.length) invalid('the original tax treatment is inconsistent.');
    const invoice = await runtime.stripe.invoices.retrieve(operation.invoiceId);
    if (invoice.status !== 'paid' || invoice.amount_remaining !== 0 || getInvoiceSubscriptionId(invoice)
        || (invoice.post_payment_credit_notes_amount || 0) !== 0 || (invoice.pre_payment_credit_notes_amount || 0) !== 0) invalid('the source invoice is not an intact paid purchase.');
    await assertHostedPlanInvoice(operation, invoice, runtime.stripe);
    await syncPaidInvoiceFunding(invoice.id, runtime);
    const fresh = await runtime.db.collection<User>(Collections.USERS).findOne({ _id: user._id, authSubject: user.authSubject });
    if (!fresh || fresh.stripeCustomerId !== user.stripeCustomerId || fresh.stripeSubscriptionId !== subscription.id
        || fresh.stripeCustomerGeneration !== user.stripeCustomerGeneration
        || fresh.billingLastAppliedOperationId !== user.billingLastAppliedOperationId) invalid('the account changed during funding verification.');
    const account = getBillingAccount(fresh);
    if (operation.creditPolicyVersion !== NORMAL_PRORATION_POLICY_VERSION) {
        if (fundedSourcePrincipal(account, invoice.id) < source.netAmountMinor * 10_000) invalid('verified cash and redeemed credit do not cover the purchased service.');
        await assertCashHistoryIntact(account, invoice, user.stripeCustomerId, runtime);
    }
    const product = stripeObjectId(base.price.product);
    if (!product) invalid('the original base product is missing.');
    const scale = BigInt(1_000_000_000_000);
    const fraction = BigInt(period.end - prorationDate) * scale / BigInt(period.end - period.start);
    const quantityDecimal = `${fraction / scale}.${(fraction % scale).toString().padStart(12, '0')}`;
    const gross = source.netAmountMinor + source.taxes.filter(tax => tax.behavior === 'inclusive').reduce((sum, tax) => sum + tax.amount, 0);
    if (!positiveInteger(gross)) invalid('the purchased amount is invalid.');
    const metadata = { purpose: 'paid_source_service_credit', billingOperationId: operationId, paidSourcePriceId: base.price.id };
    const preview = await previewIsolatedHostedInvoice(runtime.stripe, user.stripeCustomerId, invoice.currency, product, [{
        unit_amount: -gross, quantity_decimal: Stripe.Decimal.from(quantityDecimal), currency: invoice.currency, discountable: false, discounts: '',
        tax_behavior: source.taxBehavior, tax_rates: source.taxes.map(tax => tax.rateId), period: { start: prorationDate, end: period.end },
        description: 'Unused paid service from the previous plan purchase', metadata,
    }]);
    if (preview.lines.has_more || preview.lines.data.length !== 1 || preview.currency !== invoice.currency) invalid('the unused service preview is incomplete.');
    const line = preview.lines.data[0];
    const returnedTaxes = (line.taxes || []).map(tax => ({ rateId: tax.tax_rate_details?.tax_rate, amount: tax.amount, behavior: tax.tax_behavior }));
    const net = line.subtotal ?? line.amount - returnedTaxes.filter(tax => tax.behavior === 'inclusive').reduce((sum, tax) => sum + tax.amount, 0);
    if (line.currency !== invoice.currency || line.period.start !== prorationDate || line.period.end !== period.end
        || decimalQuantity(line.quantity_decimal) !== fraction
        || Object.entries(metadata).some(([key, value]) => line.metadata?.[key] !== value)
        || (line.discount_amounts || []).some(discount => discount.amount !== 0)
        || !Number.isSafeInteger(line.amount) || line.amount > 0 || line.amount < -gross
        || !Number.isSafeInteger(net) || net > 0 || -net > source.netAmountMinor
        || returnedTaxes.some(tax => !Number.isSafeInteger(tax.amount) || tax.amount > 0 || !source.taxes.some(original =>
            original.rateId === tax.rateId && original.behavior === tax.behavior && -tax.amount <= original.amount))
        || new Set(returnedTaxes.map(tax => tax.rateId)).size !== returnedTaxes.length
        || net !== 0 && source.taxes.some(tax => !returnedTaxes.some(actual => actual.rateId === tax.rateId))) invalid('Stripe could not reproduce the unused service credit.');
    const basis: PaidSourceServiceCreditBasis = { version: 1, operationId: operation._id, invoiceId: invoice.id,
        lineKey: source.key, priceId: base.price.id, period: { ...period }, prorationDate, quantityDecimal, paidPrincipalMinor: source.netAmountMinor };
    return { basis, line, unusedMinor: -net || 0, source: structuredClone(source) };
}
