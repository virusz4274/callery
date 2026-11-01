import { createHash, randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { Collections } from '@/lib/mongodb';
import type { Plan, User } from '@/lib/db/types';
import { billingDependencies, type BillingDependencies } from './runtime';
import { billingFence, BillingBusyError, withBillingLease } from './billing-lock';
import { hasVerifiedMetering, sourcePlanUsableWhileAwaitingPayment, type BillingOperationSummary } from './billing-types';
import { BillingConfigurationError, validateCheckoutPlan, validateMeterPrices, verifiedSubscriptionMeters } from './metering';
import { stripeObjectId, invoiceLinePriceId, getInvoiceSubscriptionId } from './objects';
import { reservePlanCredit, settlePlanCredit } from './plan-credit-economics';
import { completeInvoiceLines, syncPaidInvoiceFunding } from './invoice-funding';
import { accountWithoutPendingPlanCredit, ensureBillingPeriod, getBillingAccount, reserveCost, reserveEntitlementOperatingCosts } from './ledger';
import { PendingPlanCreditBlocksUsageError } from './billing-errors';
import { BILLING_CATALOG } from './catalog';
import { flushUsageEvents } from './usage-queue';
import { reconcileUsageProcessing } from './usage-queue';
import { drainLedgerOutbox } from './usage';
import { assertPublishedPlan } from './catalog-publication';
import { verifyUsageInvoice } from './invoice-verification';
import { DELETED_BILLING_ACCOUNTS } from './financial-settlement';
import { assertCompletePublishedUsageCatalog, assertPrepaidGrantsCoverTarget } from './grant-prices';
import type { UsageTariffPair } from './usage-tariff';
import { resolveCatalogPlan } from './catalog-bundle';
import { ensureUsageGrantScope } from './grant-transfer';
import { usagePricePresentation, type UsagePricePresentation } from './usage-presentation';
import { prepareHostedPlanInvoice, createHostedPlanInvoice, assertHostedPlanInvoice, assertHostedInvoiceCancellationSafe, isSourceBaseCredit, hostedLineTaxBasis, voidUnpaidHostedPlanInvoice, HostedPlanInvoiceMismatchError, type HostedPlanInvoice, type HostedPlanInvoiceContext } from './plan-change-payment';
import { previewPaidSourceServiceCredit, type PaidSourceServiceCreditBasis } from './paid-source-service';
import { assertOwnedSchedule, cancelOwnedBillingScheduleForClosedAccount, coordinateBillingSchedule, NORMAL_PRORATION_POLICY_VERSION, releaseScheduleForPaidUpgrade, syncOwnedBillingScheduleBoundary } from './subscription-schedule';
import { hasBlockingBillingReview } from './financial-review';
import { assertCurrentBasePeriodPaid } from './paid-base-service';

export const BILLING_OPERATIONS = 'billing_operations';
export class BillingChangeError extends Error { constructor(message: string, public status = 409) { super(message); } }
export interface BillingChangePreview {
    id: string; expiresAt: string; effectiveAt: string; targetPlanKey: string; currency: string;
    targetCatalogVersion?: string; usagePricing?: UsagePricePresentation;
    amountDueMinor: number; baseCreditMinor: number; retainedCreditMinor: number; usageChargesMinor: number;
    lines: { description: string; amountMinor: number }[]; requiresPayment: boolean;
    storageOverageConsent: boolean; retainedStorageBytes: number; rates: UsageTariffPair;
    timing?: 'immediate' | 'period_end'; scheduled?: boolean;
}
export interface BillingChangeOperation {
    _id: string; authSubject: string; customerId: string; subscriptionId: string; state: BillingOperationSummary['state'];
    kind: BillingOperationSummary['kind']; sourceFingerprint: string; sourcePlanKey: string; target: Plan;
    createdAt: Date; updatedAt: Date; expiresAt: Date; prorationDate: number;
    params: Stripe.SubscriptionUpdateParams; preview: BillingChangePreview;
    previousInvoiceId?: string; invoiceId?: string; paymentUrl?: string; error?: string;
    remoteStartedAt?: Date; creditReserved?: boolean; appliedAt?: Date;
    paymentRejectedAt?: Date; cleanupCompletedAt?: Date;
    paymentMode?: 'hosted_invoice'; hostedInvoice?: HostedPlanInvoice; invoiceStartedAt?: Date; paymentExpiresAt?: Date; sourcePlanUsable?: boolean;
    sourceUsageCancellation?: { startedAt: Date; paymentIntentIds: string[] };
    sourceServiceCredit?: PaidSourceServiceCreditBasis;
    sourceControlFingerprint?: string; sourceBasePriceId?: string; sourceMeterItemIds?: string[];
    revision?: number; sourceLocalFingerprint?: string;
    sourceMeterPriceIds?: { storage: string; transcription: string }; usageTariffs?: UsageTariffPair;
    creditPolicyVersion?: string;
    /** New quotes use ordinary Stripe proration; older accepted operations retain their policy. */
    scheduledChange?: boolean;
    scheduleCancellationPending?: boolean;
    scheduleRestoredAt?: Date;
}
const liveStates = ['draining', 'applying', 'awaiting_payment', 'needs_review'];
const SOURCE_USAGE_CANCELLATION_MESSAGE = 'The unpaid upgrade was canceled so your current paid plan can keep working. Request a fresh upgrade quote when you are ready to pay.';
export const isBlockingBillingOperation = (user: Pick<User, 'billingOperation'>) => Boolean(user.billingOperation && liveStates.includes(user.billingOperation.state));

export function subscriptionFingerprint(subscription: Stripe.Subscription): string {
    return createHash('sha256').update(JSON.stringify({ id: subscription.id, customer: stripeObjectId(subscription.customer), status: subscription.status,
        currency: subscription.currency, mode: subscription.billing_mode, schedule: stripeObjectId(subscription.schedule),
        cancelAt: subscription.cancel_at, cancelAtEnd: subscription.cancel_at_period_end, discount: subscription.discounts,
        tax: subscription.automatic_tax, rates: subscription.default_tax_rates, items: subscription.items.data.map(item => ({
            id: item.id, price: item.price.id, quantity: item.quantity, start: item.current_period_start, end: item.current_period_end,
        })).sort((a, b) => a.id.localeCompare(b.id)) })).digest('hex');
}
function subscriptionControlFingerprint(subscription: Stripe.Subscription): string {
    return createHash('sha256').update(JSON.stringify({ controls: subscriptionFingerprint({ ...subscription,
        items: { ...subscription.items, data: [] } }), anchor: subscription.billing_cycle_anchor })).digest('hex');
}
function localSourceFingerprint(user: User): string {
    return createHash('sha256').update(JSON.stringify({ entitlement: user.billingEntitlement || null,
        generation: user.stripeCustomerGeneration || 0, customerId: user.stripeCustomerId, planKey: user.planKey })).digest('hex');
}
export function operationSummary(operation: BillingChangeOperation): BillingOperationSummary {
    return { id: operation._id, state: operation.state, kind: operation.kind, targetPlanKey: operation.target.key,
        amountDueMinor: operation.preview.amountDueMinor, currency: operation.preview.currency,
        createdAt: operation.createdAt, updatedAt: operation.updatedAt,
        ...(operation.invoiceId ? { invoiceId: operation.invoiceId } : {}), ...(operation.paymentUrl ? { paymentUrl: operation.paymentUrl } : {}),
        timing: operation.preview.timing || 'immediate', effectiveAt: new Date(operation.preview.effectiveAt), scheduled: operation.state === 'scheduled',
        ...(operation.error ? { error: operation.error } : {}), ...(operation.sourcePlanUsable && operation.state === 'awaiting_payment' ? { sourcePlanUsable: true } : {}) };
}
export async function assertCustomerDebtFree(stripe: Stripe, customer: string): Promise<void> {
    for (const status of ['open', 'uncollectible'] as const) {
        for await (const invoice of stripe.invoices.list({ customer, status, limit: 100 })) {
            if (invoice.amount_remaining > 0) throw new BillingChangeError('Pay outstanding invoices before changing plans.');
        }
    }
}
function validateAccount(user: User) {
    if (user.disabled || user.softDelete?.isDeleted || user.teamInvitationPending) throw new BillingChangeError('Account unavailable.', 403);
    if (hasBlockingBillingReview(user.billingReview)) throw new BillingChangeError('Billing needs administrator review before changing plans.');
    if (user.lifetimePurchase) throw new BillingChangeError('Lifetime ownership is already permanent. Manage usage credit instead.');
    if (!user.stripeCustomerId || !user.stripeSubscriptionId) throw new BillingChangeError('Choose a plan through Checkout first.');
}
function assertCurrentSubscription(user: User, subscription: Stripe.Subscription, target: Plan, sourceIds: { storage: string; transcription: string }) {
    if (stripeObjectId(subscription.customer) !== user.stripeCustomerId || subscription.id !== user.stripeSubscriptionId) throw new BillingChangeError('Subscription identity changed.');
    if (subscription.billing_mode?.type !== 'flexible' || subscription.collection_method !== 'charge_automatically') throw new BillingConfigurationError('Plan changes require flexible automatic billing.');
    if (subscription.status !== 'active' || subscription.pending_update || subscription.cancel_at || subscription.cancel_at_period_end) throw new BillingChangeError('Resolve payment or scheduled cancellation before choosing another plan.');
    const base = subscription.items.data.filter(item => item.price.recurring?.usage_type !== 'metered');
    if (base.length !== 1 || base[0].quantity !== 1 || subscription.items.has_more) throw new BillingChangeError('Unexpected subscription items require review.');
    if (base[0].price.id === target.stripePriceId) throw new BillingChangeError('This is already your active plan.');
    if (!verifiedSubscriptionMeters(subscription, sourceIds)) {
        throw new BillingChangeError('The current monthly usage prices require verification before a plan change.');
    }
    return base[0];
}
function previewItems(params: Stripe.SubscriptionUpdateParams): Stripe.InvoiceCreatePreviewParams.InvoiceItem[] {
    return (params.add_invoice_items || []).map(item => ({ price: item.price, price_data: item.price_data, quantity: item.quantity,
        discountable: item.discountable, metadata: item.metadata, tax_rates: item.tax_rates }));
}
async function previewInvoice(stripe: Stripe, operation: Pick<BillingChangeOperation, 'customerId' | 'subscriptionId' | 'params' | 'prorationDate'>) {
    return stripe.invoices.createPreview({ customer: operation.customerId, subscription: operation.subscriptionId,
        subscription_details: { items: operation.params.items, billing_cycle_anchor: { type: 'unchanged' },
            proration_behavior: 'always_invoice', proration_date: operation.prorationDate },
        invoice_items: previewItems(operation.params) });
}

function isOperationInvoice(invoice: Stripe.Invoice, operation: BillingChangeOperation): boolean {
    if (operation.paymentMode === 'hosted_invoice') return invoice.id === operation.invoiceId
        && invoice.metadata?.billingOperationId === operation._id && invoice.metadata.purpose === 'plan_change_payment'
        && invoice.metadata.sourceSubscriptionId === operation.subscriptionId && stripeObjectId(invoice.customer) === operation.customerId;
    const identity = invoice.metadata?.billingOperationId || invoice.parent?.subscription_details?.metadata?.billingOperationId;
    return identity === operation._id && stripeObjectId(invoice.customer) === operation.customerId
        && getInvoiceSubscriptionId(invoice) === operation.subscriptionId
        && ['subscription_update', 'manual'].includes(invoice.billing_reason || '');
}

async function recoverOperationInvoice(stripe: Stripe, subscription: Stripe.Subscription, operation: BillingChangeOperation): Promise<string | undefined> {
    if (operation.invoiceId) return operation.invoiceId;
    const latestId = stripeObjectId(subscription.latest_invoice);
    if (latestId && latestId !== operation.previousInvoiceId) {
        const latest = await stripe.invoices.retrieve(latestId);
        if (isOperationInvoice(latest, operation)) return latest.id;
    }
    let found: string | undefined;
    for await (const invoice of stripe.invoices.list({ customer: operation.customerId, subscription: operation.subscriptionId,
        created: { gte: Math.floor(operation.remoteStartedAt!.getTime() / 1000) - 60 }, limit: 100 })) {
        if (!isOperationInvoice(invoice, operation)) continue;
        if (found && found !== invoice.id) throw new BillingChangeError('Multiple invoices match this billing change. Administrator review is required.');
        found = invoice.id;
    }
    if (!found && latestId && latestId !== operation.previousInvoiceId) throw new BillingChangeError('The billing change invoice must be identified before activation.');
    return found;
}

export async function createPlanChangePreview(subject: string, targetKey: string, dependencies?: BillingDependencies): Promise<BillingChangePreview> {
    const { db, stripe } = await billingDependencies(dependencies);
    return withBillingLease(db, subject, async (user, owner) => {
        validateAccount(user);
        await syncOwnedBillingScheduleBoundary(user, owner, { db, stripe });
        if (isBlockingBillingOperation(user)) throw new BillingChangeError('Finish the existing billing change first.');
        const targetEntry = await resolveCatalogPlan(targetKey, db);
        const target = { ...targetEntry.plan, usageTariffs: targetEntry.usageTariffs };
        const targetCatalog = await assertPublishedPlan(target, db);
        await assertCompletePublishedUsageCatalog(target, db, stripe);
        const targetPrice = await validateCheckoutPlan(stripe, target);
        if (targetPrice.currency !== 'usd') throw new BillingConfigurationError('The managed prepaid catalog is denominated in USD.');
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId!);
        await assertOwnedSchedule(subscription, user, { db, stripe });
        const sourceIds = { storage: user.billingUsageTariffs?.storage.priceId || '', transcription: user.billingUsageTariffs?.transcription.priceId || '' };
        await validateMeterPrices(stripe, sourceIds, subscription.currency, undefined, 'recurring', user.billingUsageTariffs, true);
        const base = assertCurrentSubscription(user, subscription, target, sourceIds);
        const targetIds = { storage: target.stripeStoragePriceId || '', transcription: target.stripeTranscriptionPriceId || '' };
        await assertCustomerDebtFree(stripe, user.stripeCustomerId!);
        const previousInvoice = stripeObjectId(subscription.latest_invoice);
        if (previousInvoice) await syncPaidInvoiceFunding(previousInvoice, { db, stripe });
        const fresh = await db.collection<User>(Collections.USERS).findOne({ _id: user._id });
        if (!fresh) throw new BillingChangeError('Account unavailable.');
        const now = new Date(), id = randomUUID();
        const params: Stripe.SubscriptionUpdateParams = { items: [target.interval === 'lifetime'
            ? { id: base.id, deleted: true } : { id: base.id, price: target.stripePriceId, quantity: 1 },
            ...(sourceIds.storage !== targetIds.storage ? [{ id: subscription.items.data.find(item => item.price.id === sourceIds.storage)!.id, price: targetIds.storage }] : []),
            ...(sourceIds.transcription !== targetIds.transcription ? [{ id: subscription.items.data.find(item => item.price.id === sourceIds.transcription)!.id, price: targetIds.transcription }] : [])],
            // A failed charge must leave the already-paid subscription intact.
            // Pending updates can discard metered usage when their invoice expires.
            proration_behavior: 'always_invoice', payment_behavior: 'error_if_incomplete', billing_cycle_anchor: { type: 'unchanged' },
            proration_date: Math.floor(now.getTime() / 1000), metadata: { billingOperationId: id, selectedPlanKey: target.key, selectedPriceId: target.stripePriceId,
                billingCatalogVersion: target.billingCatalogVersion || '', tariffVersion: BILLING_CATALOG.version },
            ...(target.interval === 'lifetime' ? { add_invoice_items: [{ price: target.stripePriceId, quantity: 1, discountable: false,
                metadata: { billingOperationId: id, purpose: 'lifetime_purchase' } }] } : {}) };
        const operation = { _id: id, authSubject: subject, customerId: user.stripeCustomerId!, subscriptionId: subscription.id,
            state: 'quoted' as const, kind: target.interval === 'lifetime' ? 'lifetime_conversion' as const : 'plan_change' as const,
            sourceFingerprint: subscriptionFingerprint(subscription), sourcePlanKey: user.planKey, target,
            createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 10 * 60_000),
            prorationDate: params.proration_date!, params, previousInvoiceId: previousInvoice || undefined, sourceMeterPriceIds: sourceIds,
            usageTariffs: targetCatalog.usageTariffs, sourceControlFingerprint: subscriptionControlFingerprint(subscription), sourceBasePriceId: base.price.id,
            sourceMeterItemIds: subscription.items.data.filter(item => item.price.recurring?.usage_type === 'metered').map(item => item.id).sort(),
            revision: 0, sourceLocalFingerprint: localSourceFingerprint(user), creditPolicyVersion: NORMAL_PRORATION_POLICY_VERSION };
        const monthlyAmount = (price: Stripe.Price) => Number(price.unit_amount_decimal ?? price.unit_amount ?? 0)
            / (price.recurring?.interval === 'year' ? 12 * (price.recurring.interval_count || 1) : price.recurring?.interval_count || 1);
        if (target.interval !== 'lifetime' && monthlyAmount(targetPrice) < monthlyAmount(base.price)) {
            if (await db.collection<BillingChangeOperation>(BILLING_OPERATIONS).findOne({ authSubject: subject, state: 'scheduled' })) {
                throw new BillingChangeError('Cancel the existing scheduled downgrade before choosing another.');
            }
            const effectiveAt = new Date(base.current_period_end * 1000);
            if (effectiveAt <= now) throw new BillingChangeError('The current plan is renewing. Request a fresh preview shortly.');
            const tariffs = user.billingUsageTariffs || targetCatalog.usageTariffs;
            const preview: BillingChangePreview = { id, expiresAt: operation.expiresAt.toISOString(), effectiveAt: effectiveAt.toISOString(), targetPlanKey: target.key,
                currency: subscription.currency, amountDueMinor: 0, baseCreditMinor: 0, retainedCreditMinor: 0, usageChargesMinor: 0, lines: [], requiresPayment: false,
                storageOverageConsent: user.storageUsed > target.limits.storage && target.limits.storage < user.storageAllocation,
                retainedStorageBytes: Math.max(0, user.storageUsed - target.limits.storage), targetCatalogVersion: target.billingCatalogVersion,
                usagePricing: usagePricePresentation('recurring', tariffs), rates: tariffs, timing: 'period_end', scheduled: true };
            await db.collection<BillingChangeOperation>(BILLING_OPERATIONS).insertOne({ ...operation, preview, scheduledChange: true, usageTariffs: tariffs });
            return preview;
        }
        const raw = await previewInvoice(stripe, operation);
        if (raw.lines.has_more) throw new BillingChangeError('A complete invoice preview is required before confirmation.');
        const context: HostedPlanInvoiceContext = { prorationDate: operation.prorationDate, subscriptionId: subscription.id, baseItemId: base.id,
            sourcePeriodEnd: base.current_period_end,
            intervalChange: Boolean(base.price.recurring && targetPrice.recurring && (base.price.recurring.interval !== targetPrice.recurring.interval
                || base.price.recurring.interval_count !== targetPrice.recurring.interval_count)) };
        const nativeCredits = raw.lines.data.filter(line => isSourceBaseCredit(line, context));
        const paidSource = await previewPaidSourceServiceCredit(fresh, subscription, base, id, operation.prorationDate, { db, stripe });
        const nativeBasis = await Promise.all(nativeCredits.map(async line => hostedLineTaxBasis(line, await stripe.prices.retrieve(invoiceLinePriceId(line)!))));
        const unused = paidSource ? paidSource.unusedMinor : -nativeBasis.reduce((sum, line) => sum + line.netAmountMinor, 0);
        const creditAccount = await db.collection<User>(Collections.USERS).findOne(billingFence(user, owner));
        if (!creditAccount) throw new BillingBusyError();
        if (!Number.isSafeInteger(unused) || unused < 0) throw new BillingConfigurationError('Stripe returned an invalid unused-time credit.');
        const allowed = unused;
        const retained = 0;
        const final = raw;
        if (final.lines.has_more) throw new BillingChangeError('A complete invoice preview is required before confirmation.');
        const quoted = paidSource ? { ...final, lines: { ...final.lines,
            data: [...final.lines.data.filter(line => !isSourceBaseCredit(line, context)), paidSource.line] } } : final;
        const hostedInvoice = await prepareHostedPlanInvoice(stripe, id, operation.customerId, base.price.id, target.stripePriceId, target.interval === 'lifetime', quoted, context);
        const actualCredit = -hostedInvoice.lines.filter(line => line.role === 'credit' || line.role === 'retention').reduce((sum, line) => sum + line.netAmountMinor, 0);
        if (actualCredit !== allowed) throw new BillingConfigurationError('Stripe could not reproduce the unused-time plan credit. No payment was requested.');
        const prepaidStorage = Math.max(0, fresh.storageUsed - target.limits.storage);
        const preview: BillingChangePreview = { id, expiresAt: operation.expiresAt.toISOString(), effectiveAt: now.toISOString(), targetPlanKey: target.key,
            currency: hostedInvoice.currency, amountDueMinor: hostedInvoice.amountDueMinor, baseCreditMinor: allowed, retainedCreditMinor: retained,
            usageChargesMinor: 0,
            lines: hostedInvoice.lines.map(line => ({ description: line.description, amountMinor: line.netAmountMinor + line.taxes.reduce((sum, tax) => sum + tax.amount, 0) })),
            requiresPayment: hostedInvoice.amountDueMinor > 0, storageOverageConsent: prepaidStorage > 0 && target.limits.storage < fresh.storageAllocation,
            retainedStorageBytes: prepaidStorage, targetCatalogVersion: target.billingCatalogVersion,
            usagePricing: usagePricePresentation(target.interval === 'lifetime' ? 'lifetime' : 'recurring', targetCatalog.usageTariffs), rates: targetCatalog.usageTariffs, timing: 'immediate', scheduled: false };
        if (!await db.collection<User>(Collections.USERS).findOne(billingFence(user, owner))) throw new BillingBusyError();
        await db.collection<BillingChangeOperation>(BILLING_OPERATIONS).insertOne({ ...operation, preview, paymentMode: 'hosted_invoice', hostedInvoice,
            ...(paidSource ? { sourceServiceCredit: paidSource.basis } : {}) });
        return preview;
    });
}

