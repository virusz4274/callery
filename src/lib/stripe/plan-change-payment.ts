import type Stripe from 'stripe';
import type { BillingChangeOperation } from './plan-change';
import { completeInvoiceLines } from './invoice-funding';
import { getInvoiceSubscriptionId, invoiceLinePriceId, stripeObjectId } from './objects';

export interface HostedPlanInvoiceLine {
    key: string; originalPriceId?: string; netAmountMinor: number; description: string;
    period: { start: number; end: number }; taxBehavior: 'inclusive' | 'exclusive' | 'unspecified';
    taxes: { rateId: string; amount: number; behavior: string }[];
    role: 'base' | 'lifetime' | 'credit' | 'retention';
}
export interface HostedPlanInvoice {
    lines: HostedPlanInvoiceLine[]; currency: string; totalMinor: number; amountDueMinor: number;
}
export interface HostedPlanInvoiceContext {
    prorationDate: number;
    subscriptionId: string;
    baseItemId: string;
    intervalChange: boolean;
    sourcePeriodEnd?: number;
}
export class HostedPlanInvoiceMismatchError extends Error {}
function taxes(line: Stripe.InvoiceLineItem): HostedPlanInvoiceLine['taxes'] {
    return (line.taxes || []).map(tax => {
        if (!tax.tax_rate_details?.tax_rate || !Number.isSafeInteger(tax.amount)) throw new Error('The quoted tax calculation cannot be reproduced safely.');
        return { rateId: tax.tax_rate_details.tax_rate, amount: tax.amount, behavior: tax.tax_behavior };
    }).sort((a, b) => a.rateId.localeCompare(b.rateId));
}
function netAmount(line: Stripe.InvoiceLineItem) {
    const result = (line.subtotal ?? line.amount) - (line.discount_amounts || []).reduce((sum, discount) => sum + discount.amount, 0);
    if (!Number.isSafeInteger(result)) throw new Error('The quoted invoice amount is invalid.');
    return result;
}
function metadata(operationId: string, line: HostedPlanInvoiceLine) {
    return { billingOperationId: operationId, hostedLineKey: line.key, ...(line.originalPriceId ? { originalPriceId: line.originalPriceId } : {}),
        purpose: line.role === 'retention' ? 'consumed_benefit_retention' : 'plan_change_payment' };
}
export function hostedInvoiceItems(operationId: string, snapshot: HostedPlanInvoice): Stripe.InvoiceCreatePreviewParams.InvoiceItem[] {
    return snapshot.lines.map(line => ({ amount: invoiceItemAmount(line), currency: snapshot.currency,
        description: line.description, period: line.period, discountable: false, discounts: '', tax_behavior: line.taxBehavior,
        tax_rates: line.taxes.map(tax => tax.rateId), metadata: metadata(operationId, line) }));
}
function invoiceItemAmount(line: HostedPlanInvoiceLine) {
    return line.netAmountMinor + line.taxes.filter(tax => tax.behavior === 'inclusive').reduce((sum, tax) => sum + tax.amount, 0);
}
export function isSourceBaseCredit(line: Stripe.InvoiceLineItem, context: HostedPlanInvoiceContext): boolean {
    const parent = line.parent?.subscription_item_details;
    return line.amount < 0 && line.parent?.type === 'subscription_item_details' && parent?.proration === true
        && parent.subscription === context.subscriptionId && parent.subscription_item === context.baseItemId
        && line.period.start === context.prorationDate && line.period.end > line.period.start
        && (context.sourcePeriodEnd === undefined || line.period.end === context.sourcePeriodEnd);
}
/** A preview-only zero item prevents Stripe from inferring the next renewal. */
export async function previewIsolatedHostedInvoice(stripe: Stripe, customerId: string, currency: string, product: string,
    items: Stripe.InvoiceCreatePreviewParams.InvoiceItem[]): Promise<Stripe.Invoice> {
    const preview = await stripe.invoices.createPreview({ customer: customerId, currency, discounts: '',
        automatic_tax: { enabled: false }, invoice_items: items,
        subscription_details: { items: [{ quantity: 1, price_data: { product, currency,
            unit_amount: 0, recurring: { interval: 'month' }, tax_behavior: 'exclusive' } }] } });
    const sentinel = preview.lines.data.filter(line => line.parent?.type === 'subscription_item_details'
        && line.parent.subscription_item_details?.proration === false && line.pricing?.price_details?.product === product
        && /^0(?:\.0+)?$/.test(String(line.pricing.unit_amount_decimal ?? '')) && line.amount === 0 && line.subtotal === 0
        && line.quantity === 1 && line.currency === currency && !line.metadata?.hostedLineKey
        && (line.discount_amounts || []).every(discount => discount.amount === 0) && (line.taxes || []).every(tax => tax.amount === 0));
    if (preview.lines.has_more || sentinel.length !== 1 || preview.lines.data.length !== items.length + 1) throw new Error('The base-only invoice preview contains unexpected charges.');
    return { ...preview, lines: { ...preview.lines, data: preview.lines.data.filter(line => line !== sentinel[0]) } };
}
export function hostedLineTaxBasis(line: Stripe.InvoiceLineItem, price: Stripe.Price): Pick<HostedPlanInvoiceLine, 'netAmountMinor' | 'taxBehavior' | 'taxes'> {
    const appliedTaxes = taxes(line), taxBehavior: HostedPlanInvoiceLine['taxBehavior'] = price.tax_behavior === 'inclusive' ? 'inclusive'
        : price.tax_behavior === 'exclusive' ? 'exclusive' : appliedTaxes[0]?.behavior === 'inclusive' ? 'inclusive'
            : appliedTaxes[0]?.behavior === 'exclusive' ? 'exclusive' : 'unspecified';
    if (appliedTaxes.some(tax => tax.behavior !== taxBehavior)) throw new Error('Mixed tax behavior cannot be copied safely.');
    return { netAmountMinor: netAmount(line), taxBehavior, taxes: appliedTaxes };
}
/** Stripe must reproduce the retained PRETAX principal, including inclusive tax. */
export async function previewRetentionPrincipal(stripe: Stripe, operationId: string, customerId: string, currency: string, product: string,
    retainedMinor: number, source: Pick<HostedPlanInvoiceLine, 'netAmountMinor' | 'taxBehavior' | 'taxes'>, at: number): Promise<number> {
    if (!Number.isSafeInteger(retainedMinor) || retainedMinor <= 0 || !source.netAmountMinor) throw new Error('The retained principal is invalid.');
    const sourceNet = Math.abs(source.netAmountMinor), inclusiveTax = source.taxes.filter(tax => tax.behavior === 'inclusive').reduce((sum, tax) => sum + Math.abs(tax.amount), 0);
    let amount = source.taxBehavior === 'inclusive' ? Number((BigInt(retainedMinor) * BigInt(sourceNet + inclusiveTax) + BigInt(sourceNet - 1)) / BigInt(sourceNet)) : retainedMinor;
    for (let attempt = 0; attempt < 6; attempt++) {
        const preview = await previewIsolatedHostedInvoice(stripe, customerId, currency, product, [{ amount, currency,
            tax_behavior: source.taxBehavior, tax_rates: source.taxes.map(tax => tax.rateId), discounts: '', discountable: false,
            period: { start: at, end: at }, metadata: { purpose: 'consumed_benefit_retention', billingOperationId: operationId } }]);
        const line = preview.lines.data[0];
        if (line.currency !== currency || line.metadata?.billingOperationId !== operationId || (line.discount_amounts || []).some(discount => discount.amount)) throw new Error('The retained principal preview changed.');
        const actualNet = netAmount(line);
        if (actualNet === retainedMinor) return amount;
        amount += retainedMinor - actualNet;
        if (!Number.isSafeInteger(amount) || amount <= 0) break;
    }
    throw new Error('Stripe cannot reproduce the retained pretax principal exactly. No payment was requested.');
}
/** Freeze only the Stripe-computed base adjustment; usage stays on its ordinary subscription. */
export async function prepareHostedPlanInvoice(stripe: Stripe, operationId: string, customerId: string, sourcePriceId: string,
    targetPriceId: string, lifetime: boolean, invoice: Stripe.Invoice, context?: HostedPlanInvoiceContext): Promise<HostedPlanInvoice> {
    const lines: HostedPlanInvoiceLine[] = [];
    const prices = new Map<string, Stripe.Price>();
    const catalogPrice = async (id: string) => {
        let price = prices.get(id);
        if (!price) { price = await stripe.prices.retrieve(id); prices.set(id, price); }
        return price;
    };
    for (const line of invoice.lines.data) {
        const priceId = invoiceLinePriceId(line), retention = line.metadata?.purpose === 'consumed_benefit_retention'
            && line.metadata.billingOperationId === operationId;
        const paidSourceCredit = line.metadata?.purpose === 'paid_source_service_credit' && line.metadata.billingOperationId === operationId
            && line.metadata.paidSourcePriceId === sourcePriceId;
        const proration = line.parent?.subscription_item_details?.proration === true;
        const sourceCredit = context ? isSourceBaseCredit(line, context) : proration && line.amount < 0 && priceId === sourcePriceId;
        const targetProration = !lifetime && proration && priceId === targetPriceId && line.amount >= 0
            && (!context || line.parent?.subscription_item_details?.subscription === context.subscriptionId
                && line.parent.subscription_item_details.subscription_item === context.baseItemId && line.period.start === context.prorationDate);
        const lifetimePurchase = lifetime && priceId === targetPriceId && line.parent?.type === 'invoice_item_details'
            && line.metadata?.purpose === 'lifetime_purchase' && line.metadata.billingOperationId === operationId;
        // Changing the base interval can bill a full new term immediately,
        // rather than a target proration. Never mistake a future renewal for it.
        let immediateFullTerm = false;
        if (!lifetime && context?.intervalChange && Number.isSafeInteger(context.prorationDate) && context.prorationDate > 0
            && priceId === targetPriceId && line.amount > 0 && line.quantity === 1
            && line.period.start === context.prorationDate && line.period.end > line.period.start
            && line.parent?.type === 'subscription_item_details' && line.parent.subscription_item_details?.proration === false
            && line.parent.subscription_item_details.subscription === context.subscriptionId
            && line.parent.subscription_item_details.subscription_item === context.baseItemId) {
            const sourceInterval = (await catalogPrice(sourcePriceId)).recurring, targetInterval = (await catalogPrice(targetPriceId)).recurring;
            immediateFullTerm = Boolean(sourceInterval && targetInterval && (sourceInterval.interval !== targetInterval.interval
                || sourceInterval.interval_count !== targetInterval.interval_count));
        }
        if (!retention && !paidSourceCredit && !sourceCredit && !targetProration && !lifetimePurchase && !immediateFullTerm) continue;
        // Stripe previews give inline price_data a synthetic, unretrievable
        // Price ID. Our retention adjustment inherits the source base's tax
        // behavior; it never represents another catalog purchase or credit.
        if (retention && (line.amount <= 0 || netAmount(line) <= 0 || (line.discount_amounts || []).some(discount => discount.amount !== 0))) {
            throw new Error('The quoted retention adjustment is invalid.');
        }
        if (paidSourceCredit && (line.amount > 0 || netAmount(line) > 0 || (line.discount_amounts || []).some(discount => discount.amount !== 0))) {
            throw new Error('The paid source service credit is invalid.');
        }
        const price = retention || paidSourceCredit ? await catalogPrice(sourcePriceId) : priceId ? await catalogPrice(priceId) : undefined;
        if (!price) throw new Error('The quoted source Price is unavailable.');
        const { taxes: appliedTaxes, taxBehavior } = hostedLineTaxBasis(line, price);
        const originalPriceId = paidSourceCredit ? sourcePriceId : priceId;
        lines.push({ key: String(lines.length), ...(!retention && originalPriceId ? { originalPriceId } : {}), netAmountMinor: netAmount(line),
            description: line.description || (retention ? 'Consumed benefit retention' : 'Prorated plan change'), period: line.period,
            taxBehavior, taxes: appliedTaxes,
            role: retention ? 'retention' : paidSourceCredit || line.amount < 0 ? 'credit' : lifetime ? 'lifetime' : 'base' });
    }
    if (!lines.length || !lines.some(line => line.role === (lifetime ? 'lifetime' : 'base'))) throw new Error('The Stripe preview has no target base purchase.');
    const snapshot: HostedPlanInvoice = { lines, currency: invoice.currency, totalMinor: 0, amountDueMinor: 0 };
    const product = stripeObjectId((await catalogPrice(sourcePriceId)).product);
    if (!product) throw new Error('The source base product is unavailable for the isolated invoice preview.');
    const preview = await previewIsolatedHostedInvoice(stripe, customerId, invoice.currency, product, hostedInvoiceItems(operationId, snapshot));
    for (const line of lines) {
        const actual = preview.lines.data.find(row => row.metadata?.hostedLineKey === line.key);
        if (!actual || netAmount(actual) !== line.netAmountMinor || JSON.stringify(taxes(actual)) !== JSON.stringify(line.taxes)) {
            throw new Error('Stripe could not reproduce the quoted discounts or taxes. No payment was requested.');
        }
    }
    snapshot.totalMinor = preview.total; snapshot.amountDueMinor = Math.max(0, preview.amount_due);
    return snapshot;
}

