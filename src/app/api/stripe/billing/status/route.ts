import { NextRequest, NextResponse } from 'next/server';
import { requireBillingUser, billingErrorResponse } from '@/lib/stripe/http';
import { getPrepaidState, paidBasePeriodCovers } from '@/lib/stripe/ledger';
import { hasVerifiedMetering, sourcePlanUsableWhileAwaitingPayment } from '@/lib/stripe/billing-types';
import { BILLING_OPERATIONS, isBlockingBillingOperation, operationSummary, type BillingChangeOperation } from '@/lib/stripe/plan-change';
import { PREPAID_TOPUPS, type PrepaidTopup } from '@/lib/stripe/prepaid-topup';
import { getMongoDb } from '@/lib/mongodb';
import { usagePricingTier } from '@/lib/stripe/catalog';
import { usagePricePresentation } from '@/lib/stripe/usage-presentation';
import { USAGE_PRICE_ROLLOUTS, type UsagePriceRollout } from '@/lib/stripe/usage-price-rollout';
import { effectiveBillingEntitlementSource } from '@/lib/stripe/entitlement-source';
import { hasBillingIssue } from '@/lib/access-control-common';
import { hasBlockingBillingReview, hasBlockingFinancialReview } from '@/lib/stripe/financial-review';
import { processingAvailability } from '@/lib/processing-availability';
export async function GET(req: NextRequest) {
    try {
        const user = await requireBillingUser(req, false);
        const operatorFunded = effectiveBillingEntitlementSource(user) === 'admin';
        const db = await getMongoDb();
        const processing = await processingAvailability(db);
        const scheduledChange = operatorFunded ? null : await db.collection<BillingChangeOperation>(BILLING_OPERATIONS).findOne({
            authSubject: user.authSubject, customerId: user.stripeCustomerId, subscriptionId: user.stripeSubscriptionId, state: 'scheduled',
        });
        const transitionPending = Boolean(user.billingEntitlement?.source === 'subscription' && !paidBasePeriodCovers(user, new Date())
            || user.billingSchedule && user.billingSchedule.state !== 'ready'
            && (user.billingSchedule.state !== 'scheduled' || user.billingSchedule.effectiveAt && user.billingSchedule.effectiveAt <= new Date()));
        const scheduled = operatorFunded ? null : await db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).findOne({ authSubject: user.authSubject, customerId: user.stripeCustomerId,
            generation: user.stripeCustomerGeneration || 0, subscriptionId: user.stripeSubscriptionId,
            state: { $in: ['scheduled', 'preparing', 'prepared', 'applying'] }, noticedAt: { $exists: true } });
        const failedTopup = await db.collection<PrepaidTopup>(PREPAID_TOPUPS).findOne({ authSubject: user.authSubject, state: 'needs_review' });
        return NextResponse.json({ operation: user.billingOperation, scheduledChange: scheduledChange ? operationSummary(scheduledChange) : undefined,
            billingSchedule: user.billingSchedule, processing, billingSyncPending: transitionPending,
            prepaid: { ...getPrepaidState(user), autoTopup: user.automaticTopup },
            administratorFunded: operatorFunded,
            usagePricing: operatorFunded ? undefined : usagePricePresentation(usagePricingTier(user), user.billingUsageTariffs),
            scheduledUsagePricing: scheduled?.effectiveAt ? { effectiveAt: scheduled.effectiveAt.toISOString(), pricing: usagePricePresentation(usagePricingTier(user), scheduled.targetTariffs) } : undefined,
            fundingHeld: Boolean(user.billingGrantTransfer),
            usageReady: operatorFunded ? !hasBillingIssue(user)
                : !transitionPending && !user.billingGrantTransfer && !hasBlockingBillingReview(user.billingReview) && !hasBlockingFinancialReview(user.billingAccount) && hasVerifiedMetering(user)
                    && (!isBlockingBillingOperation(user) || sourcePlanUsableWhileAwaitingPayment(user)) && !Object.keys(user.stripePaymentIssues || {}).length,
            automaticTopupIssue: failedTopup?.kind === 'automatic' ? 'Add usage credit manually before re-enabling automatic top-ups.' : undefined },
        { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) { return billingErrorResponse(error); }
}