/** Admission stops before checking every local/provider billing boundary. Existing accepted work can finish. */
async function assertDrained(subject: string, dependencies: BillingDependencies) {
    const { db } = dependencies;
    const current = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject });
    if (!current) throw new BillingChangeError('Account unavailable.');
    const account = getBillingAccount(current);
    if (Object.values(account.reservations).some(row => row.state === 'reserved') || Object.keys(current.uploadReservations || {}).length
        || await db.collection(Collections.RECORDINGS).countDocuments({ authSubject: subject, transcriptionStatus: { $in: ['processing', 'queued'] } })) {
        throw new BillingChangeError('Previously accepted uploads or AI work are still finishing. Retry this change after they complete.');
    }
    if (Object.keys(account.outbox).length) throw new BillingChangeError('Usage receipts are still being prepared. Retry shortly.');
    if (!dependencies.stripe) return;
    if (await db.collection(Collections.USAGE_EVENTS).countDocuments({ authSubject: subject, value: { $gt: 0 }, processingStatus: { $ne: 'processed' } })) {
        throw new BillingChangeError('Previously accepted usage is still being delivered. Retry shortly.');
    }
}
async function assertOperationLease(operation: BillingChangeOperation, dependencies: BillingDependencies, user: User, owner: string) {
    const accounts = dependencies.db.collection<User>(await dependencies.db.collection<User>(Collections.USERS).findOne({ _id: user._id }) ? Collections.USERS : DELETED_BILLING_ACCOUNTS);
    if (user.stripeCustomerId !== operation.customerId || !await accounts.findOne(billingFence(user, owner))) throw new BillingBusyError();
    if (!await dependencies.db.collection<BillingChangeOperation>(BILLING_OPERATIONS).findOne({ _id: operation._id,
        revision: operation.revision ?? { $exists: false } })) throw new BillingBusyError();
    return accounts;
}
async function saveOperation(operation: BillingChangeOperation, dependencies: BillingDependencies, user: User, owner: string) {
    const accounts = await assertOperationLease(operation, dependencies, user, owner);
    operation.updatedAt = new Date();
    const { _id, ...fields } = operation;
    const changed = await dependencies.db.collection<BillingChangeOperation>(BILLING_OPERATIONS).updateOne({ _id,
        revision: operation.revision ?? { $exists: false } }, { $set: { ...fields, revision: (operation.revision || 0) + 1 },
        ...(!Object.prototype.hasOwnProperty.call(operation, 'error') ? { $unset: { error: '' as const } } : {}) });
    if (!changed.matchedCount) throw new BillingBusyError();
    operation.revision = (operation.revision || 0) + 1;
    const fresh = await accounts.findOne(billingFence(user, owner));
    if (!fresh) throw new BillingBusyError();
    if (fresh.billingOperation?.id === operation._id) {
        const summary = await accounts.updateOne({ ...billingFence(user, owner), 'billingOperation.id': operation._id },
            { $set: { billingOperation: operationSummary(operation), updatedAt: new Date() } });
        if (!summary.matchedCount) throw new BillingBusyError();
    }
}

