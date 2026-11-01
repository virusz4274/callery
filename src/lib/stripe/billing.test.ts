import { testProcessingCostEvidence } from './processing-test-support';
import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import type { User, AdminLog } from '@/lib/db/types';
import { getInvoiceSubscriptionId } from './objects';
import { hasVerifiedMetering, checkoutMayReplaceAdminGrant } from './billing-types';
import { createOrResumeCheckout, checkoutParams, CheckoutConflictError, checkoutOutcome, syncFailedCheckout } from './checkout';
import { billingFence, BillingBusyError, withBillingLease } from './billing-lock';
import { applyOneTimeCheckoutPlan, reconcileLifetimeUsage } from './lifetime';
import { canAdoptSubscription, isVerifiedSubscriptionActivation, syncSubscription } from './sync';
import { reconcileBilling } from './reconcile';
import { validateCheckoutPlan, validateMeterPriceUnits, verifiedSubscriptionMeters } from './metering';
import { buildUsageEvent, captureTranscriptionBilling } from './usage';
import { classifyLegacyBilling } from './migration';
import { claimWebhookEvent, finishWebhookEvent } from './webhook-events';
import { MemoryBillingDatabase, FakeBillingStripe, planFixture, userFixture, clone, seedPublishedCatalogFixture } from './test-support';

process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
process.env.MANAGED_COST_POLICY_JSON = JSON.stringify({version:'unit-cost-v2',reviewedAt:'2020-01-01',expiresAt:'2099-01-01',paymentFeeBasisPoints:0,paymentFixedMicros:0,stripeBillingFeeBasisPoints:0,stripeBillingFixedMicros:0,minimumTopupMicros:5_000_000,infrastructureMicrosPerAudioMinute:0,infrastructureMicrosPerGiB:0,aiBundleMicrosPerAudioMinute:0,aiBundleFixedMicros:0,storageCostMicrosPerGiBMonth:100,storageOperationsMicrosPerGiBMonth:0,recoveryReserveMicros:1,lifetimeHostingReserveMicros:1,lifetimeUsage:{audioOverheadMicrosPerMinute:0,recordingOverheadMicros:0,storageOverheadMicrosPerGiBMonth:0},providers:{soniox:{costMicrosPerAudioMinute:100,fixedMicros:0},gemini:{costMicrosPerAudioMinute:100,fixedMicros:0},elevenlabs:{costMicrosPerAudioMinute:100,fixedMicros:0}},...testProcessingCostEvidence(),exports:{fixedMicros:0,perGiBMicros:0,maximumSourceBytes:1_000_000,recoveryReserveMicros:1}});
const urls = { success: 'https://app.example.test/success', cancel: 'https://app.example.test/cancel' };
// Remote invoices and subscriptions below model October 2026. Pin only Date;
// real timer scheduling and each test's explicit expiry changes remain intact.
test.beforeEach(t => {
    assert.ok('mock' in t);
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-20T12:00:00Z') });
});

function fixture(overrides: Partial<User> = {}) {
    const database = new MemoryBillingDatabase();
    database.collection('users').values.push(clone(userFixture(overrides)) as unknown as Record<string, unknown>);
    const stripe = new FakeBillingStripe();
    seedPublishedCatalogFixture(database, [planFixture(), planFixture({key:'pro'}), planFixture({key:'lifetime',interval:'lifetime',stripePriceId:'price_lifetime'})], 'unit-cost-v2');
    const deps = { db: database.asDb(), stripe: stripe.asStripe() };
    return { database, stripe, deps };
}

test('invoice normalization supports current and pinned legacy webhook API versions', () => {
    for (const [invoice, expected] of [
        [{ parent: { subscription_details: { subscription: 'sub_current' } } }, 'sub_current'],
        [{ parent: { subscription_details: { subscription: { id: 'sub_expanded' } } } }, 'sub_expanded'],
        [{ subscription: 'sub_legacy' }, 'sub_legacy'], [{ subscription: { id: 'sub_old_expanded' } }, 'sub_old_expanded'],
        [{ parent: null }, null], [{}, null], [null, null],
    ]) assert.equal(getInvoiceSubscriptionId(invoice), expected);
});