/** This proof is shared by fulfillment, cash attribution and voluntary-invoice debt handling. */
export async function assertHostedPlanInvoice(operation: BillingChangeOperation, invoice: Stripe.Invoice, stripe: Stripe): Promise<void> {
    const expected = operation.hostedInvoice;
    if (operation.paymentMode !== 'hosted_invoice' || !expected || invoice.id !== operation.invoiceId
        || stripeObjectId(invoice.customer) !== operation.customerId || invoice.metadata?.billingOperationId !== operation._id
        || invoice.metadata.purpose !== 'plan_change_payment' || invoice.metadata.sourceSubscriptionId !== operation.subscriptionId
        || invoice.currency !== expected.currency || invoice.total !== expected.totalMinor
        || Math.max(0, invoice.amount_due) !== expected.amountDueMinor) throw new HostedPlanInvoiceMismatchError('The plan-change invoice does not match its confirmed quote.');
    const lines = await completeInvoiceLines(stripe, invoice);
    if (lines.length !== expected.lines.length || new Set(lines.map(line => line.metadata?.hostedLineKey)).size !== lines.length) throw new HostedPlanInvoiceMismatchError('Unexpected plan-change invoice lines.');
    for (const frozen of expected.lines) {
        const actual = lines.find(line => line.metadata?.hostedLineKey === frozen.key);
        if (!actual || actual.currency !== expected.currency || actual.metadata.billingOperationId !== operation._id
            || (actual.metadata.originalPriceId || undefined) !== frozen.originalPriceId || netAmount(actual) !== frozen.netAmountMinor
            || (actual.discount_amounts || []).some(discount => discount.amount !== 0)
            || actual.period.start !== frozen.period.start || actual.period.end !== frozen.period.end
            || JSON.stringify(taxes(actual)) !== JSON.stringify(frozen.taxes)) throw new HostedPlanInvoiceMismatchError('A plan-change invoice line differs from the confirmed Stripe calculation.');
    }
}