async function finishCanceledOperation(operation: BillingChangeOperation, runtime: BillingDependencies, user: User, owner: string) {
    await assertOperationLease(operation, runtime, user, owner);
    if (operation.scheduleCancellationPending) {
        if (user.disabled || user.softDelete?.isDeleted || !await runtime.db.collection<User>(Collections.USERS).findOne({ _id: user._id })) {
            await cancelOwnedBillingScheduleForClosedAccount(user, owner, runtime);
        } else await coordinateBillingSchedule(user, owner, runtime);
        operation.scheduleCancellationPending = false;
    }
    if (operation.sourceUsageCancellation) {
        if (!operation.invoiceId) throw new BillingChangeError('The canceled upgrade payment still needs confirmation. Retry shortly.');
        await assertHostedInvoiceCancellationSafe(operation, await runtime.stripe.invoices.retrieve(operation.invoiceId), runtime.stripe,
            'after_void', operation.sourceUsageCancellation.paymentIntentIds);
        await assertOperationLease(operation, runtime, user, owner);
        operation.error = SOURCE_USAGE_CANCELLATION_MESSAGE;
    }
    if (operation.creditReserved) await settlePlanCredit(user.authSubject, operation._id, false, runtime.db);
    const accounts = runtime.db.collection<User>(await runtime.db.collection<User>(Collections.USERS).findOne({ _id: user._id }) ? Collections.USERS : DELETED_BILLING_ACCOUNTS);
    if (user.billingOperation?.id === operation._id) {
        const cleared = await accounts.updateOne(billingFence(user, owner), { $unset: { billingOperation: '' } });
        if (!cleared.matchedCount) throw new BillingBusyError();
    }
    operation.cleanupCompletedAt = new Date();
    await saveOperation(operation, runtime, user, owner);
}

