import type { AdminLog, User, Recording } from '@/lib/db/types';
import { createHash } from 'node:crypto';
import type { UsageEvent } from './usage-queue';
import type { BillingEntitlement } from './billing-types';

export interface LegacyBillingClassification { entitlement?: BillingEntitlement; reviewReason?: string; skip?: boolean }
/** Only local provenance is classified. Migration never calls Stripe or starts billing. */
export function classifyLegacyBilling(user: User, assignment?: AdminLog | null): LegacyBillingClassification {
    if (user.billingEntitlement) return { skip: true };
    if (user.billingReview) return { skip: true };
    const hasStripe = Boolean(user.stripeSubscriptionId || user.stripeCustomerId || user.stripePriceId);
    if (user.lifetimePurchase && user.lifetimeUsageSetup) return { entitlement: {
        source: 'lifetime', reference: user.lifetimePurchase.checkoutSessionId, grantedAt: user.lifetimePurchase.purchasedAt,
    } };
    if (user.planKey === 'lifetime') return { reviewReason: 'legacy_lifetime_purchase_unverified' };
    if (assignment) {
        if (hasStripe || assignment.details.newPlanKey !== user.planKey) return { reviewReason: 'legacy_assignment_and_payment_ambiguous' };
        return { entitlement: { source: 'admin', reference: assignment._id.toString(), grantedAt: assignment.createdAt } };
    }
    if (user.planKey === 'free-trial' && !user.stripeSubscriptionId && !user.stripePriceId) return {
        entitlement: { source: 'trial', grantedAt: user.createdAt },
    };
    if (['internal', 'custom'].includes(user.planKey) && !hasStripe) return {
        entitlement: { source: 'admin', reference: 'legacy-internal-plan', grantedAt: user.updatedAt || user.createdAt },
    };
    if (user.stripeSubscriptionId && user.stripeCustomerId && user.stripePriceId && !['free-trial', 'internal', 'custom'].includes(user.planKey)) return {
        entitlement: { source: 'subscription', reference: user.stripeSubscriptionId, grantedAt: user.createdAt },
    };
    return { reviewReason: 'legacy_billing_provenance_ambiguous' };
}

export function legacyTranscriptionReceiptIds(recording: Recording): string[] {
    const provider = recording.transcriptionProvider, external = recording.externalTranscriptionId;
    if (!provider || !external) return [];
    return ['', ':manual'].map(path => createHash('sha256').update(`transcription:${recording.authSubject}:recording:${recording._id}${path}:${provider}:${external}`).digest('hex'));
}
/** Historical raw seconds must never be reinterpreted as v2 financial blocks or freshly charged. */
export function classifyLegacyTranscription(recording: Recording, events: UsageEvent[]) {
    if (recording.transcriptionReceipt) return { state: 'skip' as const, receiptIds: [] as string[] };
    const ids = legacyTranscriptionReceiptIds(recording), matches = events.filter(event => ids.includes(event._id));
    const attempted = matches.filter(event => event.reportedValue > 0 || event.firstAttemptAt || event.delivery);
    if (attempted.length > 1) return { state: 'review' as const, reason: 'possible_legacy_duplicate_charge', receiptIds: matches.map(event => event._id) };
    if (recording.transcriptionUsageReportId || attempted.length === 1) return { state: 'settled' as const, receiptIds: matches.map(event => event._id) };
    if (recording.transcriptionBillingContext === null) return { state: 'unmetered' as const, receiptIds: matches.map(event => event._id) };
    return { state: 'review' as const, reason: 'legacy_delivery_provenance_unknown', receiptIds: matches.map(event => event._id) };
}
