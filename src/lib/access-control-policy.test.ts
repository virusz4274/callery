import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import type { User } from '@/lib/db/types';
import { checkUserAccess, hasBillingIssue, isTrialExpired, canUseMeteredOverage } from './access-control-common';
import { checkStorageAccess } from './access-control-storage';
import { checkTranscriptionAccess } from './access-control-transcription';

const now = new Date('2026-10-20T00:00:00Z');
function account(patch: Partial<User> = {}): User {
    return {
        _id: new ObjectId(), authSubject: 'billing-test', email: 'billing@example.com',
        firstName: '', lastName: '', name: 'Billing', phoneNumber: '', role: 'user',
        createdAt: now, updatedAt: now, planKey: 'pro', timezone: 'UTC',
        notificationSettings: { activityDigest: 'off', ingestSuccess: false, ingestFail: false },
        transcriptionSettings: { autoTranscribe: false }, storageSettings: { deletionPolicy: 'never' },
        storageUsed: 10, storagePeakUsed: 10, storageAllocation: 100,
        transcriptionUsed: 10, transcriptionAllocation: 100,
        totalContacts: 0, totalRecordings: 0, totalDuration: 0,
        googleSync: { status: 'not_connected' }, billingSettings: { allowOverage: true },
        billingEntitlement: { source: 'subscription', reference: 'sub_test', grantedAt: now },
        stripeCustomerId: 'cus_test', stripeSubscriptionId: 'sub_test', stripeSubscriptionStatus: 'active',
        stripeMetering: { subscriptionId: 'sub_test', storagePriceId: 'price_storage', transcriptionPriceId: 'price_transcription', verifiedAt: now },
        ...patch,
    };
}

test('paid-operation status policy blocks failures without blocking access to existing data', () => {
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    for (const status of ['paused', 'past_due', 'unpaid', 'incomplete', 'incomplete_expired'] as const) {
        const user = account({ stripeSubscriptionStatus: status });
        assert.equal(hasBillingIssue(user, now)?.allowed, false, status);
        assert.equal(checkStorageAccess(user, 1).allowed, false, status);
        assert.equal(checkTranscriptionAccess(user, 1).allowed, false, status);
        assert.equal(checkUserAccess(user).allowed, true, 'Reading/exporting uses account access only.');
    }
    for (const status of ['active', 'trialing'] as const) assert.equal(hasBillingIssue(account({ stripeSubscriptionStatus: status }), now), null);
    assert.equal(hasBillingIssue(account({ stripeSubscriptionStatus: undefined }), now)?.allowed, false);
    assert.equal(hasBillingIssue(account({ stripeSubscriptionId: undefined }), now)?.allowed, false);
});

test('terminal cancellation blocks new cost even when an item retains a future period end', () => {
    for (const end of [undefined, new Date('invalid'), now, new Date(now.getTime() - 1)]) {
        assert.equal(hasBillingIssue(account({ stripeSubscriptionStatus: 'canceled', stripeCurrentPeriodEnd: end }), now)?.allowed, false);
    }
    const paidThrough = account({ stripeSubscriptionStatus: 'canceled', stripeCurrentPeriodEnd: new Date(now.getTime() + 1) });
    assert.equal(hasBillingIssue(paidThrough, now)?.allowed, false);
    assert.equal(canUseMeteredOverage(paidThrough), false);
});

test('an outstanding invoice blocks new work even while the subscription remains active', () => {
    const unpaid = account({ stripePaymentIssues: { in_unpaid: { state: 'failed', subscriptionId: 'sub_test', updatedAt: now } } });
    assert.equal(hasBillingIssue(unpaid, now)?.allowed, false);
    assert.equal(checkStorageAccess(unpaid, 1).allowed, false);
    assert.equal(checkTranscriptionAccess(unpaid, 1).allowed, false);
    assert.equal(canUseMeteredOverage(unpaid), false);
    assert.equal(checkUserAccess(unpaid).allowed, true);
    assert.equal(hasBillingIssue({ ...unpaid, billingEntitlement: { source: 'admin', grantedAt: now } }, now), null);
});