/** Customer-selected policy: an unpaid upgrade must not reserve the last funds
 * needed by an otherwise affordable operation on the already-paid source plan. */
export async function cancelUnpaidUpgradeForSourceUsage(subject: string, conflict: PendingPlanCreditBlocksUsageError, dependencies?: BillingDependencies): Promise<void> {
    const runtime = await billingDependencies(dependencies), { db, stripe } = runtime;
    await withBillingLease(db, subject, async (user, owner) => {
        const operation = await db.collection<BillingChangeOperation>(BILLING_OPERATIONS).findOne({ _id: conflict.operationId, authSubject: subject });
        if (!operation) throw new BillingChangeError('The pending upgrade changed. Retry with your current plan.');
        await assertOperationLease(operation, runtime, user, owner);
        if (operation.state === 'canceled' && operation.sourceUsageCancellation) {
            await finishCanceledOperation(operation, runtime, user, owner); return;
        }
        if (!user.billingOperation) return; // Another authoritative update won; retry admission once.
        validateAccount(user);
        if (user.billingOperation.id !== operation._id || !sourcePlanUsableWhileAwaitingPayment(user) || !hasVerifiedMetering(user)
            || user.stripeSubscriptionStatus !== 'active' || user.billingRecovery || user.billingGrantTransfer
            || Object.keys(user.stripePaymentIssues || {}).length || operation.state !== 'awaiting_payment'
            || !operation.sourcePlanUsable || operation.paymentMode !== 'hosted_invoice' || !operation.creditReserved
            || operation.remoteStartedAt || operation.appliedAt || !operation.invoiceId
            || operation.sourceLocalFingerprint !== localSourceFingerprint(user)) {
            throw new BillingChangeError('The upgrade payment or source plan is being confirmed. Retry shortly.');
        }
        const account = getBillingAccount(user);
        try { reserveCost(structuredClone(account), user, conflict.request); return; }
        catch (error) {
            if (!(error instanceof PendingPlanCreditBlocksUsageError) || error.operationId !== operation._id) throw error;
        }
        const available = accountWithoutPendingPlanCredit(account, operation._id);
        if (!available) throw new BillingChangeError('The reserved upgrade credit needs financial review.');
        // Repeat every ordinary admission check on the hypothetical release.
        // A real debt, shortage, cost hold or changed request never cancels an offer.
        reserveCost(available, user, conflict.request);
        const subscription = await stripe.subscriptions.retrieve(operation.subscriptionId);
        if (user.stripeSubscriptionId !== operation.subscriptionId || subscription.status !== 'active'
            || subscriptionFingerprint(subscription) !== operation.sourceFingerprint
            || !operation.sourceMeterPriceIds || !verifiedSubscriptionMeters(subscription, operation.sourceMeterPriceIds)) {
            throw new BillingChangeError('The source subscription changed. Billing must be verified before resuming work.');
        }
        let invoice = await stripe.invoices.retrieve(operation.invoiceId);
        if (invoice.status === 'paid') {
            operation.state = 'draining'; operation.sourcePlanUsable = false;
            await saveOperation(operation, runtime, user, owner);
            throw new BillingChangeError('Your upgrade payment is confirmed. Retry when the paid plan finishes activating.');
        }
        const stage = invoice.status === 'void' ? 'after_void' : 'before_void';
        const intentIds = await assertHostedInvoiceCancellationSafe(operation, invoice, stripe, stage, operation.sourceUsageCancellation?.paymentIntentIds);
        // Exempt only the fully verified voluntary invoice; all other debt still blocks.
        for (const status of ['open', 'uncollectible'] as const) for await (const debt of stripe.invoices.list({ customer: operation.customerId, status, limit: 100 })) {
            if (debt.id !== invoice.id && debt.amount_remaining > 0) throw new BillingChangeError('Pay outstanding service invoices before starting new work.');
        }
        operation.sourceUsageCancellation ||= { startedAt: new Date(), paymentIntentIds: intentIds };
        await saveOperation(operation, runtime, user, owner);
        if (invoice.status !== 'void') {
            await assertOperationLease(operation, runtime, user, owner);
            await stripe.invoices.voidInvoice(invoice.id, {}, { idempotencyKey: `source-usage-upgrade-cancel:${operation._id}` });
            invoice = await stripe.invoices.retrieve(invoice.id);
        }
        await assertHostedInvoiceCancellationSafe(operation, invoice, stripe, 'after_void', operation.sourceUsageCancellation.paymentIntentIds);
        if (subscriptionFingerprint(await stripe.subscriptions.retrieve(operation.subscriptionId)) !== operation.sourceFingerprint) {
            throw new BillingChangeError('The subscription changed during payment cancellation. Retry after billing reconciliation.');
        }
        await assertOperationLease(operation, runtime, user, owner);
        operation.state = 'canceled'; operation.sourcePlanUsable = false;
        operation.error = SOURCE_USAGE_CANCELLATION_MESSAGE;
        await saveOperation(operation, runtime, user, owner);
        await finishCanceledOperation(operation, runtime, user, owner);
    });
}