test('meter proof requires expected exact items, active collection, provenance and no review', async () => {
    const { stripe } = fixture();
    const sub = stripe.subscription();
    const proof = verifiedSubscriptionMeters(sub, { storage: 'price_storage', transcription: 'price_transcription' });
    assert.ok(proof);
    const user = userFixture({ billingEntitlement: { source: 'subscription', reference: sub.id, grantedAt: new Date() },
        stripeSubscriptionId: sub.id, stripeSubscriptionStatus: 'active', stripeMetering: proof });
    assert.equal(hasVerifiedMetering(user), true);
    for (const override of [{ stripeSubscriptionStatus: 'paused' as const }, { billingEntitlement: { source: 'admin' as const, grantedAt: new Date() } },
        { billingReview: { reason: 'duplicate', createdAt: new Date() } }, { stripeSubscriptionId: 'sub_other' }]) assert.equal(hasVerifiedMetering({ ...user, ...override }), false);
    sub.items.data.push(sub.items.data[0]);
    assert.equal(verifiedSubscriptionMeters(sub, { storage: 'price_storage', transcription: 'price_transcription' }), undefined);
    stripe.badMeter = true;
    await assert.rejects(validateCheckoutPlan(stripe.asStripe(), planFixture()), /meter name/);
});

test('Checkout serializes concurrent requests and returns one immutable existing session', async () => {
    const { database, stripe, deps } = fixture();
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => createOrResumeCheckout('owner', planFixture(), urls, deps)));
    assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
    for (const result of results) if (result.status === 'rejected') assert.ok(result.reason instanceof BillingBusyError);
    assert.equal(stripe.sessionCreates, 1);
    const url = await createOrResumeCheckout('owner', planFixture(), { ...urls, success: 'https://app.example.test/changed' }, deps);
    assert.equal(url, 'https://checkout.stripe.test/cs_1');
    assert.equal(stripe.sessionCreates, 1);
    assert.equal(database.user().pendingCheckout?.params.success_url, urls.success);
    await assert.rejects(createOrResumeCheckout('owner', planFixture({ key: 'pro' }), urls, deps), CheckoutConflictError);
});

test('Checkout recovers remote success after response loss without creating a second purchase', async () => {
    const { database, stripe, deps } = fixture();
    stripe.throwAfterSessionCreate = true;
    await assert.rejects(createOrResumeCheckout('owner', planFixture(), urls, deps), /Response lost/);
    assert.equal(database.user().pendingCheckout?.phase, 'creating');
    assert.equal(await createOrResumeCheckout('owner', planFixture(), urls, deps), 'https://checkout.stripe.test/cs_1');
    assert.equal(stripe.sessionCreates, 1);
});

test('Checkout checks authoritative subscriptions even when local subscription state is missing', async () => {
    const { stripe, deps } = fixture();
    stripe.subscriptionValues.push(stripe.subscription('sub_remote', 'paused'));
    await assert.rejects(createOrResumeCheckout('owner', planFixture(), urls, deps), /already have a subscription/);
    assert.equal(stripe.sessionCreates, 0);
});

test('pending asynchronous payments block another purchase; canceled failures release only their own attempt', async () => {
    const { database, stripe, deps } = fixture();
    await createOrResumeCheckout('owner', planFixture(), urls, deps);
    const session = stripe.sessions.get('cs_1')!;
    session.status = 'complete'; session.mode = 'payment'; session.payment_status = 'unpaid'; session.payment_intent = 'pi_pending';
    stripe.paymentIntents.retrieve = async () => ({ id: 'pi_pending', payment_method: 'pm_saved', status: 'processing' }) as never;
    await assert.rejects(createOrResumeCheckout('owner', planFixture(), urls, deps), /being synchronized/);
    await syncFailedCheckout(session.id, deps);
    assert.equal(database.user().pendingCheckout?.phase, 'completed');
    assert.equal(stripe.sessionCreates, 1);
    stripe.paymentIntents.retrieve = async () => ({ id: 'pi_pending', payment_method: 'pm_saved', status: 'canceled' }) as never;
    await syncFailedCheckout(session.id, deps);
    assert.equal(database.user().pendingCheckout?.phase, 'failed');
    await createOrResumeCheckout('owner', planFixture(), urls, deps);
    assert.equal(stripe.sessionCreates, 2);
});

