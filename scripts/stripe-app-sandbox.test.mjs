import assert from 'node:assert/strict';
import test from 'node:test';
import { assertOwnedFixture, ensureOwnedDeclinePaymentMethod, readSandboxConfig } from './stripe-app-sandbox.mjs';

function environment() {
  return { VOSIFT_TEST_STRIPE_SECRET_KEY: ['sk', 'test', 'fixture'].join('_'), VOSIFT_TEST_APP_URL: 'https://vosift.coarde.com',
    VOSIFT_TEST_MONGODB_URI: 'mongodb://127.0.0.1:27017/explicit-test-target', VOSIFT_TEST_STRIPE_ACCOUNT_ID: 'acct_fixture',
    VOSIFT_TEST_BILLING_CATALOG_ID: 'reviewed-sandbox-catalog' };
}

test('real app sandbox requires explicit sandbox credentials, account, catalog, origin and database', () => {
  const config = readSandboxConfig(environment());
  assert.equal(config.app, 'https://vosift.coarde.com'); assert.equal(config.accountId, 'acct_fixture');
  for (const [key, value] of [
    ['VOSIFT_TEST_STRIPE_SECRET_KEY', ['sk', 'live', 'forbidden'].join('_')],
    ['VOSIFT_TEST_APP_URL', 'https://different.example'], ['VOSIFT_TEST_APP_URL', 'https://vosift.coarde.com/other'],
    ['VOSIFT_TEST_MONGODB_URI', 'mongodb://127.0.0.1:27017'], ['VOSIFT_TEST_STRIPE_ACCOUNT_ID', ''],
    ['VOSIFT_TEST_BILLING_CATALOG_ID', ''],
  ]) assert.throws(() => readSandboxConfig({ ...environment(), [key]: value }), key);
  const fallback = environment(); delete fallback.VOSIFT_TEST_STRIPE_SECRET_KEY;
  fallback.STRIPE_SECRET_KEY = environment().VOSIFT_TEST_STRIPE_SECRET_KEY;
  assert.throws(() => readSandboxConfig(fallback), /explicit/);
});

test('owned fixture mutations require matching run, profile, Stripe account identity and sandbox mode', () => {
  const runId = '00000000-0000-4000-a000-000000000001';
  const state = { owner: 'vosift-stripe-app-sandbox-v1', runId, fixture: { subject: 'own-subject', email: 'own@example.invalid' } };
  const profile = { authSubject: state.fixture.subject, email: state.fixture.email, stripeCustomerId: 'cus_owned', stripeSandboxFixtureRunId: runId };
  const customer = { id: 'cus_owned', livemode: false, metadata: { authSubject: state.fixture.subject, vosift_sandbox_fixture: runId } };
  assert.doesNotThrow(() => assertOwnedFixture(state, profile, customer));
  for (const unsafe of [
    { ...customer, livemode: true }, { ...customer, deleted: true }, { ...customer, id: 'cus_someone_else' },
    { ...customer, metadata: { ...customer.metadata, vosift_sandbox_fixture: 'other-run' } },
    { ...customer, metadata: { ...customer.metadata, authSubject: 'other-owner' } },
  ]) assert.throws(() => assertOwnedFixture(state, profile, unsafe));
  assert.throws(() => assertOwnedFixture(state, { ...profile, stripeSandboxFixtureRunId: 'other-run' }, customer));
});

test('decline card is journaled before attachment, reused after recovery and never replaces defaults', async () => {
  const runId = '00000000-0000-4000-a000-000000000001';
  const state = { owner: 'vosift-stripe-app-sandbox-v1', runId, customerId: 'cus_owned' }, change = { id: 'owned-operation' };
  let method, created = 0, attached = 0, persisted = 0;
  const stripe = { paymentMethods: {
    create: async (params, options) => {
      created++; assert.equal(params.card.token, 'tok_chargeCustomerFail'); assert.ok(options.idempotencyKey.includes(runId));
      method = { id: 'pm_owned_decline', livemode: false, type: 'card', card: { last4: '0341' }, metadata: params.metadata, customer: null }; return method;
    },
    retrieve: async id => { assert.equal(id, method.id); return method; },
    attach: async (id, params) => {
      attached++; assert.equal(id, change.declinePaymentMethodId); assert.equal(persisted, 1, 'Remote attachment must follow durable ID storage.');
      assert.equal(params.customer, state.customerId); method = { ...method, customer: state.customerId }; return method;
    },
  } };
  assert.equal(await ensureOwnedDeclinePaymentMethod(state, change, stripe, async () => { persisted++; }), 'pm_owned_decline');
  assert.equal(await ensureOwnedDeclinePaymentMethod(state, change, stripe, async () => { persisted++; }), 'pm_owned_decline');
  assert.deepEqual({ created, attached, persisted }, { created: 1, attached: 1, persisted: 2 });
  for (const invalid of [
    { ...method, livemode: true }, { ...method, customer: 'cus_someone_else' },
    { ...method, metadata: { ...method.metadata, vosift_sandbox_fixture: 'other-run' } },
  ]) {
    stripe.paymentMethods.retrieve = async () => invalid;
    await assert.rejects(ensureOwnedDeclinePaymentMethod(state, change, stripe, async () => {}));
  }
  assert.equal(attached, 1);
});

test('unattachable legacy decline fixture is retired without losing its ID or changing customer defaults', async () => {
  const runId = '00000000-0000-4000-a000-000000000001';
  const state = { owner: 'vosift-stripe-app-sandbox-v1', runId, customerId: 'cus_owned' };
  const change = { id: 'owned-operation', declinePaymentMethodId: 'pm_old_unattachable' };
  const metadata = { vosift_sandbox_fixture: runId, purpose: 'upgrade_decline', operationId: change.id };
  let persisted = 0;
  const stripe = { paymentMethods: {
    retrieve: async () => ({ id: 'pm_old_unattachable', livemode: false, type: 'card', card: { last4: '0002' }, metadata, customer: null }),
    create: async params => {
      assert.deepEqual(change.retiredDeclinePaymentMethodIds, ['pm_old_unattachable']); assert.equal(persisted, 1);
      return { id: 'pm_new_attachable', livemode: false, type: 'card', card: { last4: '0341' }, metadata: params.metadata, customer: null };
    },
    attach: async id => {
      assert.equal(id, 'pm_new_attachable'); assert.equal(change.declinePaymentMethodId, id); assert.equal(persisted, 2);
      return { id, livemode: false, customer: state.customerId };
    },
  } };
  assert.equal(await ensureOwnedDeclinePaymentMethod(state, change, stripe, async () => { persisted++; }), 'pm_new_attachable');
  assert.equal(change.declineFixturePhase, 'attached'); assert.deepEqual(change.retiredDeclinePaymentMethodIds, ['pm_old_unattachable']);
});
