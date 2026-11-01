import type Stripe from 'stripe';
import { hasBlockingBillingReview } from './financial-review';

export interface BillingEntitlement {
    source: 'trial' | 'admin' | 'subscription' | 'lifetime';
    reference?: string;
    grantedAt: Date;
}
export interface LifetimePurchase {
    checkoutSessionId: string;
    /** Legacy checkoutSessionId is retained as a stable ownership identity for migrations. */
    proof?: 'checkout' | 'invoice';
    invoiceId?: string;
    operationId?: string;
    paymentIntentId?: string;
    purchasedAt: Date;
    planKey: string;
    priceId: string;
}
export interface UsageBillingBootstrap {
    state: 'pending' | 'ready' | 'needs_action';
    subscriptionId: string;
    priceIds: { storage: string; transcription: string };
    attempts: number;
    createdAt: Date;
    updatedAt: Date;
    lastErrorCode?: string;
}
export interface BillingOperationSummary {
    id: string;
    state: 'quoted' | 'scheduled' | 'draining' | 'applying' | 'awaiting_payment' | 'applied' | 'canceled' | 'needs_review';
    kind: 'plan_change' | 'lifetime_conversion';
    targetPlanKey: string;
    amountDueMinor: number;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
    invoiceId?: string;
    paymentUrl?: string;
    error?: string;
    /** An unpaid, verified voluntary change invoice leaves the paid source contract usable. */
    sourcePlanUsable?: boolean;
    timing?: 'immediate' | 'period_end';
    effectiveAt?: Date;
    scheduled?: boolean;
}
export interface BillingScheduleSummary {
    id: string;
    scheduleId?: string;
    effectiveAt?: Date;
    state: 'preparing' | 'scheduled' | 'sync_pending' | 'ready';
    revision: string;
}
/** Verified paid service, not a provider-expense funding balance. Annual base
 * purchases may cover twelve independent monthly usage windows. */
export interface PaidBasePeriod {
    customerId: string; customerGeneration: number; subscriptionId: string; basePriceId: string;
    start: Date; end: Date; invoiceId: string;
}
export function sourcePlanUsableWhileAwaitingPayment(user: { billingOperation?: BillingOperationSummary }): boolean {
    return user.billingOperation?.state === 'awaiting_payment' && user.billingOperation.sourcePlanUsable === true;
}
export interface AutomaticTopupSettings {
    enabled: boolean;
    thresholdMinor: number;
    amountMinor: number;
    dailyCapMinor: number;
    monthlyCapMinor: number;
    consentedAt?: Date;
    updatedAt: Date;
}
export interface BillingLease { owner: string; until: Date }
export interface StripeMetering {
    subscriptionId: string;
    storagePriceId: string;
    transcriptionPriceId: string;
    verifiedAt: Date;
}
export interface BillingReview { reason: string; createdAt: Date }
export interface StripePaymentIssue {
    state: 'failed' | 'action_required';
    subscriptionId: string;
    updatedAt: Date;
}
export interface LifetimeUsageSetup {
    state: 'pending' | 'ready' | 'retrying' | 'needs_action';
    checkoutSessionId: string;
    priceIds: { storage: string; transcription: string };
    subscriptionId?: string;
    generation?: number;
    creationStartedAt?: Date;
    subscriptionParams?: Stripe.SubscriptionCreateParams;
    retryAt: Date;
    attempts: number;
    createdAt: Date;
    updatedAt: Date;
    lastErrorCode?: string;
}
export interface PendingCheckout {
    attemptId: string;
    planKey: string;
    priceId: string;
    phase: 'creating' | 'open' | 'completed' | 'expired' | 'failed' | 'needs_review';
    params: Stripe.Checkout.SessionCreateParams;
    createdAt: Date;
    expiresAt: Date;
    sessionId?: string;
    url?: string;
}

export function checkoutMayReplaceAdminGrant(user: { billingEntitlement?: BillingEntitlement; pendingCheckout?: PendingCheckout }, attemptId?: string): boolean {
    return user.billingEntitlement?.source !== 'admin' || Boolean(attemptId && user.pendingCheckout?.attemptId === attemptId
        && user.pendingCheckout.createdAt >= user.billingEntitlement.grantedAt);
}

interface MeteringAccount {
    billingEntitlement?: BillingEntitlement;
    stripeSubscriptionId?: string;
    stripeSubscriptionStatus?: string;
    stripeMetering?: StripeMetering;
    billingReview?: BillingReview;
}
/** Local proof is written only after verifying the subscription's exact meter items. */
export function hasVerifiedMetering(user: MeteringAccount): boolean {
    return !hasBlockingBillingReview(user.billingReview) && ['subscription', 'lifetime'].includes(user.billingEntitlement?.source || '')
        && user.stripeSubscriptionStatus === 'active'
        && Boolean(user.stripeSubscriptionId && user.stripeMetering?.subscriptionId === user.stripeSubscriptionId
            && user.stripeMetering.storagePriceId && user.stripeMetering.transcriptionPriceId);
}