test('an out-of-order failure event cannot cancel a now-successful payment', async () => {
    const { stripe } = fixture();
    const session = stripe.paidLifetime(); session.payment_status = 'unpaid';
    stripe.paymentIntents.retrieve = async () => ({ id: 'pi_paid', payment_method: 'pm_saved', status: 'succeeded' }) as never;
    assert.equal(await checkoutOutcome(stripe.asStripe(), session), 'pending');
});

test('lifetime Checkout explicitly saves the payment method for continuing usage', () => {
    const params = checkoutParams(userFixture(), planFixture({ key: 'lifetime', interval: 'lifetime', stripePriceId: 'price_lifetime' }), 'cus_owner', 'attempt', urls, new Date());
    assert.equal(params.mode, 'payment');
    assert.equal(params.payment_intent_data?.setup_future_usage, 'off_session');
    assert.equal(params.metadata?.storagePriceId, 'price_lifetime_storage');
    assert.equal(params.line_items?.length, 1);
});

test('lifetime ownership persists while missing saved payment method blocks collection setup', async () => {
    const { database, stripe, deps } = fixture(); stripe.customerHasMethod = false;
    await applyOneTimeCheckoutPlan(stripe.paidLifetime(), deps);
    assert.equal(database.user().billingEntitlement?.source, 'lifetime');
    assert.equal(database.user().lifetimePurchase?.checkoutSessionId, 'cs_paid');
    assert.equal(database.user().lifetimeUsageSetup?.state, 'needs_action');
    assert.equal(database.user().lifetimeUsageSetup?.lastErrorCode, 'payment_method_required');
    assert.equal(hasVerifiedMetering(database.user()), false);
    assert.equal(stripe.subscriptionCreates, 0);
});

test('lifetime setup reconciles remote success after a lost response and never duplicates usage subscriptions', async () => {
    const { database, stripe, deps } = fixture(); stripe.throwAfterSubscriptionCreate = true;
    await applyOneTimeCheckoutPlan(stripe.paidLifetime(), deps);
    assert.equal(database.user().lifetimeUsageSetup?.state, 'retrying');
    assert.ok(database.user().lifetimePurchase);
    assert.equal(stripe.subscriptionCreates, 1);
    await reconcileLifetimeUsage('owner', deps);
    assert.equal(database.user().lifetimeUsageSetup?.state, 'ready');
    assert.equal(hasVerifiedMetering(database.user()), true);
    assert.equal(stripe.subscriptionCreates, 1);
    await applyOneTimeCheckoutPlan(stripe.paidLifetime(), deps);
    assert.equal(stripe.subscriptionCreates, 1);
});

test('lifetime bad meter configuration records actionable failure without granting unbillable usage', async () => {
    const { database, stripe, deps } = fixture(); stripe.badMeter = true;
    await applyOneTimeCheckoutPlan(stripe.paidLifetime(), deps);
    assert.equal(database.user().lifetimeUsageSetup?.state, 'needs_action');
    assert.equal(database.user().lifetimeUsageSetup?.lastErrorCode, 'configuration_required');
    assert.equal(hasVerifiedMetering(database.user()), false);
    assert.equal(stripe.subscriptionCreates, 0);
});

test('cron preserves canceled lifetime usage; explicit customer retry resumes exactly once', async () => {
    const { database, stripe, deps } = fixture();
    await applyOneTimeCheckoutPlan(stripe.paidLifetime(), deps);
    stripe.subscriptionValues[0].status = 'canceled';
    await reconcileLifetimeUsage('owner', deps);
    assert.equal(database.user().lifetimeUsageSetup?.state, 'needs_action');
    assert.equal(database.user().billingEntitlement?.source, 'lifetime');
    assert.equal(stripe.subscriptionCreates, 1);
    await reconcileLifetimeUsage('owner', deps, { resume: true });
    assert.equal(stripe.subscriptionCreates, 2);
    assert.equal(database.user().lifetimeUsageSetup?.state, 'ready');
    await reconcileLifetimeUsage('owner', deps, { resume: true });
    assert.equal(stripe.subscriptionCreates, 2);
});

