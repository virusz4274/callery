import assert from 'node:assert/strict';

const paidPlanKeys = ['standard', 'pro', 'lifetime'];
const financialCollections = [
  'billing_catalog_versions', 'billing_catalog_acceptance', 'billing_cost_schedules',
  'billing_operations', 'billing_prepaid_topups', 'billing_grant_transfers',
  'billing_grant_scope_operations', 'billing_usage_price_rollouts',
  'billing_usage_receipts', 'billing_financial_archive', 'billing_settlements',
  'billing_deleted_accounts', 'usage_events',
];

/** Read-only checks, invoked only by the disposable acceptance deployment. */
export async function assertFreshBillingBootstrap({ db, request, token, subject, billing }) {
  const plans = await db.collection('plans').find({ key: { $in: paidPlanKeys } }).toArray();
  assert.deepEqual(plans.map(plan => plan.key).sort(), [...paidPlanKeys].sort(), 'Initialization must create every paid installation template.');
  for (const plan of plans) {
    assert.equal(Boolean(plan.stripePriceId || plan.stripeStoragePriceId || plan.stripeTranscriptionPriceId), false,
      'Fresh installation templates must not contain fake Stripe prices.');
  }
  const active = await db.collection('billing_catalog_state').findOne({ _id: 'active' });
  assert.equal(Boolean(active?.bundleId), false, 'Initialization must not publish a financial catalog.');
  assert.equal(await db.collection('billing_catalog_bundles').countDocuments({ state: 'published' }), 0,
    'Fresh initialization must not manufacture a published catalog.');
  const counts = await Promise.all(financialCollections.map(name => db.collection(name).countDocuments()));
  assert.deepEqual(counts, financialCollections.map(() => 0), 'Fresh initialization must not manufacture financial evidence or funding.');

  const user = await db.collection('users').findOne({ authSubject: subject });
  assert.ok(user, 'Fresh signup must have an application profile.');
  assert.equal(Boolean(user.lifetimePurchase || user.stripeCustomerId || user.stripeSubscriptionId), false,
    'Signup must not manufacture Stripe identity or paid ownership.');
  assert.equal(['subscription', 'lifetime'].includes(user.billingEntitlement?.source), false,
    'A seed or signup is not payment proof.');
  if (billing) assert.equal(user.planKey, 'free-trial', 'Fresh managed signups must start on Free Trial.');

  for (const planKey of paidPlanKeys) {
    const response = await request('/api/stripe/checkout', { planKey }, token);
    assert.equal(response.status, billing ? 400 : 403,
      billing ? 'Unpublished installation templates must be rejected before Stripe setup.' : 'Self-hosted Checkout must remain disabled.');
    const body = await response.json();
    assert.equal(typeof body.error, 'string');
    assert.equal(body.url, undefined, 'No payment page may be created from an unpublished template.');
  }
  assert.deepEqual(await Promise.all(financialCollections.map(name => db.collection(name).countDocuments())), counts,
    'Rejected purchases must not create funding, catalog evidence or financial journals.');
  const after = await db.collection('users').findOne({ authSubject: subject });
  for (const field of ['stripeCustomerId', 'stripeSubscriptionId', 'pendingCheckout', 'lifetimePurchase']) {
    assert.deepEqual(after?.[field], user[field], `Rejected purchases must preserve ${field}.`);
  }

  const pricing = await request('/pricing');
  assert.equal(pricing.status, billing ? 200 : 404, 'Pricing visibility must follow the deployment profile.');
  if (billing) assert.match(await pricing.text(), /Paid plans are not published on this instance yet\./,
    'Fresh managed pricing must explain why paid offers are unavailable.');
}

export async function assertFreshBillingPricing(page) {
  await page.getByText('Paid plans are not published on this instance yet. Run the pricing setup before enabling upgrades.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Start on (?:Standard|Pro|Lifetime)$/i }).count(), 0,
    'The fresh managed UI must not offer a paid purchase before catalog publication.');
}