/** A definitive 402 is safe to cancel only after the unchanged paid contract is read back. */
async function recoverRejectedPayment(operation: BillingChangeOperation, runtime: BillingDependencies, user: User, owner: string) {
    const subscription = await runtime.stripe.subscriptions.retrieve(operation.subscriptionId);
    if (subscriptionFingerprint(subscription) !== operation.sourceFingerprint || subscription.metadata.billingOperationId === operation._id) {
        operation.state = 'needs_review'; operation.error = 'Payment was rejected, but the subscription result needs verification before another change.';
        await saveOperation(operation, runtime, user, owner); return;
    }
    const invoiceId = await recoverOperationInvoice(runtime.stripe, subscription, operation);
    if (invoiceId && (await runtime.stripe.invoices.retrieve(invoiceId)).status !== 'void') {
        operation.invoiceId = invoiceId;
        operation.state = 'needs_review'; operation.error = 'The unsuccessful change has an unresolved invoice and needs financial review.';
        await saveOperation(operation, runtime, user, owner); return;
    }
    // Do not hide a genuinely unpaid renewal or an unexpected provider invoice.
    await assertCustomerDebtFree(runtime.stripe, operation.customerId);
    operation.state = 'canceled';
    operation.error = 'Payment could not be completed, so your plan was not changed. Your current paid plan remains active. Update your payment method and request a new preview.';
    await saveOperation(operation, runtime, user, owner);
    await finishCanceledOperation(operation, runtime, user, owner);
}
export async function applyPlanChange(subject: string, previewId: string, storageOverageConsent: boolean, dependencies?: BillingDependencies): Promise<BillingOperationSummary> {
    const runtime = await billingDependencies(dependencies);
    const { db } = runtime;
    let operation = await db.collection<BillingChangeOperation>(BILLING_OPERATIONS).findOne({ _id: previewId, authSubject: subject });
    if (!operation) throw new BillingChangeError('Billing preview not found.', 404);
    if (operation.state === 'applied' || operation.state === 'scheduled') return operationSummary(operation);
    if (operation.state === 'canceled') return operationSummary(await advancePlanChange(previewId, runtime));
    if (operation.preview.storageOverageConsent && !storageOverageConsent) throw new BillingChangeError('Confirm ongoing storage usage charges before downgrading.', 400);
    await withBillingLease(db, subject, async (user, owner) => {
        validateAccount(user);
        if (isBlockingBillingOperation(user) && user.billingOperation!.id !== previewId) throw new BillingChangeError('Finish the existing billing change first.');
        if (operation!.state === 'quoted' && operation!.creditPolicyVersion !== NORMAL_PRORATION_POLICY_VERSION) {
            throw new BillingChangeError('The plan credit policy changed. Request a fresh billing preview.');
        }
        if (operation!.state === 'quoted' && operation!.expiresAt < new Date()) throw new BillingChangeError('The billing preview expired. Request a new preview.');
        if (operation!.scheduledChange) {
            const current = await runtime.stripe.subscriptions.retrieve(operation!.subscriptionId);
            const target = await resolveCatalogPlan(operation!.target.key, db);
            if (target.catalogVersion !== operation!.target.billingCatalogVersion || subscriptionFingerprint(current) !== operation!.sourceFingerprint) {
                throw new BillingChangeError('Billing details changed. Request a fresh preview.');
            }
            operation!.state = 'scheduled';
            await saveOperation(operation!, runtime, user, owner);
            await coordinateBillingSchedule(user, owner, runtime);
            return;
        }
        if (!operation!.remoteStartedAt) {
            operation!.state = 'draining'; operation!.updatedAt = new Date();
            await saveOperation(operation!, runtime, user, owner);
        }
        const result = await db.collection<User>(Collections.USERS).updateOne(billingFence(user, owner), {
            $set: { billingOperation: { ...operationSummary(operation!), state: operation!.remoteStartedAt ? operation!.state : 'draining' } },
        });
        if (!result.matchedCount) throw new BillingBusyError();
    });
    if ((operation as BillingChangeOperation).state === 'scheduled') return operationSummary(operation);
    operation = await advancePlanChange(previewId, dependencies);
    return operationSummary(operation);
}

async function activatePaidPlanChange(operation: BillingChangeOperation, invoice: Stripe.Invoice, subscription: Stripe.Subscription, runtime: BillingDependencies, user: User, owner: string) {
    const { db, stripe } = runtime;
    const operationId = operation._id;
    const accounts = db.collection<User>(await db.collection<User>(Collections.USERS).findOne({ _id: user._id }) ? Collections.USERS : DELETED_BILLING_ACCOUNTS);
        if (operation.paymentMode === 'hosted_invoice') await assertHostedPlanInvoice(operation, invoice, stripe);
        const lines = await completeInvoiceLines(stripe, invoice);
        await verifyUsageInvoice(invoice.id, runtime);
        if (!isOperationInvoice(invoice, operation) || invoice.currency !== operation.preview.currency
            || Math.max(0, invoice.amount_due) !== operation.preview.amountDueMinor
            || (operation.kind === 'lifetime_conversion' && lines.filter(line => (operation.paymentMode === 'hosted_invoice'
                ? line.metadata.originalPriceId : invoiceLinePriceId(line)) === operation.target.stripePriceId && line.amount > 0).length !== 1)) {
            operation.state = 'needs_review'; operation.error = 'The paid invoice does not match the confirmed change.';
            await saveOperation(operation, runtime, user, owner); return;
        }
        subscription = await stripe.subscriptions.retrieve(operation.subscriptionId);
        const base = subscription.items.data.filter(item => item.price.recurring?.usage_type !== 'metered');
        const proof = verifiedSubscriptionMeters(subscription, { storage: operation.target.stripeStoragePriceId!, transcription: operation.target.stripeTranscriptionPriceId! });
        if (!proof || subscription.status !== 'active' || (operation.kind === 'plan_change' ? base.length !== 1 || base[0].price.id !== operation.target.stripePriceId : base.length !== 0)) throw new BillingChangeError('The paid subscription is still being verified.');
        await assertOperationLease(operation, runtime, user, owner);
        await syncPaidInvoiceFunding(invoice.id, runtime);
        if (operation.creditPolicyVersion !== NORMAL_PRORATION_POLICY_VERSION) {
            await reserveEntitlementOperatingCosts(user.authSubject, `billing-change:${operationId}`, operation.kind === 'lifetime_conversion' ? 'lifetime' : 'base', db);
        }
        const values: Record<string, unknown> = { planKey: operation.target.key, stripePriceId: operation.target.stripePriceId,
            billingCatalogVersion: operation.target.billingCatalogVersion, billingUsageCatalogVersion: operation.target.billingCatalogVersion, billingUsageTariffs: operation.usageTariffs,
            billingLastAppliedOperationId: operationId,
            storageAllocation: operation.target.limits.storage, transcriptionAllocation: operation.target.limits.transcription,
            stripeSubscriptionStatus: subscription.status, stripeMetering: proof, 'billingSettings.allowOverage': operation.kind === 'lifetime_conversion' || operation.preview.storageOverageConsent || user.billingSettings.allowOverage,
            billingEntitlement: { source: operation.kind === 'lifetime_conversion' ? 'lifetime' : 'subscription', reference: operation.kind === 'lifetime_conversion' ? invoice.id : subscription.id, grantedAt: new Date() } };
        if (operation.kind === 'plan_change') {
            const paid = await assertCurrentBasePeriodPaid(subscription, { ...user, stripePriceId: operation.target.stripePriceId }, runtime, operation);
            if (paid) values.billingPaidBasePeriod = paid;
        }
        if (operation.kind === 'lifetime_conversion') {
            if (!operation.usageTariffs) throw new BillingConfigurationError('The paid Lifetime purchase is missing its immutable quantity tariff.');
            values.lifetimePurchase = { checkoutSessionId: `invoice:${invoice.id}`, proof: 'invoice', invoiceId: invoice.id, operationId,
                purchasedAt: new Date(), planKey: operation.target.key, priceId: operation.target.stripePriceId };
            values.lifetimeUsageSetup = { state: 'ready', checkoutSessionId: `invoice:${invoice.id}`, priceIds: { storage: proof.storagePriceId, transcription: proof.transcriptionPriceId },
                subscriptionId: subscription.id, generation: 0, retryAt: new Date(), attempts: 1, createdAt: new Date(), updatedAt: new Date() };
        }
        // Entitlement changes only after paid proof. Usage counters and periods are intentionally preserved.
        await assertOperationLease(operation, runtime, user, owner);
        const updated = await accounts.updateOne(billingFence(user, owner), { $set: values, $unset: { billingOperation: '' } });
        if (!updated.matchedCount) throw new BillingBusyError();
        Object.assign(user, values); delete user.billingOperation;
        await settlePlanCredit(user.authSubject, operationId, true, db);
        await restorePaidChangeSchedule(operation, runtime, user, owner);
        operation.state = 'applied'; operation.appliedAt = new Date(); delete operation.error;
        await saveOperation(operation, runtime, user, owner);

}