test('duplicate lifetime subscriptions and duplicate paid purchases preserve ownership for manual review', async () => {
    const { database, stripe, deps } = fixture();
    await applyOneTimeCheckoutPlan(stripe.paidLifetime(), deps);
    const duplicate = clone(stripe.subscriptionValues[0]); duplicate.id = 'sub_duplicate'; stripe.subscriptionValues.push(duplicate);
    await reconcileLifetimeUsage('owner', deps);
    assert.equal(database.user().billingReview?.reason, 'duplicate_subscriptions');
    assert.equal(hasVerifiedMetering(database.user()), false);
    await applyOneTimeCheckoutPlan(stripe.paidLifetime('cs_paid_again'), deps);
    assert.equal(database.user().lifetimePurchase?.checkoutSessionId, 'cs_paid');
});

test('admin grant chronology allows an intentional later checkout and protects a newer grant', async () => {
    for (const grantAfterCheckout of [true, false]) {
        const { database, stripe, deps } = fixture();
        await createOrResumeCheckout('owner', planFixture({ key: 'lifetime', interval: 'lifetime', stripePriceId: 'price_lifetime' }), urls, deps);
        const user = database.user();
        user.billingEntitlement = { source: 'admin', grantedAt: new Date(user.pendingCheckout!.createdAt.getTime() + (grantAfterCheckout ? 1000 : -1000)) };
        const session = stripe.sessions.get('cs_1')!; session.status = 'complete'; session.payment_status = 'paid'; session.payment_intent = 'pi_paid';
        await applyOneTimeCheckoutPlan(session, deps);
        assert.ok(database.user().lifetimePurchase);
        assert.equal(database.user().billingEntitlement?.source, grantAfterCheckout ? 'admin' : 'lifetime');
        assert.equal(stripe.subscriptionCreates, grantAfterCheckout ? 0 : 1);
        assert.equal(checkoutMayReplaceAdminGrant(user, user.pendingCheckout?.attemptId), !grantAfterCheckout);
    }
});

test('authoritative subscription retrieval applies newer provider state; old unrelated events cannot replace it', async () => {
    const { database, stripe, deps } = fixture({ planKey: 'standard', stripeSubscriptionId: 'sub_current', stripeSubscriptionStatus: 'active',
        billingEntitlement: { source: 'subscription', reference: 'sub_current', grantedAt: new Date() } });
    database.collection('plans').values.push(planFixture() as unknown as Record<string, unknown>);
    const sub = stripe.subscription('sub_current', 'paused', { authSubject: 'owner' });
    sub.items.data.unshift({ id: 'si_base', price: stripe.priceValues.get('price_base')!, current_period_start: 1790812800, current_period_end: 1793491200 } as Stripe.SubscriptionItem);
    stripe.subscriptionValues.push(sub);
    const retrieve = stripe.subscriptions.retrieve;
    let calls = 0;
    stripe.subscriptions.retrieve = async id => { const value = await retrieve(id); if (++calls === 1) value.status = 'active'; return value; };
    await syncSubscription(sub.id, deps);
    assert.equal(database.user().stripeSubscriptionStatus, 'paused');
    assert.equal(hasVerifiedMetering(database.user()), false);
    const unrelated = stripe.subscription('sub_other', 'active', { authSubject: 'owner' });
    assert.equal(canAdoptSubscription(database.user(), unrelated), false);
    stripe.subscriptionValues.push(unrelated);
    await syncSubscription(unrelated.id, deps);
    assert.equal(database.user().stripeSubscriptionId, 'sub_current');
    assert.equal(database.user().billingReview?.reason, 'unexpected_subscription');
});

test('stale billing lease owners cannot persist after takeover or erase a newer grant', async () => {
    const { database, deps } = fixture();
    let resume!: () => void;
    const wait = new Promise<void>(resolve => { resume = resolve; });
    let entered!: () => void;
    const entry = new Promise<void>(resolve => { entered = resolve; });
    const old = withBillingLease(deps.db, 'owner', async (user, owner) => {
        entered(); await wait;
        return deps.db.collection<User>('users').updateOne(billingFence(user, owner), { $set: { planKey: 'stale-write' } });
    });
    await entry;
    database.user().stripeBillingLease!.until = new Date(0);
    await withBillingLease(deps.db, 'owner', async (user, owner) => {
        await deps.db.collection<User>('users').updateOne(billingFence(user, owner), { $set: { planKey: 'new-plan' } });
    });
    resume();
    assert.equal((await old).matchedCount, 0);
    assert.equal(database.user().planKey, 'new-plan');
});