/** A non-paid invoice can still have an in-flight or partially paid payment.
 * Default invoice intents are retired through voiding, never canceled directly. */
export async function assertHostedInvoiceCancellationSafe(operation: BillingChangeOperation, invoice: Stripe.Invoice, stripe: Stripe,
    stage: 'before_void' | 'after_void', expectedIntentIds?: string[]): Promise<string[]> {
    await assertHostedPlanInvoice(operation, invoice, stripe);
    if (getInvoiceSubscriptionId(invoice) || invoice.status !== (stage === 'before_void' ? 'open' : 'void')
        || !Number.isSafeInteger(invoice.amount_paid) || invoice.amount_paid !== 0 || (invoice.amount_overpaid || 0) !== 0) {
        throw new Error('The upgrade payment is already paid or cannot be safely canceled. Retry after payment confirmation.');
    }
    const intentIds: string[] = [];
    for await (const payment of stripe.invoicePayments.list({ invoice: invoice.id, limit: 100 })) {
        if (stripeObjectId(payment.invoice) !== invoice.id || payment.currency !== invoice.currency || !payment.is_default
            || payment.payment.type !== 'payment_intent' || (payment.amount_paid || 0) !== 0
            || !['open', 'canceled'].includes(payment.status)) {
            throw new Error('The upgrade has a payment that still needs confirmation. Retry shortly.');
        }
        const id = stripeObjectId(payment.payment.payment_intent);
        if (!id || intentIds.includes(id) || stage === 'after_void' && payment.status === 'open' && !expectedIntentIds?.includes(id)) {
            throw new Error('The upgrade payment identity needs reconciliation.');
        }
        const intent = await stripe.paymentIntents.retrieve(id);
        // Stripe can leave the default InvoicePayment link open after voiding.
        // Only its previously recorded, canceled intent proves no further charge.
        if (intent.id !== id || stripeObjectId(intent.customer) !== operation.customerId || intent.currency !== invoice.currency
            || intent.amount_received !== 0 || (stage === 'after_void' ? intent.status !== 'canceled'
                : !['requires_payment_method', 'requires_confirmation', 'requires_action', 'canceled'].includes(intent.status))) {
            throw new Error('The upgrade payment is being confirmed. Your usage will resume after its result is verified.');
        }
        intentIds.push(id);
    }
    if (intentIds.length !== 1 || expectedIntentIds && JSON.stringify([...expectedIntentIds].sort()) !== JSON.stringify([...intentIds].sort())) {
        throw new Error('The complete upgrade payment cancellation proof is unavailable. Retry shortly.');
    }
    return intentIds;
}