async function restorePaidChangeSchedule(operation: BillingChangeOperation, runtime: BillingDependencies, user: User, owner: string) {
    const { db } = runtime, accounts = db.collection<User>(Collections.USERS);
    if (user.disabled || user.softDelete?.isDeleted || !await accounts.findOne({ _id: user._id })) {
        await cancelOwnedBillingScheduleForClosedAccount(user, owner, runtime);
        operation.scheduleRestoredAt = new Date(); return;
    }
        if (operation.creditPolicyVersion === NORMAL_PRORATION_POLICY_VERSION && !operation.scheduleRestoredAt) {
            // Retain only notices that actually cover the selected usage family.
            const rollouts = await db.collection<import('./usage-price-rollout').UsagePriceRollout>('billing_usage_price_rollouts').find({ authSubject: user.authSubject,
                customerId: user.stripeCustomerId, state: { $in: ['scheduled', 'prepared'] } }).toArray();
            for (const rollout of rollouts) {
                const tier = operation.kind === 'lifetime_conversion' ? 'lifetime' : 'recurring';
                if (rollout.sourceTariffs.storage.usageTier !== tier || rollout.targetTariffs.storage.usageTier !== tier) {
                    await db.collection<import('./usage-price-rollout').UsagePriceRollout>('billing_usage_price_rollouts').updateOne({ _id: rollout._id },
                        { $set: { state: 'canceled', lastError: 'The selected plan family requires its own price notice.', updatedAt: new Date() } });
                    if (user.billingUsagePriceRollout?.id === rollout._id) {
                        user.billingUsagePriceRollout = { ...user.billingUsagePriceRollout, state: 'canceled' };
                        await accounts.updateOne(billingFence(user, owner), { $set: { billingUsagePriceRollout: user.billingUsagePriceRollout } });
                    }
                    continue;
                }
                const bundle = await import('./catalog-bundle').then(module => module.getPublishedCatalogBundle(rollout.targetBundleId, db));
                const entry = bundle?.plans.find(entry => entry.plan.key === operation.target.key && entry.usageTariffs.storage.usageTier === tier)
                    || bundle?.plans.find(entry => entry.usageTariffs.storage.usageTier === tier);
                if (!entry) throw new BillingChangeError('The notified usage-price change requires reconciliation for the new plan family.');
                await db.collection<import('./usage-price-rollout').UsagePriceRollout>('billing_usage_price_rollouts').updateOne({ _id: rollout._id },
                    { $set: { sourceTariffs: operation.usageTariffs, targetTariffs: entry.usageTariffs, targetCatalogVersion: entry.catalogVersion, updatedAt: new Date() } });
            }
            await coordinateBillingSchedule(user, owner, runtime);
            operation.scheduleRestoredAt = new Date();
        }
}