test('webhook deduplication and lease takeover reject acknowledgements from the stale worker', async () => {
    const { database, deps } = fixture();
    const event = { id: 'evt_one', type: 'invoice.paid', created: Math.floor(Date.now() / 1000) } as Stripe.Event;
    assert.equal(await claimWebhookEvent(deps.db, event, 'old'), 'claimed');
    assert.equal(await claimWebhookEvent(deps.db, event, 'next'), 'in_progress');
    database.collection('stripe_webhook_events').values[0].updatedAt = new Date(0);
    assert.equal(await claimWebhookEvent(deps.db, event, 'next'), 'claimed');
    assert.equal(await finishWebhookEvent(deps.db, event.id, 'old'), false);
    assert.equal(await finishWebhookEvent(deps.db, event.id, 'next'), true);
    assert.equal(await claimWebhookEvent(deps.db, event, 'third'), 'already_processed');
});

test('migration preserves known grants, identifies conservative sources, and sends ambiguity to review', () => {
    assert.equal(classifyLegacyBilling(userFixture()).skip, true);
    assert.equal(classifyLegacyBilling(userFixture({ billingEntitlement: undefined, stripeCustomerId: undefined })).entitlement?.source, 'trial');
    assert.equal(classifyLegacyBilling(userFixture({ billingEntitlement: undefined, stripeCustomerId: undefined, planKey: 'internal' })).entitlement?.source, 'admin');
    assert.equal(classifyLegacyBilling(userFixture({ billingEntitlement: undefined, planKey: 'lifetime' })).reviewReason, 'legacy_lifetime_purchase_unverified');
    const legacy = userFixture({ billingEntitlement: undefined, planKey: 'standard', stripeSubscriptionId: 'sub_legacy', stripePriceId: 'price_base' });
    assert.equal(classifyLegacyBilling(legacy).entitlement?.reference, 'sub_legacy');
    const assignment = { _id: legacy._id, createdAt: new Date(), details: { newPlanKey: 'standard' } } as unknown as AdminLog;
    assert.equal(classifyLegacyBilling(legacy, assignment).reviewReason, 'legacy_assignment_and_payment_ambiguous');
});


test('resuming lifetime usage preserves current-period counters instead of granting another allowance', async () => {
    const { database, stripe, deps } = fixture();
    await applyOneTimeCheckoutPlan(stripe.paidLifetime(), deps);
    database.user().storageUsed = 10; database.user().storagePeakUsed = 300; database.user().transcriptionUsed = 200;
    stripe.subscriptionValues[0].status = 'canceled';
    await reconcileLifetimeUsage('owner', deps, { resume: true });
    assert.equal(database.user().storagePeakUsed, 300);
    assert.equal(database.user().transcriptionUsed, 200);
});

test('v2 meter prices reject free tiers and transforms while permitting an independent annual base', async () => {
    const { stripe } = fixture();
    const storage = stripe.priceValues.get('price_storage')!;
    validateMeterPriceUnits(storage, 2000, 'storage');
    assert.throws(() => validateMeterPriceUnits({ ...storage, billing_scheme:'tiered' }, 0, 'storage'), /without included tiers/);
    assert.throws(() => validateMeterPriceUnits({ ...storage, transform_quantity: { divide_by: 1000, round: 'up' } }, 0, 'storage'), /without quantity transforms/);
    stripe.priceValues.get('price_base')!.recurring!.interval = 'year';
    await validateCheckoutPlan(stripe.asStripe(), planFixture({interval:'yearly'}));
});

