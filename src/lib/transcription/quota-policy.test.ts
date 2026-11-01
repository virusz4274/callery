import test from 'node:test';
import assert from 'node:assert/strict';
import { hasUnlimitedTranscription } from './quota-policy';
import { checkTranscriptionAccess } from '@/lib/access-control-transcription';
import { checkUserAccess } from '@/lib/access-control-common';
import { userFixture } from '@/lib/stripe/test-support';

test('Internal has an explicit unlimited quota even after the former numeric sentinel', t => {
    const old = process.env.NEXT_PUBLIC_ENABLE_BILLING;
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    t.after(() => { if (old === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = old; });
    for (const allocation of [0, 99999 * 60]) {
        const user = userFixture({ planKey: 'internal', billingEntitlement: undefined, stripeSubscriptionId: undefined,
            stripeSubscriptionStatus: undefined, transcriptionAllocation: allocation, transcriptionUsed: 99999 * 60 + 1 });
        const used = user.transcriptionUsed;
        assert.equal(hasUnlimitedTranscription(user, true), true);
        assert.equal(checkTranscriptionAccess(user, 3600).allowed, true);
        assert.equal(user.transcriptionUsed, used, 'A quota check never resets consumption');
        assert.equal(user.transcriptionAllocation, allocation);
    }
});

test('Custom grants, admin roles, and unverified Stripe-linked Internal accounts do not gain unlimited quota', () => {
    for (const user of [
        userFixture({ planKey: 'custom', role: 'admin', billingEntitlement: { source: 'admin', grantedAt: new Date() } }),
        userFixture({ planKey: 'standard', role: 'admin' }),
        userFixture({ planKey: 'internal', billingEntitlement: undefined, stripeSubscriptionId: 'sub_unknown' }),
    ]) assert.equal(hasUnlimitedTranscription(user, true), false);
});

test('Internal unlimited minutes preserve financial review, purge, account, and quantity restrictions', t => {
    const old = process.env.NEXT_PUBLIC_ENABLE_BILLING;
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    t.after(() => { if (old === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = old; });
    const user = userFixture({ planKey: 'internal', billingEntitlement: { source: 'admin', grantedAt: new Date() },
        transcriptionAllocation: 0, transcriptionUsed: 100 });
    for (const patch of [
        { disabled: true },
        { billingReview: { reason: 'payment_dispute', createdAt: new Date() } },
        { billingRecovery: { startedAt: new Date(), purgeAt: new Date(), warnings: [], purgingAt: new Date() } },
    ]) assert.equal(checkTranscriptionAccess({ ...user, ...patch }, 1).allowed, false);
    assert.equal(checkUserAccess({ ...user, billingReview: { reason: 'payment_dispute', createdAt: new Date() } }).allowed, true);
    for (const quantity of [NaN, Infinity, -1]) assert.equal(checkTranscriptionAccess(user, quantity).allowed, false);
});