async function advanceHostedPlanChange(operation: BillingChangeOperation, runtime: BillingDependencies, user: User, owner: string): Promise<void> {
    const { db, stripe } = runtime;
    const localGrantChanged = Boolean(operation.sourceLocalFingerprint && operation.sourceLocalFingerprint !== localSourceFingerprint(user));
    const accountClosed = user.disabled || user.softDelete?.isDeleted || !await db.collection<User>(Collections.USERS).findOne({ _id: user._id });
    if (accountClosed || localGrantChanged) {
        if (!operation.invoiceId && operation.invoiceStartedAt) {
            for await (const invoice of stripe.invoices.list({ customer: operation.customerId, limit: 100 })) {
                if (invoice.metadata?.billingOperationId !== operation._id || invoice.metadata.purpose !== 'plan_change_payment') continue;
                if (operation.invoiceId) throw new BillingChangeError('Multiple payment invoices need financial reconciliation.');
                operation.invoiceId = invoice.id;
            }
            await saveOperation(operation, runtime, user, owner);
        }
        if (operation.invoiceId) {
            const invoice = await stripe.invoices.retrieve(operation.invoiceId);
            if (invoice.status === 'paid') {
                await assertHostedPlanInvoice(operation, invoice, stripe);
                await assertOperationLease(operation, runtime, user, owner);
                await syncPaidInvoiceFunding(invoice.id, runtime);
                operation.state = 'needs_review'; operation.sourcePlanUsable = false;
                operation.error = accountClosed ? 'A paid change arrived after account closure. Financial settlement must reconcile it; access is not restored.'
                    : 'The account entitlement changed during payment. The paid change needs financial review and does not replace the newer grant.';
                await saveOperation(operation, runtime, user, owner); return;
            }
            if (!await voidUnpaidHostedPlanInvoice(operation, stripe, () => assertOperationLease(operation, runtime, user, owner))) throw new BillingChangeError('The closed account payment invoice needs financial review.');
        }
        operation.state = 'canceled'; operation.sourcePlanUsable = false;
        operation.error = accountClosed ? 'The unpaid change was canceled because the account was closed.' : 'The unpaid change was canceled because the account entitlement changed.';
        await saveOperation(operation, runtime, user, owner); await finishCanceledOperation(operation, runtime, user, owner); return;
    }
    let subscription = await stripe.subscriptions.retrieve(operation.subscriptionId);
    if (!operation.invoiceStartedAt) {
        const active = await resolveCatalogPlan(operation.target.key, db);
        if (active.catalogVersion !== operation.target.billingCatalogVersion || operation.expiresAt < new Date()
            || subscriptionFingerprint(subscription) !== operation.sourceFingerprint) {
            operation.state = 'canceled'; operation.error = 'Billing details or published pricing changed. Request a fresh preview.';
            await saveOperation(operation, runtime, user, owner); await finishCanceledOperation(operation, runtime, user, owner); return;
        }
        await assertPublishedPlan(operation.target, db);
        await assertCompletePublishedUsageCatalog(operation.target, db, stripe);
        await assertCustomerDebtFree(stripe, operation.customerId);
        await assertOperationLease(operation, runtime, user, owner);
        if (operation.creditPolicyVersion !== NORMAL_PRORATION_POLICY_VERSION) {
            await reservePlanCredit(user.authSubject, operation._id, operation.preview.baseCreditMinor, db);
            operation.creditReserved = true;
        }
        operation.invoiceStartedAt = new Date();
        const boundary = user.stripeCurrentPeriodEnd?.getTime() || Infinity;
        operation.paymentExpiresAt = new Date(Math.min(Date.now() + 23 * 60 * 60_000, boundary - 60_000));
        if (operation.paymentExpiresAt <= new Date()) {
            operation.state = 'canceled'; operation.error = 'Your monthly usage window is renewing. Request a fresh preview shortly.';
            await saveOperation(operation, runtime, user, owner); await finishCanceledOperation(operation, runtime, user, owner); return;
        }
        operation.state = 'applying'; await saveOperation(operation, runtime, user, owner);
    }
    let invoice: Stripe.Invoice;
    try { invoice = await createHostedPlanInvoice(operation, stripe, () => saveOperation(operation, runtime, user, owner), () => assertOperationLease(operation, runtime, user, owner)); }
    catch (error) {
        if (!(error instanceof HostedPlanInvoiceMismatchError)) throw error;
        if (subscriptionFingerprint(subscription) === operation.sourceFingerprint && await voidUnpaidHostedPlanInvoice(operation, stripe, () => assertOperationLease(operation, runtime, user, owner))) {
            operation.state = 'canceled'; operation.sourcePlanUsable = false;
            operation.error = 'Stripe could not reproduce the confirmed invoice. No payment was requested; request a fresh preview.';
            await saveOperation(operation, runtime, user, owner); await finishCanceledOperation(operation, runtime, user, owner); return;
        }
        operation.state = 'needs_review'; operation.sourcePlanUsable = false; operation.error = 'The payment invoice needs financial reconciliation before another change.';
        await saveOperation(operation, runtime, user, owner); return;
    }
    if (invoice.status === 'void') {
        operation.state = 'canceled'; operation.sourcePlanUsable = false; operation.error = 'The unpaid change was canceled. Review your current subscription in billing settings.';
        await saveOperation(operation, runtime, user, owner); await finishCanceledOperation(operation, runtime, user, owner); return;
    }
    if (invoice.status !== 'paid') {
        if (operation.paymentExpiresAt! <= new Date() || subscriptionFingerprint(subscription) !== operation.sourceFingerprint) {
            // This is an isolated base-only invoice: voiding it cannot discard metered usage.
            await assertOperationLease(operation, runtime, user, owner);
            await stripe.invoices.voidInvoice(invoice.id, {}, { idempotencyKey: `hosted-plan-expire:${operation._id}` });
            operation.state = 'canceled'; operation.sourcePlanUsable = false; operation.error = 'The unpaid change expired or subscription details changed. Review billing and request a fresh preview.';
            await saveOperation(operation, runtime, user, owner); await finishCanceledOperation(operation, runtime, user, owner); return;
        }
        if (invoice.status !== 'open' || !invoice.hosted_invoice_url) throw new BillingChangeError('The secure plan payment page is still being prepared. Retry shortly.');
        operation.state = 'awaiting_payment'; operation.sourcePlanUsable = true;
        operation.paymentUrl = invoice.hosted_invoice_url;
        operation.error = 'Complete payment and any bank verification on Stripe. Your current paid plan remains active until then.';
        await saveOperation(operation, runtime, user, owner); return;
    }
    operation.sourcePlanUsable = false; operation.state = 'draining'; delete operation.error;
    await saveOperation(operation, runtime, user, owner);
    if (!operation.remoteStartedAt) {
        if (subscriptionFingerprint(subscription) !== operation.sourceFingerprint) {
            operation.state = 'needs_review'; operation.error = 'Your payment is preserved, but the source subscription changed and needs reconciliation before activation.';
            await saveOperation(operation, runtime, user, owner); return;
        }
        await drainLedgerOutbox(user.authSubject, db);
        await reconcileUsageProcessing(100, db, stripe);
        await assertDrained(user.authSubject, runtime);
        const ids = { storage: operation.target.stripeStoragePriceId!, transcription: operation.target.stripeTranscriptionPriceId! };
        await assertOperationLease(operation, runtime, user, owner);
        if (operation.creditPolicyVersion !== NORMAL_PRORATION_POLICY_VERSION) await ensureUsageGrantScope(user, [ids.storage, ids.transcription], runtime);
        await assertPrepaidGrantsCoverTarget(user, ids, stripe, db);
        if (operation.creditPolicyVersion === NORMAL_PRORATION_POLICY_VERSION) {
            subscription = await releaseScheduleForPaidUpgrade(user, owner, runtime);
            operation.sourceFingerprint = subscriptionFingerprint(subscription);
            operation.sourceControlFingerprint = subscriptionControlFingerprint(subscription);
        }
        operation.remoteStartedAt = new Date(); operation.state = 'applying'; await saveOperation(operation, runtime, user, owner);
    }
    const baseItems = operation.params.items!.slice(0, 1), meterItems = operation.params.items!.slice(1);
    const base = subscription.items.data.filter(item => item.price.recurring?.usage_type !== 'metered');
    const remoteMeters = subscription.items.data.filter(item => item.price.recurring?.usage_type === 'metered');
    const allowedMeters = verifiedSubscriptionMeters(subscription, operation.sourceMeterPriceIds!)
        || verifiedSubscriptionMeters(subscription, { storage: operation.target.stripeStoragePriceId!, transcription: operation.target.stripeTranscriptionPriceId! });
    const allowedBase = base.length === 1 && base[0].quantity === 1 && base[0].id === baseItems[0].id
        && [operation.sourceBasePriceId, operation.target.stripePriceId].includes(base[0].price.id)
        || operation.kind === 'lifetime_conversion' && base.length === 0;
    if (subscriptionControlFingerprint(subscription) !== operation.sourceControlFingerprint || !allowedBase || !allowedMeters
        || subscription.metadata.billingOperationId !== operation._id && subscriptionFingerprint(subscription) !== operation.sourceFingerprint
        || subscription.items.has_more || JSON.stringify(remoteMeters.map(item => item.id).sort()) !== JSON.stringify(operation.sourceMeterItemIds)) {
        operation.state = 'needs_review'; operation.error = 'The subscription changed during payment fulfillment. Financial reconciliation is required before activation.';
        await saveOperation(operation, runtime, user, owner); return;
    }
    const baseMatches = operation.kind === 'lifetime_conversion' ? base.length === 0 : base.length === 1 && base[0].price.id === operation.target.stripePriceId;
    if (!baseMatches || subscription.metadata.billingOperationId !== operation._id) {
        await assertOperationLease(operation, runtime, user, owner);
        subscription = await stripe.subscriptions.update(operation.subscriptionId, { items: baseItems, proration_behavior: 'none',
            billing_cycle_anchor: { type: 'unchanged' }, metadata: operation.params.metadata }, { idempotencyKey: `hosted-plan-base:${operation._id}` });
    }
    const targetIds = { storage: operation.target.stripeStoragePriceId!, transcription: operation.target.stripeTranscriptionPriceId! };
    if (!verifiedSubscriptionMeters(subscription, targetIds)) {
        // Flexible billing retains old reported usage as pending invoice items for the next invoice.
        await assertOperationLease(operation, runtime, user, owner);
        subscription = await stripe.subscriptions.update(operation.subscriptionId, { items: meterItems, proration_behavior: 'create_prorations',
            billing_cycle_anchor: { type: 'unchanged' } }, { idempotencyKey: `hosted-plan-meters:${operation._id}` });
    }
    await activatePaidPlanChange(operation, invoice, subscription, runtime, user, owner);
}