test('accepted paid transcription receipts survive payment failure, changed admission, admin grants and period rollover', async () => {
    const { database, stripe } = fixture({ billingEntitlement: { source: 'subscription', reference: 'sub_paid', grantedAt: new Date() },
        stripeSubscriptionId: 'sub_paid', stripeSubscriptionStatus: 'active', billingSettings: { allowOverage: false } });
    database.user().stripeMetering = verifiedSubscriptionMeters(stripe.subscription('sub_paid'), { storage: 'price_storage', transcription: 'price_transcription' });
    const acceptedAt = new Date('2026-10-10T12:00:00Z');
    const acceptedBilling = captureTranscriptionBilling(database.user(), acceptedAt);
    assert.ok(acceptedBilling);
    const original = buildUsageEvent('owner', 'transcription', 60, database.user(), { identifier: 'recording:attempt', acceptedBilling, multiplier: 0.5 });
    database.user().billingEntitlement = { source: 'admin', grantedAt: new Date() };
    database.user().stripeSubscriptionStatus = 'past_due';
    database.user().stripeMetering = undefined;
    const completed = buildUsageEvent('owner', 'transcription', 60, database.user(), { identifier: 'recording:attempt', acceptedBilling, multiplier: 0.5 });
    assert.deepEqual(completed, original);
    assert.equal(completed?.value, 30);
    assert.equal(completed?.timestamp, Math.floor(acceptedAt.getTime() / 1000));
    assert.equal(buildUsageEvent('owner', 'transcription', 60, database.user(), { identifier: 'admin:work' }), undefined);
    assert.equal(buildUsageEvent('someone-else', 'transcription', 60, database.user(), { identifier: 'bad', acceptedBilling }), undefined);
    database.user().billingEntitlement = { source: 'subscription', reference: 'sub_paid', grantedAt: new Date() };
    assert.equal(buildUsageEvent('owner', 'transcription', 60, database.user(), { identifier: 'previously-free', acceptedBilling: null }), undefined);
});

test('resumed usage recovers a lost creation response by generation; old cancellation events do not replace it', async () => {
    const { database, stripe, deps } = fixture({ storageUsed: 0 });
    await applyOneTimeCheckoutPlan(stripe.paidLifetime(), deps);
    const old = stripe.subscriptionValues[0]; old.status = 'canceled';
    stripe.throwAfterSubscriptionCreate = true;
    await reconcileLifetimeUsage('owner', deps, { resume: true });
    assert.equal(database.user().lifetimeUsageSetup?.state, 'retrying');
    assert.equal(database.user().lifetimeUsageSetup?.generation, 1);
    await reconcileLifetimeUsage('owner', deps);
    assert.equal(stripe.subscriptionCreates, 2);
    assert.equal(database.user().lifetimeUsageSetup?.state, 'ready');
    const newId = database.user().stripeSubscriptionId;
    assert.notEqual(newId, old.id);
    await syncSubscription(old.id, deps);
    assert.equal(database.user().stripeSubscriptionId, newId);
    assert.equal(database.user().billingReview, undefined);
});

test('invoice-specific failures block independently and clear only their authoritative paid or void invoice', async () => {
    const { syncInvoicePaymentIssue } = await import('./payment-issues');
    const { database, stripe, deps } = fixture({ stripeSubscriptionId: 'sub_current', stripeSubscriptionStatus: 'active',
        billingEntitlement: { source: 'subscription', reference: 'sub_current', grantedAt: new Date() } });
    const invoice = (id: string, subscription = 'sub_current') => ({ id, customer: 'cus_owner', status: 'open', amount_remaining: 500,
        parent: { subscription_details: { subscription } } }) as unknown as Stripe.Invoice;
    stripe.invoiceValues.set('in_first', invoice('in_first'));
    stripe.invoiceValues.set('in_second', invoice('in_second'));
    stripe.invoiceValues.set('in_old', invoice('in_old', 'sub_obsolete'));
    await syncInvoicePaymentIssue('in_first', 'failed', deps);
    await syncInvoicePaymentIssue('in_second', 'action_required', deps);
    await syncInvoicePaymentIssue('in_old', 'failed', deps);
    assert.equal(Object.keys(database.user().stripePaymentIssues || {}).length, 3);
    assert.equal(database.user().stripePaymentIssues?.in_second.state, 'action_required');
    stripe.invoiceValues.get('in_first')!.status = 'paid';
    stripe.invoiceValues.get('in_first')!.amount_remaining = 0;
    await syncInvoicePaymentIssue('in_first', 'failed', deps); // delayed failure event, invoice already paid
    assert.deepEqual(Object.keys(database.user().stripePaymentIssues || {}), ['in_second', 'in_old']);
    stripe.invoiceValues.get('in_second')!.status = 'void';
    await syncInvoicePaymentIssue('in_second', 'reconcile', deps);
    assert.deepEqual(Object.keys(database.user().stripePaymentIssues || {}), ['in_old']);
    assert.equal(database.user().billingEntitlement?.source, 'subscription');
    stripe.invoiceValues.set('in_uncollectible', { ...invoice('in_uncollectible'), status: 'uncollectible' });
    await syncInvoicePaymentIssue('in_uncollectible', 'reconcile', deps);
    assert.equal(database.user().billingReview?.reason, 'uncollectible_invoice');
});