/** Only this operation's isolated, unpaid base lines may be discarded. Meter invoices never enter here. */
export async function voidUnpaidHostedPlanInvoice(operation: BillingChangeOperation, stripe: Stripe, beforeMutation: () => Promise<unknown>): Promise<boolean> {
    if (!operation.invoiceId || !operation.hostedInvoice) return false;
    const invoice = await stripe.invoices.retrieve(operation.invoiceId);
    if (invoice.status === 'paid' || stripeObjectId(invoice.customer) !== operation.customerId
        || invoice.metadata?.billingOperationId !== operation._id || invoice.metadata.purpose !== 'plan_change_payment'
        || invoice.metadata.sourceSubscriptionId !== operation.subscriptionId || getInvoiceSubscriptionId(invoice)) return false;
    const lines = await completeInvoiceLines(stripe, invoice);
    if (lines.some(line => line.metadata?.billingOperationId !== operation._id || !operation.hostedInvoice!.lines.some(frozen =>
        frozen.key === line.metadata.hostedLineKey && (line.metadata.originalPriceId || undefined) === frozen.originalPriceId))) return false;
    await beforeMutation();
    if (invoice.status === 'draft') await stripe.invoices.del(invoice.id, {}, { idempotencyKey: `hosted-plan-discard:${operation._id}` });
    else if (invoice.status === 'open') await stripe.invoices.voidInvoice(invoice.id, {}, { idempotencyKey: `hosted-plan-discard:${operation._id}` });
    else if (invoice.status !== 'void') return false;
    return true;
}

