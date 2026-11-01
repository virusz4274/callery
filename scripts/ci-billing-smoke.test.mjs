import assert from 'node:assert/strict';
import test from 'node:test';
import { assertFreshBillingBootstrap } from './ci-billing-smoke.mjs';

function fixture(billing = true) {
  const plans = ['standard', 'pro', 'lifetime'].map(key => ({ key, stripePriceId: '' }));
  const user = { authSubject: 'new-account', planKey: 'free-trial', billingEntitlement: { source: 'trial' } };
  const counts = new Map();
  const state = {};
  const db = { collection: name => ({
    find: () => ({ toArray: async () => plans }),
    findOne: async () => name === 'users' ? structuredClone(user) : state.active,
    countDocuments: async () => counts.get(name) || 0,
  }) };
  const calls = [];
  const stateful = { handle: async (pathname, body, token) => {
    calls.push({ pathname, body, token });
    if (pathname === '/pricing') return new Response(billing ? 'Paid plans are not published on this instance yet.' : 'Not Found', { status: billing ? 200 : 404 });
    return Response.json({ error: billing ? 'Invalid plan.' : 'Billing is disabled on this instance.' }, { status: billing ? 400 : 403 });
  } };
  const run = () => assertFreshBillingBootstrap({ db, request: (...args) => stateful.handle(...args), token: 'session', subject: user.authSubject, billing });
  return { run, calls, plans, user, counts, state, stateful };
}

test('fresh managed smoke checks every paid template and unpublished pricing without creating financial state', async () => {
  const { run, calls } = fixture();
  await run();
  assert.deepEqual(calls.map(call => call.body?.planKey || call.pathname), ['standard', 'pro', 'lifetime', '/pricing']);
  assert.ok(calls.slice(0, 3).every(call => call.token === 'session'), 'Checkout checks must authenticate instead of passing only because of a 401.');
});

test('self-host smoke requires disabled Checkout and hidden pricing', async () => {
  await fixture(false).run();
});

test('fresh-seed smoke refuses manufactured Stripe IDs, published catalog, ownership or funding', async () => {
  const invalid = [
    f => { f.plans[0].stripePriceId = 'price_fake'; },
    f => { f.state.active = { bundleId: 'fake-publication' }; },
    f => { f.user.lifetimePurchase = { proof: 'invoice' }; },
    f => { f.counts.set('billing_prepaid_topups', 1); },
    f => { f.user.planKey = 'internal'; },
  ];
  for (const change of invalid) {
    const f = fixture(); change(f);
    await assert.rejects(f.run());
    assert.equal(f.calls.length, 0, 'Unsafe seed data must fail before exercising payment requests.');
  }
});

test('smoke rejects accidental successful Checkout, wrong rejection status and hidden financial mutations', async () => {
  for (const status of [200, 401, 403, 500]) {
    const f = fixture();
    f.stateful.handle = async () => Response.json({ url: 'https://checkout.invalid' }, { status });
    await assert.rejects(f.run(), /Unpublished installation templates/);
  }
  const f = fixture(), original = f.stateful.handle;
  f.stateful.handle = async (...args) => {
    const response = await original(...args);
    f.counts.set('billing_operations', 1);
    return response;
  };
  await assert.rejects(f.run(), /Rejected purchases must not create/);
});

test('smoke detects user provisioning during a rejected purchase and missing pricing setup guidance', async () => {
  const changed = fixture(), original = changed.stateful.handle;
  changed.stateful.handle = async (...args) => {
    const response = await original(...args); changed.user.stripeCustomerId = 'cus_unexpected'; return response;
  };
  await assert.rejects(changed.run(), /preserve stripeCustomerId/);
  const hidden = fixture(), valid = hidden.stateful.handle;
  hidden.stateful.handle = (...args) => args[0] === '/pricing' ? Promise.resolve(new Response('Choose Standard')) : valid(...args);
  await assert.rejects(hidden.run(), /explain why paid offers/);
});