test('production-shaped cron dependencies discover missed debt on previous subscriptions and standalone invoices', async () => {
    const { database, stripe, deps } = fixture({ planKey: 'standard', stripeSubscriptionId: 'sub_current', stripeSubscriptionStatus: 'active',
        billingEntitlement: { source: 'subscription', reference: 'sub_current', grantedAt: new Date() } });
    const current = stripe.subscription('sub_current');
    current.items.data.push({ id: 'si_base', price: stripe.priceValues.get('price_base'), current_period_start: 1790812800, current_period_end: 1793491200 } as Stripe.SubscriptionItem);
    stripe.subscriptionValues.push(current);
    stripe.invoiceValues.set('in_old_debt', { id: 'in_old_debt', customer: 'cus_owner', status: 'open', amount_remaining: 500,
        parent: { subscription_details: { subscription: 'sub_previous' } } } as Stripe.Invoice);
    stripe.invoiceValues.set('in_standalone_debt', { id: 'in_standalone_debt', customer: 'cus_owner', status: 'open', amount_remaining: 250 } as Stripe.Invoice);
    const result = await reconcileBilling(20, deps);
    assert.equal(result.failed, 0);
    assert.equal(database.user().stripePaymentIssues?.in_old_debt.subscriptionId, 'sub_previous');
    assert.equal(database.user().stripePaymentIssues?.in_standalone_debt.subscriptionId, 'standalone');
});

test('production-shaped reconciliation discovers a credit-note balance adjustment without a refund webhook', async () => {
    const { database, stripe, deps } = fixture({ planKey: 'standard', stripeSubscriptionId: 'sub_current', stripeSubscriptionStatus: 'active',
        billingEntitlement: { source: 'subscription', reference: 'sub_current', grantedAt: new Date() } });
    const current = stripe.subscription('sub_current');
    current.items.data.push({ id: 'si_base', price: stripe.priceValues.get('price_base'), current_period_start: 1790812800, current_period_end: 1793491200 } as Stripe.SubscriptionItem);
    stripe.subscriptionValues.push(current);
    stripe.invoiceValues.set('in_credited', { id: 'in_credited', customer: 'cus_owner', status: 'paid', amount_remaining: 0 } as Stripe.Invoice);
    stripe.creditNoteValues.set('cn_missed', { id: 'cn_missed', customer: 'cus_owner', invoice: 'in_credited', status: 'issued',
        currency: 'usd', amount: 500, pre_payment_amount: 0, post_payment_amount: 500, created: 1790812800,
        customer_balance_transaction: 'cbtxn_reversal', refunds: [] } as unknown as Stripe.CreditNote);
    assert.equal((await reconcileBilling(20, deps)).failed, 0);
    assert.equal(database.user().billingReview?.reason, 'credit_note_requires_reconciliation');
    assert.equal(database.collection('billing_credit_note_reviews').values[0].state, 'requires_reconciliation');
    assert.equal(database.user().billingAccount, undefined, 'An uncertain adjustment must not mint cash or initialize a new spending window');
});

test('activation notifications require authoritative active metering for the same subscription', () => {
    const active = userFixture({ stripeSubscriptionId: 'sub_paid', stripeSubscriptionStatus: 'active',
        billingEntitlement: { source: 'subscription', reference: 'sub_paid', grantedAt: new Date() },
        stripeMetering: { subscriptionId: 'sub_paid', storagePriceId: 'price_storage', transcriptionPriceId: 'price_transcription', verifiedAt: new Date() } });
    assert.equal(isVerifiedSubscriptionActivation(active, 'sub_paid'), true);
    for (const user of [null, { ...active, stripeSubscriptionStatus: 'incomplete' as const }, { ...active, stripeMetering: undefined },
        { ...active, billingReview: { reason: 'meter_verification_failed', createdAt: new Date() } }, { ...active, disabled: true }]) {
        assert.equal(isVerifiedSubscriptionActivation(user, 'sub_paid'), false);
    }
    assert.equal(isVerifiedSubscriptionActivation(active, 'sub_old'), false);
});