export function hostedInvoiceCreateParams(operation: BillingChangeOperation): Stripe.InvoiceCreateParams {
    return { customer: operation.customerId, currency: operation.hostedInvoice!.currency, collection_method: 'send_invoice', days_until_due: 1,
        auto_advance: false, discounts: '', automatic_tax: { enabled: false }, pending_invoice_items_behavior: 'exclude',
        description: `Immediate change to ${operation.target.name}; your current plan continues until payment is confirmed.`,
        metadata: { billingOperationId: operation._id, purpose: 'plan_change_payment', sourceSubscriptionId: operation.subscriptionId } };
}
export async function createHostedPlanInvoice(operation: BillingChangeOperation, stripe: Stripe, save: () => Promise<void>, beforeMutation: () => Promise<unknown>): Promise<Stripe.Invoice> {
    if (!operation.invoiceId) {
        let recovered: Stripe.Invoice | undefined;
        for await (const candidate of stripe.invoices.list({ customer: operation.customerId,
            created: { gte: Math.floor(operation.invoiceStartedAt!.getTime() / 1000) - 60 }, limit: 100 })) {
            if (candidate.metadata?.billingOperationId !== operation._id || candidate.metadata.purpose !== 'plan_change_payment') continue;
            if (recovered) throw new Error('Multiple invoices match this plan change.');
            recovered = candidate;
        }
        if (!recovered && Date.now() - operation.invoiceStartedAt!.getTime() > 23 * 60 * 60_000) throw new Error('The previous invoice creation result requires financial review.');
        await beforeMutation();
        const invoice = recovered || await stripe.invoices.create(hostedInvoiceCreateParams(operation), { idempotencyKey: `hosted-plan-invoice:${operation._id}` });
        operation.invoiceId = invoice.id; await save();
    }
    let invoice = await stripe.invoices.retrieve(operation.invoiceId);
    if (invoice.status === 'draft') {
        const existing = await completeInvoiceLines(stripe, invoice);
        for (const line of operation.hostedInvoice!.lines) {
            if (existing.some(row => row.metadata?.hostedLineKey === line.key)) continue;
            await beforeMutation();
            await stripe.invoiceItems.create({ customer: operation.customerId, invoice: invoice.id, amount: invoiceItemAmount(line),
                currency: operation.hostedInvoice!.currency, description: line.description, period: line.period, tax_behavior: line.taxBehavior,
                tax_rates: line.taxes.map(tax => tax.rateId), discountable: false, discounts: '', metadata: metadata(operation._id, line) },
            { idempotencyKey: `hosted-plan-line:${operation._id}:${line.key}` });
        }
        invoice = await stripe.invoices.retrieve(invoice.id);
        await assertHostedPlanInvoice(operation, invoice, stripe);
        await beforeMutation();
        invoice = await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: false }, { idempotencyKey: `hosted-plan-finalize:${operation._id}` });
    }
    await assertHostedPlanInvoice(operation, invoice, stripe);
    return invoice;
}