/** Every provider mutation has immutable persisted params and an operation-specific idempotency key. */
export async function advancePlanChange(operationId: string, dependencies?: BillingDependencies): Promise<BillingChangeOperation> {
    const runtime = await billingDependencies(dependencies), { db, stripe } = runtime;
    const operation = await db.collection<BillingChangeOperation>(BILLING_OPERATIONS).findOne({ _id: operationId });
    if (!operation) throw new BillingChangeError('Billing operation not found.', 404);
    if (operation.state === 'applied') return operation;
    await withBillingLease(db, operation.authSubject, async (user, owner) => {
        await assertOperationLease(operation, runtime, user, owner);
        if (operation.state === 'canceled') {
            await finishCanceledOperation(operation, runtime, user, owner); return;
        }
        if (operation.state === 'scheduled') {
            if (user.disabled || user.softDelete?.isDeleted || !await db.collection<User>(Collections.USERS).findOne({ _id: user._id })) {
                await cancelOwnedBillingScheduleForClosedAccount(user, owner, runtime);
                operation.state = 'canceled'; operation.cleanupCompletedAt = new Date();
                operation.error = 'The scheduled change was canceled because the account was closed.';
                await saveOperation(operation, runtime, user, owner); return;
            }
            await syncOwnedBillingScheduleBoundary(user, owner, runtime);
            const refreshed = await db.collection<BillingChangeOperation>(BILLING_OPERATIONS).findOne({ _id: operationId });
            if (refreshed) Object.assign(operation, refreshed);
            if (operation.state === 'scheduled' && user.billingSchedule?.state !== 'scheduled') await coordinateBillingSchedule(user, owner, runtime);
            return;
        }
        if (user.billingLastAppliedOperationId === operationId) {
            await restorePaidChangeSchedule(operation, runtime, user, owner);
            await settlePlanCredit(user.authSubject, operationId, true, db);
            operation.state = 'applied'; operation.appliedAt ||= new Date(); delete operation.error;
            await saveOperation(operation, runtime, user, owner); return;
        }
        if (user.stripeCustomerId !== operation.customerId || user.billingOperation?.id !== operationId) throw new BillingChangeError('Billing identity changed.');
        if (operation.paymentMode === 'hosted_invoice') {
            await advanceHostedPlanChange(operation, runtime, user, owner); return;
        }
        if (operation.paymentRejectedAt) {
            await recoverRejectedPayment(operation, runtime, user, owner); return;
        }
        let subscription = await stripe.subscriptions.retrieve(operation.subscriptionId);
        if (!operation.remoteStartedAt) {
            const active = await resolveCatalogPlan(operation.target.key, db);
            if (active.catalogVersion !== operation.target.billingCatalogVersion) {
                operation.state = 'canceled'; operation.error = 'The published pricing changed. Request a fresh preview.';
                await saveOperation(operation, runtime, user, owner);
                await finishCanceledOperation(operation, runtime, user, owner); return;
            }
            const published = await assertPublishedPlan(operation.target, db);
            if (published._id !== operation.target.billingCatalogVersion
                || published.usageTariffs.storage.id !== operation.usageTariffs?.storage.id
                || published.usageTariffs.transcription.id !== operation.usageTariffs?.transcription.id) {
                operation.state = 'canceled'; operation.error = 'The published pricing changed. Request a fresh preview.';
                await saveOperation(operation, runtime, user, owner);
                await finishCanceledOperation(operation, runtime, user, owner);
                return;
            }
            await assertCompletePublishedUsageCatalog(operation.target, db, stripe);
            if (!dependencies) {
                await drainLedgerOutbox(user.authSubject, db);
                await flushUsageEvents(100);
                await reconcileUsageProcessing(100, db);
            }
            await assertDrained(user.authSubject, runtime);
            const targetIds = { storage: operation.target.stripeStoragePriceId!, transcription: operation.target.stripeTranscriptionPriceId! };
            await assertOperationLease(operation, runtime, user, owner);
            if (operation.creditPolicyVersion !== NORMAL_PRORATION_POLICY_VERSION) await ensureUsageGrantScope(user, [targetIds.storage, targetIds.transcription], runtime);
            await assertPrepaidGrantsCoverTarget(user, targetIds, stripe, db);
            await assertCustomerDebtFree(stripe, operation.customerId);
            if (subscriptionFingerprint(subscription) !== operation.sourceFingerprint || operation.expiresAt < new Date()) {
                operation.state = 'canceled'; operation.error = 'Billing details changed. Request a fresh preview.';
                await saveOperation(operation, runtime, user, owner);
                await finishCanceledOperation(operation, runtime, user, owner);
                return;
            }
            const checked = await previewInvoice(stripe, operation);
            if (Math.max(0, checked.amount_due) !== operation.preview.amountDueMinor || checked.currency !== operation.preview.currency) {
                operation.state = 'canceled'; operation.error = 'The invoice changed. Request a fresh preview.';
                await saveOperation(operation, runtime, user, owner);
                await finishCanceledOperation(operation, runtime, user, owner); return;
            }
            await assertOperationLease(operation, runtime, user, owner);
            if (operation.creditPolicyVersion !== NORMAL_PRORATION_POLICY_VERSION) {
                await reservePlanCredit(user.authSubject, operationId, operation.preview.baseCreditMinor, db);
                operation.creditReserved = true;
            }
            operation.state = 'applying'; operation.remoteStartedAt = new Date();
            await saveOperation(operation, runtime, user, owner);
        }
        if (subscription.metadata.billingOperationId !== operationId) {
            if (Date.now() - operation.remoteStartedAt!.getTime() > 23 * 60 * 60_000) {
                operation.state = 'needs_review'; operation.error = 'The provider result needs review before another billing change.';
                await saveOperation(operation, runtime, user, owner); return;
            }
            try {
                await assertOperationLease(operation, runtime, user, owner);
                subscription = await stripe.subscriptions.update(operation.subscriptionId, operation.params, { idempotencyKey: `plan-change:${operationId}` });
            } catch (error) {
                if (operation.params.payment_behavior !== 'error_if_incomplete' || (error as { statusCode?: number }).statusCode !== 402) throw error;
                operation.paymentRejectedAt = new Date();
                await saveOperation(operation, runtime, user, owner);
                await recoverRejectedPayment(operation, runtime, user, owner); return;
            }
        }
        let invoiceId = await recoverOperationInvoice(stripe, subscription, operation);
        if (!invoiceId) {
            await assertOperationLease(operation, runtime, user, owner);
            const invoice = await stripe.invoices.create({ customer: operation.customerId, subscription: subscription.id,
                pending_invoice_items_behavior: 'include', auto_advance: false, metadata: { billingOperationId: operationId } }, { idempotencyKey: `plan-change-invoice:${operationId}` });
            invoiceId = invoice.id;
        }
        operation.invoiceId = invoiceId;
        await saveOperation(operation, runtime, user, owner);
        let invoice = await stripe.invoices.retrieve(invoiceId);
        if (invoice.status === 'draft') {
            await assertOperationLease(operation, runtime, user, owner);
            invoice = await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: true }, { idempotencyKey: `plan-change-finalize:${operationId}` });
        }
        operation.paymentUrl = invoice.hosted_invoice_url || undefined;
        if (invoice.status !== 'paid') {
            operation.state = invoice.status === 'void' || invoice.status === 'uncollectible' ? 'needs_review' : 'awaiting_payment';
            operation.error = operation.state === 'needs_review' ? 'The change invoice needs administrator review.' : 'Complete payment to activate this change.';
            await saveOperation(operation, runtime, user, owner); return;
        }
        await activatePaidPlanChange(operation, invoice, subscription, runtime, user, owner);
    });
    if (operationSummary(operation).state === 'applied') {
        if (operation.invoiceId) await syncPaidInvoiceFunding(operation.invoiceId, runtime);
        const active = await db.collection<User>(Collections.USERS).findOne({ authSubject: operation.authSubject });
        if (active && !active.disabled && !active.softDelete?.isDeleted && hasVerifiedMetering(active)) await ensureBillingPeriod(operation.authSubject, db, stripe);
    }
    return operation;
}

export async function cancelPlanChange(subject: string, id: string, dependencies?: BillingDependencies) {
    const runtime = await billingDependencies(dependencies);
    await withBillingLease(runtime.db, subject, async (user, owner) => {
        const operation = await runtime.db.collection<BillingChangeOperation>(BILLING_OPERATIONS).findOne({ _id: id, authSubject: subject });
        if (!operation) throw new BillingChangeError('Billing change not found.', 404);
        await assertOperationLease(operation, runtime, user, owner);
        if (operation.state === 'canceled') { await finishCanceledOperation(operation, runtime, user, owner); return; }
        if (operation.state === 'scheduled') {
            if (new Date(operation.preview.effectiveAt) <= new Date()) {
                await syncOwnedBillingScheduleBoundary(user, owner, runtime);
                throw new BillingChangeError('The scheduled downgrade is already taking effect. Refresh billing settings.');
            }
            operation.state = 'canceled'; operation.scheduleCancellationPending = true;
            await saveOperation(operation, runtime, user, owner);
            await finishCanceledOperation(operation, runtime, user, owner); return;
        }
        if (operation.paymentMode === 'hosted_invoice' && !operation.remoteStartedAt && operation.invoiceStartedAt) {
            if (!operation.invoiceId) throw new BillingChangeError('The secure payment page result is being recovered. Retry cancellation shortly.');
            const invoice = await runtime.stripe.invoices.retrieve(operation.invoiceId);
            await assertHostedPlanInvoice(operation, invoice, runtime.stripe);
            if (invoice.status === 'paid') {
                operation.state = 'draining'; operation.sourcePlanUsable = false; await saveOperation(operation, runtime, user, owner);
                throw new BillingChangeError('Payment has already been confirmed. Your paid change is being activated.');
            }
            if (invoice.status === 'open') {
                await assertOperationLease(operation, runtime, user, owner);
                await runtime.stripe.invoices.voidInvoice(invoice.id, {}, { idempotencyKey: `hosted-plan-cancel:${id}` });
            }
            else if (invoice.status !== 'void') throw new BillingChangeError('The payment invoice must be verified before cancellation.');
            operation.sourcePlanUsable = false;
        }
        if (operation.remoteStartedAt) throw new BillingChangeError('The payment result must be verified before this change can be canceled.');
        operation.state = 'canceled'; await saveOperation(operation, runtime, user, owner);
        await finishCanceledOperation(operation, runtime, user, owner);
    });
}