test('a paid Checkout after terminal cancellation adopts its new usage prices and later sync preserves that subscription tariff', async () => {
    const { database, stripe, deps } = fixture({ planKey: 'standard', storageUsed: 0, stripeSubscriptionId: 'sub_canceled', stripeSubscriptionStatus: 'canceled',
        billingEntitlement: { source: 'subscription', reference: 'sub_canceled', grantedAt: new Date() },
        pendingCheckout: { attemptId: 'returning-checkout', planKey: 'standard', priceId: 'price_base_new', phase: 'completed', params: {}, createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) } });
    const oldPair = clone(database.user().billingUsageTariffs!);
    const selected = planFixture({ stripePriceId: 'price_base_new', stripeStoragePriceId: 'price_storage_new', stripeTranscriptionPriceId: 'price_transcription_new' });
    seedPublishedCatalogFixture(database, [selected], 'unit-cost-v2', 'returning-catalog');
    for (const [source, target] of [['price_base', 'price_base_new'], ['price_storage', 'price_storage_new'], ['price_transcription', 'price_transcription_new']]) {
        stripe.priceValues.set(target, { ...clone(stripe.priceValues.get(source)!), id: target });
    }
    const current = stripe.subscription('sub_new', 'active', { authSubject: 'owner', checkoutAttemptId: 'returning-checkout', billingCatalogVersion: selected.billingCatalogVersion! });
    current.items.data = ['price_base_new', 'price_storage_new', 'price_transcription_new'].map(price => ({ id: `si_${price}`, price: stripe.priceValues.get(price),
        current_period_start: 1790812800, current_period_end: 1793491200 } as Stripe.SubscriptionItem));
    stripe.subscriptionValues.push(current);
    const base = current.items.data[0];
    current.latest_invoice = 'in_new_paid';
    stripe.invoiceValues.set('in_new_paid', { id: 'in_new_paid', customer: 'cus_owner', currency: 'usd', status: 'paid', total: 1000,
        amount_due: 1000, amount_paid: 1000, amount_remaining: 0, metadata: {}, billing_reason: 'subscription_create',
        parent: { subscription_details: { subscription: current.id } }, lines: { has_more: false, data: [{ id: 'il_new_base', amount: 1000, currency: 'usd', quantity: 1,
            period: { start: base.current_period_start, end: base.current_period_end }, pricing: { price_details: { price: 'price_base_new' } },
            parent: { type: 'subscription_item_details', subscription_item_details: { subscription: current.id, subscription_item: base.id, proration: false } } }] } } as unknown as Stripe.Invoice);
    Object.assign(stripe, { invoicePayments: { list: () => ({ async *[Symbol.asyncIterator]() { yield { invoice: 'in_new_paid', currency: 'usd', status: 'paid', amount_paid: 1000,
        payment: { type: 'payment_intent', payment_intent: 'pi_new_paid' } }; } }) } });
    Object.assign(stripe.paymentIntents, { retrieve: async () => ({ id: 'pi_new_paid', status: 'succeeded', customer: 'cus_owner', currency: 'usd', amount_received: 1000,
        latest_charge: { paid: true, refunded: false, disputed: false, amount_refunded: 0, balance_transaction: { currency: 'usd', fee: 0 } } }) });
    await syncSubscription('sub_new', deps);
    assert.equal(database.user().stripeSubscriptionId, 'sub_new');
    assert.equal(database.user().billingReview, undefined);
    assert.equal(database.user().billingUsageTariffs?.storage.priceId, 'price_storage_new');
    assert.equal(database.user().billingUsageCatalogVersion, selected.billingCatalogVersion);
    assert.equal(database.user().stripeMetering?.storagePriceId, 'price_storage_new');
    // A later operator-approved tariff remains independent of the original base.
    database.user().billingUsageTariffs = oldPair;
    database.user().billingUsageCatalogVersion = planFixture().billingCatalogVersion;
    current.items.data = [current.items.data[0], ...stripe.subscription().items.data];
    await syncSubscription('sub_new', deps);
    assert.deepEqual(database.user().billingUsageTariffs, oldPair);
    assert.equal(database.user().stripeMetering?.storagePriceId, oldPair.storage.priceId);
});