test('admin grants remain quota-limited and unknown paid entitlements fail closed', () => {
    const grant = account({ billingEntitlement: { source: 'admin', grantedAt: now }, stripeSubscriptionStatus: 'past_due' });
    assert.equal(checkStorageAccess(grant, 1).allowed, true);
    assert.equal(checkTranscriptionAccess(grant, 1).allowed, true);
    assert.equal(checkStorageAccess(grant, 1000).allowed, false);
    assert.equal(checkTranscriptionAccess(grant, 1000).allowed, false);
    assert.equal(canUseMeteredOverage(grant), false);
    assert.equal(hasBillingIssue(account({ billingEntitlement: undefined }), now)?.allowed, false);
    assert.equal(hasBillingIssue(account({ billingReview: { reason: 'ambiguous', createdAt: now } }), now)?.allowed, false);
});

test('overage requires verified active metering for this subscription', () => {
    assert.equal(canUseMeteredOverage(account()), true);
    for (const patch of [
        { stripeMetering: undefined }, { stripeSubscriptionStatus: 'trialing' as const },
        { stripeSubscriptionId: 'sub_other' }, { billingSettings: { allowOverage: false } },
    ]) {
        const user = account(patch);
        assert.equal(canUseMeteredOverage(user), false);
        assert.equal(checkStorageAccess(user, 1000).allowed, false);
    }
    assert.equal(checkStorageAccess(account({ stripeMetering: undefined }), 1).allowed, false);
    assert.equal(checkTranscriptionAccess(account({ stripeMetering: undefined }), 1).allowed, false);
});

test('lifetime ownership survives setup failures while costly operations require ready billing', () => {
    const owner = account({
        planKey: 'lifetime', billingEntitlement: { source: 'lifetime', reference: 'cs_lifetime', grantedAt: now },
        lifetimePurchase: { checkoutSessionId: 'cs_lifetime', purchasedAt: now, planKey: 'lifetime', priceId: 'price_lifetime' },
    });
    for (const state of ['pending', 'retrying', 'needs_action', 'ready'] as const) {
        const user = { ...owner, lifetimeUsageSetup: {
            state, checkoutSessionId: 'cs_lifetime', priceIds: { storage: 'price_storage', transcription: 'price_transcription' },
            retryAt: now, attempts: 0, createdAt: now, updatedAt: now,
        } };
        assert.equal(hasBillingIssue(user, now) === null, state === 'ready');
        assert.equal(checkUserAccess(user).allowed, true);
        assert.equal(user.lifetimePurchase?.checkoutSessionId, 'cs_lifetime');
    }
    assert.equal(hasBillingIssue(owner, now)?.allowed, false);
});

test('trials expire at their deadline and cannot become indefinite through missing dates', () => {
    const trial = account({ planKey: 'free-trial', billingEntitlement: { source: 'trial', grantedAt: now } });
    for (const end of [undefined, new Date('invalid'), now]) assert.equal(isTrialExpired({ ...trial, trialEndsAt: end }, now), true);
    assert.equal(isTrialExpired({ ...trial, trialEndsAt: new Date(now.getTime() + 1) }, now), false);
});

test('self-host billing bypass preserves account restrictions and rejects invalid operation quantities', () => {
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'false';
    const unpaid = account({ stripeSubscriptionStatus: 'unpaid', billingEntitlement: undefined });
    assert.equal(checkStorageAccess(unpaid, 1000).allowed, true);
    assert.equal(checkTranscriptionAccess(unpaid, 1000).allowed, true);
    for (const patch of [{ disabled: true }, { teamInvitationPending: true }, { softDelete: { isDeleted: true, deletedAt: now, restoreUntil: now, previousDisabled: false } }]) {
        assert.equal(checkStorageAccess(account(patch), 1).allowed, false);
        assert.equal(checkTranscriptionAccess(account(patch), 1).allowed, false);
    }
    for (const amount of [-1, NaN, Infinity]) {
        assert.equal(checkStorageAccess(unpaid, amount).allowed, false);
        assert.equal(checkTranscriptionAccess(unpaid, amount).allowed, false);
    }
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
});
