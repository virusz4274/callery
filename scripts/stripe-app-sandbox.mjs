// Real application/Stripe sandbox diagnostic. This is NOT complete launch evidence.
// Explicit process-only variables are required; deployment .env files are never loaded.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hashPassword } from 'better-auth/crypto';
import { MongoClient, ObjectId } from 'mongodb';
import { chromium } from '@playwright/test';
import Stripe from 'stripe';

const OWNER = 'vosift-stripe-app-sandbox-v1';
const ORIGIN = 'https://vosift.coarde.com';
const MARKER = 'stripeSandboxFixtureRunId';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const objectId = value => typeof value === 'string' ? value : value?.id;

export function readSandboxConfig(environment = process.env) {
  const key = environment.VOSIFT_TEST_STRIPE_SECRET_KEY?.trim();
  assert.ok(key?.startsWith('sk_test_'), 'Set an explicit VOSIFT_TEST_STRIPE_SECRET_KEY=sk_test_…; live and fallback credentials are forbidden.');
  const app = new URL(environment.VOSIFT_TEST_APP_URL || '');
  assert.equal(app.origin, ORIGIN, 'This diagnostic is authorized only for https://vosift.coarde.com.');
  assert.equal(app.href, `${ORIGIN}/`, 'Supply the application origin without a path, query or credentials.');
  const mongoUri = environment.VOSIFT_TEST_MONGODB_URI?.trim();
  assert.ok(mongoUri && /^mongodb(?:\+srv)?:\/\//.test(mongoUri), 'Set an explicit VOSIFT_TEST_MONGODB_URI; application connection fallbacks are forbidden.');
  const parsedMongo = new URL(mongoUri);
  assert.ok(parsedMongo.pathname.length > 1, 'An explicit application database name is required.');
  const accountId = environment.VOSIFT_TEST_STRIPE_ACCOUNT_ID?.trim();
  const catalogId = environment.VOSIFT_TEST_BILLING_CATALOG_ID?.trim();
  assert.match(accountId || '', /^acct_[A-Za-z0-9]+$/, 'Pin VOSIFT_TEST_STRIPE_ACCOUNT_ID to the approved sandbox account.');
  assert.ok(catalogId, 'Pin VOSIFT_TEST_BILLING_CATALOG_ID to the published sandbox bundle.');
  const webhookSecret = environment.VOSIFT_TEST_STRIPE_WEBHOOK_SECRET?.trim();
  if (webhookSecret) assert.ok(webhookSecret.startsWith('whsec_'), 'Use the explicit test payment-webhook signing secret.');
  return { key, app: app.origin, mongoUri, accountId, catalogId, webhookSecret };
}

export function assertOwnedFixture(state, profile, customer) {
  assert.equal(state.owner, OWNER);
  assert.match(state.runId, /^[0-9a-f-]{36}$/);
  assert.equal(profile?.authSubject, state.fixture.subject);
  assert.equal(profile?.email, state.fixture.email);
  assert.equal(profile?.[MARKER], state.runId, 'The application profile must be owned by this exact run.');
  assert.equal(profile?.stripeCustomerId, customer?.id);
  assert.equal(customer?.deleted, undefined);
  assert.equal(customer?.livemode, false, 'Never mutate a live customer.');
  assert.equal(customer?.metadata?.authSubject, state.fixture.subject);
  assert.equal(customer?.metadata?.vosift_sandbox_fixture, state.runId, 'Never mutate a customer from another diagnostic run.');
}

export async function eventually(label, read, ready, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  do {
    last = await read();
    if (ready(last)) return last;
    await pause(2000);
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for ${label}; no acceptance is claimed. Resume this run after diagnosing it.`);
}

function privateStatePath(candidate) {
  const resolved = path.resolve(candidate);
  assert.ok(resolved.startsWith(`${path.resolve(tmpdir())}${path.sep}`), 'Private diagnostic state must be stored under the system temporary directory.');
  assert.ok(resolved.endsWith('.json') && !path.basename(resolved).startsWith('.env'), 'Use an owned temporary JSON state file.');
  return resolved;
}

async function saveState(statePath, state) {
  try {
    const current = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(current.owner, OWNER); assert.equal(current.runId, state.runId, 'A different run owns this state file.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = `${statePath}.${state.runId}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  await rename(temporary, statePath);
  await writeFile(`${statePath}.evidence.json`, JSON.stringify({ partialAcceptanceOnly: true,
    notLiveLaunchEvidence: true, runId: state.runId, app: state.app, stripeAccountId: state.accountId,
    catalogId: state.catalogId, startedAt: state.startedAt, finishedAt: state.finishedAt,
    checkpoint: state.checkpoint, subject: state.fixture?.subject, customerId: state.customerId, checks: state.checks }, null, 2), { mode: 0o600 });
}

async function loadState(statePath, configuration) {
  try {
    const saved = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(saved.owner, OWNER); assert.equal(saved.app, configuration.app);
    assert.equal(saved.accountId, configuration.accountId); assert.equal(saved.catalogId, configuration.catalogId);
    return saved;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { owner: OWNER, runId: randomUUID(), app: configuration.app, accountId: configuration.accountId,
      catalogId: configuration.catalogId, startedAt: new Date().toISOString(), checks: [] };
  }
}

function requestClient(origin, sessionToken) {
  return async (pathname, { method = 'GET', body, token = sessionToken, requestOrigin = origin, raw = false, headers = {} } = {}) => {
    const response = await fetch(new URL(pathname, origin), { method,
      headers: { origin: requestOrigin, ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}), redirect: 'manual' });
    if (raw) return response;
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${method} ${pathname} returned ${response.status}: ${String(result.error || 'Request failed').slice(0, 250)}`);
    return result;
  };
}

async function preflight(configuration, db, stripe) {
  const account = await stripe.accounts.retrieve(null);
  assert.equal(account.id, configuration.accountId, 'The test key belongs to a different Stripe account.');
  const active = await db.collection('billing_catalog_state').findOne({ _id: 'active' });
  assert.equal(active?.bundleId, configuration.catalogId, 'The published application catalog changed; do not continue using stale terms.');
  const catalog = await db.collection('billing_catalog_bundles').findOne({ _id: active.bundleId, state: 'published' });
  assert.ok(catalog); assert.equal(catalog.livemode, false); assert.equal(catalog.stripeAccountId, account.id);
  for (const [key, amount] of [['standard', 1000], ['pro', 2000], ['lifetime', 25000]]) {
    const plan = catalog.plans.find(entry => entry.plan.key === key);
    assert.ok(plan, `The published catalog requires ${key}.`);
    const price = await stripe.prices.retrieve(plan.plan.stripePriceId);
    assert.equal(price.livemode, false); assert.equal(price.currency, 'usd'); assert.equal(price.unit_amount, amount);
    assert.equal(price.active, true);
  }
  const capabilities = await requestClient(configuration.app)('/api/auth/capabilities');
  assert.equal(capabilities.emailVerificationRequired, true, 'The public app must be in managed mode with verification configured.');
  return catalog;
}

async function createFixture(state, statePath, db, configuration) {
  if (!state.fixture) {
    const identity = new ObjectId(), account = new ObjectId();
    state.fixture = { subject: identity.toHexString(), accountId: account.toHexString(),
      email: `vosift-stripe-${state.runId}@example.invalid`, password: randomBytes(32).toString('base64url') };
    // Journal exact owned IDs before the first write so interruption is recoverable.
    await saveState(statePath, state);
  }
  const fixture = state.fixture, identity = new ObjectId(fixture.subject), now = new Date();
  const current = await db.collection('user').findOne({ _id: identity });
  if (current) {
    assert.equal(current.email, fixture.email); assert.equal(current[MARKER], state.runId);
  } else await db.collection('user').insertOne({ _id: identity, name: 'VoSift Stripe sandbox fixture', email: fixture.email,
    emailVerified: true, createdAt: now, updatedAt: now, [MARKER]: state.runId });
  const credential = await db.collection('account').findOne({ _id: new ObjectId(fixture.accountId) });
  if (credential) {
    assert.equal(credential.userId.toString(), fixture.subject); assert.equal(credential[MARKER], state.runId);
  } else await db.collection('account').insertOne({ _id: new ObjectId(fixture.accountId), userId: identity,
    accountId: fixture.subject, providerId: 'credential', password: await hashPassword(fixture.password), createdAt: now, updatedAt: now,
    [MARKER]: state.runId });
  const login = await requestClient(configuration.app)('/api/auth/sign-in/email', { method: 'POST',
    body: { email: fixture.email, password: fixture.password } });
  assert.ok(login.token, 'The real application must authenticate the owned fixture.');
  assert.equal(login.user.id, fixture.subject);
  const result = await db.collection('users').updateOne({ authSubject: fixture.subject, email: fixture.email,
    $or: [{ [MARKER]: { $exists: false } }, { [MARKER]: state.runId }] }, { $set: { [MARKER]: state.runId,
      'notificationSettings.activityDigest': 'off', 'transcriptionSettings.autoTranscribe': false } });
  assert.equal(result.matchedCount, 1, 'The fixture must have exactly its own application profile.');
  return requestClient(configuration.app, login.token);
}

async function ownedCustomer(state, db, stripe) {
  const profile = await db.collection('users').findOne({ authSubject: state.fixture.subject, [MARKER]: state.runId });
  assert.ok(profile?.stripeCustomerId);
  let customer = await stripe.customers.retrieve(profile.stripeCustomerId);
  if (!customer.deleted && !customer.metadata.vosift_sandbox_fixture) {
    assert.equal(customer.livemode, false); assert.equal(customer.metadata.authSubject, state.fixture.subject);
    assert.equal(customer.email, state.fixture.email);
    customer = await stripe.customers.update(customer.id, { metadata: { vosift_sandbox_fixture: state.runId } });
  }
  assertOwnedFixture(state, profile, customer);
  if (state.customerId) assert.equal(customer.id, state.customerId);
  state.customerId = customer.id;
  return { profile, customer };
}

async function financialSnapshot(state, db) {
  const profile = await db.collection('users').findOne({ authSubject: state.fixture.subject, [MARKER]: state.runId });
  return JSON.parse(JSON.stringify({ planKey: profile.planKey, entitlement: profile.billingEntitlement, lifetimePurchase: profile.lifetimePurchase,
    billingAccount: profile.billingAccount, stripeSubscriptionId: profile.stripeSubscriptionId }));
}

async function findEvent(state, stripe, type, reference) {
  for await (const event of stripe.events.list({ types: [type], created: { gte: Math.floor(new Date(state.startedAt).getTime() / 1000) - 60 }, limit: 100 })) {
    if (event.data.object.id !== reference) continue;
    assert.equal(event.livemode, false);
    const customer = objectId(event.data.object.customer);
    assert.equal(customer, state.customerId, 'Only this run’s real Stripe events may be replayed.');
    return event;
  }
  return null;
}

async function signedReplay(configuration, state, event, request) {
  assert.ok(configuration.webhookSecret, 'Set VOSIFT_TEST_STRIPE_WEBHOOK_SECRET for owned real-event replay tests.');
  assert.equal(event.livemode, false);
  assert.equal(objectId(event.data.object.customer), state.customerId);
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: configuration.webhookSecret });
  const response = await request('/api/stripe/webhook', { method: 'POST', body: payload, raw: true,
    headers: { 'stripe-signature': signature } });
  assert.equal(response.status, 200, 'The deployed public payment webhook must process the signed real sandbox event.');
}

async function waitForWebhook(configuration, state, db, stripe, request, type, reference) {
  const event = await eventually(`real ${type} event`, () => findEvent(state, stripe, type, reference), Boolean);
  let automatic = false;
  try {
    await eventually('automatic Stripe delivery to the public webhook', () => db.collection('stripe_webhook_events').findOne({ _id: event.id }),
      row => row?.status === 'processed', 30_000);
    automatic = true;
  } catch (error) {
    if (!configuration.webhookSecret) throw error;
    await signedReplay(configuration, state, event, request);
    await eventually('owned signed event processing', () => db.collection('stripe_webhook_events').findOne({ _id: event.id }), row => row?.status === 'processed');
  }
  return { event, automaticDelivery: automatic };
}

async function fillField(page, selectors, value, required = false) {
  for (const frame of page.frames()) for (const selector of selectors) {
    const field = frame.locator(selector).first();
    if (!await field.isVisible().catch(() => false) || !await field.isEnabled().catch(() => false)) continue;
    const tag = await field.evaluate(element => element.tagName);
    if (tag === 'SELECT') await field.selectOption(value); else await field.fill(value);
    return true;
  }
  if (required) throw new Error('A hosted payment field needs manual completion. No challenge or anti-automation mechanism will be bypassed.');
  return false;
}

export async function completeHostedPayment(url, isPaid, statePath, label, headed, { require3ds = false } = {}) {
  const target = new URL(url);
  assert.equal(target.protocol, 'https:');
  assert.ok(['checkout.stripe.com', 'invoice.stripe.com', 'pay.stripe.com'].includes(target.hostname), 'Only ordinary Stripe-hosted payment pages may receive test cards.');
  const proof = { challengeObserved: false, issuerOrigin: undefined, testCardLast4: require3ds ? '3220' : '4242' };
  if (await isPaid()) return { ...proof, alreadyPaid: true };
  const browser = await chromium.launch({ headless: !headed });
  try {
    const checkout = target.hostname === 'checkout.stripe.com';
    const page = await browser.newPage({ viewport: { width: 1280, height: checkout ? 1000 : 1100 } });
    await page.goto(target.href, { waitUntil: 'domcontentloaded' });
    // Hosted Invoices load their Payment Element after the initial document.
    // Do not mistake the ordinary faded loading shell for a missing pay flow.
    const confirm = page.getByRole('button', { name: /^Confirm payment/i }).first();
    const initialSubmit = page.locator('button[type="submit"]:visible').filter({ hasText: /pay|subscribe/i }).last();
    await confirm.or(initialSubmit).first().waitFor({ state: 'visible', timeout: 30_000 });
    // An owned invoice awaiting authentication keeps its previously selected
    // card and offers a normal confirmation control instead of the initial form.
    const resumingAuthentication = await confirm.isVisible().catch(() => false);
    const submit = resumingAuthentication ? confirm : initialSubmit;
    if (await page.getByText(/verify you are human|security challenge|complete the captcha/i).first().isVisible().catch(() => false)) {
      throw new Error('Stripe requests human verification. Complete this owned payment manually and resume the private state file.');
    }
    if (!resumingAuthentication) {
      if (checkout) await fillField(page, ['#email', 'input[type="email"]'], 'sandbox@example.invalid');
      let card = false;
      const fieldsDeadline = Date.now() + 20_000;
      do {
        card = await fillField(page, ['#cardNumber', 'input[name="cardnumber"]', 'input[autocomplete~="cc-number"]'], require3ds ? '4000000000003220' : '4242424242424242');
        if (card || await page.getByText(/ending in|••••|saved card/i).first().isVisible().catch(() => false)) break;
        await pause(500);
      } while (Date.now() < fieldsDeadline);
      if (card) {
        await fillField(page, ['#cardExpiry', 'input[name="exp-date"]', 'input[autocomplete~="cc-exp"]'], '12/30', true);
        await fillField(page, ['#cardCvc', 'input[name="cvc"]', 'input[autocomplete~="cc-csc"]'], '123', true);
      }
      if (checkout) {
        await fillField(page, ['#billingName', 'input[autocomplete="cc-name"]'], 'VoSift Sandbox');
        await fillField(page, ['#billingCountry', 'select[autocomplete~="country"]'], 'US');
        await fillField(page, ['#billingAddressLine1', 'input[autocomplete="address-line1"]'], '123 Test Street');
        await fillField(page, ['#billingLocality', 'input[autocomplete="address-level2"]'], 'San Francisco');
        await fillField(page, ['#billingAdministrativeArea', 'select[autocomplete="address-level1"]'], 'CA');
      }
      await fillField(page, ['#billingPostalCode', 'input[autocomplete~="postal-code"]'], '94105');
      // Commit the last hosted field before Stripe snapshots its Payment Element.
      for (const frame of page.frames()) {
        const postal = frame.locator('input[autocomplete~="postal-code"]').first();
        if (await postal.isVisible().catch(() => false)) { await postal.press('Tab'); break; }
      }
      await pause(1000);
      // Close the ordinary address suggestion list before pressing the visible
      // button; an autocomplete result can otherwise cover it after field fill.
      await page.keyboard.press('Escape');
    }
    if (await submit.isVisible().catch(() => false) && await submit.isEnabled().catch(() => false)) {
      // Ordinary keyboard activation moves focus out of the address dropdown
      // and preserves the hosted form's validation and authentication flow.
      await submit.focus();
      await submit.press('Enter');
    }
    else throw new Error('The ordinary Stripe-hosted page needs manual completion. The payment URL is retained only in private state.');
    try {
      await eventually(`${label} hosted test payment`, async () => {
        if (require3ds && !proof.challengeObserved) for (const frame of page.frames()) {
          let origin;
          try { origin = new URL(frame.url()).origin; } catch { continue; }
          if (!['https://hooks.stripe.com', 'https://js.stripe.com', 'https://testmode-acs.stripe.com'].includes(origin)) continue;
          // This is the ordinary Stripe sandbox issuer approval, never a CAPTCHA.
          const complete = frame.getByRole('button', { name: /^(?:Complete|Complete authentication|Authorize)$/i }).first();
          if (!await complete.isVisible().catch(() => false)) continue;
          const text = await frame.locator('body').innerText();
          if (!/3D Secure|3DS|test payment|test authentication/i.test(text)) continue;
          proof.challengeObserved = true; proof.issuerOrigin = origin;
          const folder = `${statePath}.screenshots`; await mkdir(folder, { recursive: true, mode: 0o700 });
          await page.screenshot({ path: path.join(folder, `${label}-3ds-challenge.png`), fullPage: true });
          await complete.click(); break;
        }
        return isPaid();
      }, Boolean, headed ? 5 * 60_000 : 90_000);
      return proof;
    }
    catch (error) {
      const folder = `${statePath}.screenshots`; await mkdir(folder, { recursive: true, mode: 0o700 });
      await page.screenshot({ path: path.join(folder, `${label}.png`), fullPage: true });
      error.sandboxPaymentEvidence = proof;
      throw error;
    }
  } finally { await browser.close(); }
}

async function record(state, statePath, name, evidence) {
  state.checks = state.checks.filter(check => check.name !== name);
  state.checks.push({ name, passedAt: new Date().toISOString(), ...evidence });
  await saveState(statePath, state);
  console.log(`Passed: ${name}`);
}

async function assertSubscription(state, stripe, catalog, planKey, profile) {
  const entry = catalog.plans.find(entry => entry.plan.key === planKey);
  const subscription = await stripe.subscriptions.retrieve(profile.stripeSubscriptionId);
  assert.equal(subscription.livemode, false); assert.equal(objectId(subscription.customer), state.customerId);
  assert.equal(subscription.status, 'active'); assert.equal(subscription.billing_mode.type, 'flexible');
  const expected = [entry.usageTariffs.storage.priceId, entry.usageTariffs.transcription.priceId,
    ...(planKey === 'lifetime' ? [] : [entry.plan.stripePriceId])].sort();
  assert.deepEqual(subscription.items.data.map(item => item.price.id).sort(), expected);
  assert.equal(profile.stripeMetering?.subscriptionId, subscription.id);
  assert.equal(profile.stripeMetering?.storagePriceId, entry.usageTariffs.storage.priceId);
  assert.equal(profile.stripeMetering?.transcriptionPriceId, entry.usageTariffs.transcription.priceId);
  return subscription;
}

async function paymentGuards(request) {
  for (const pathname of ['/api/stripe/checkout', '/api/stripe/usage-topup', '/api/stripe/plan-change/preview']) {
    assert.equal((await request(pathname, { method: 'POST', body: { planKey: 'standard' }, token: '', raw: true })).status, 401);
    assert.equal((await request(pathname, { method: 'POST', body: { planKey: 'standard' }, requestOrigin: 'https://invalid.example', raw: true })).status, 403);
  }
  assert.equal((await request('/api/stripe/usage-topup', { method: 'POST', body: { amountMinor: 499 }, raw: true })).status, 400);
  for (const pathname of ['/api/stripe/webhook', '/api/stripe/meter-webhook']) {
    assert.equal((await request(pathname, { method: 'POST', body: { id: 'unsigned-diagnostic', type: 'not_a_real_event' }, raw: true })).status, 400);
  }
}

/** Create and attach only this run's test decline card. Preserve every existing
 * customer/subscription/invoice default and journal the ID before attachment. */
export async function ensureOwnedDeclinePaymentMethod(state, change, stripe, persist) {
  assert.equal(state.owner, OWNER); assert.match(state.runId, /^[0-9a-f-]{36}$/);
  assert.ok(state.customerId?.startsWith('cus_')); assert.ok(change.id);
  let method;
  const validateOwner = current => {
    assert.equal(current.livemode, false); assert.equal(current.type, 'card');
    assert.equal(current.metadata.vosift_sandbox_fixture, state.runId);
    assert.equal(current.metadata.purpose, 'upgrade_decline'); assert.equal(current.metadata.operationId, change.id);
    assert.ok(!objectId(current.customer) || objectId(current.customer) === state.customerId, 'The decline card must never belong to another customer.');
  };
  if (change.declinePaymentMethodId) {
    method = await stripe.paymentMethods.retrieve(change.declinePaymentMethodId);
    validateOwner(method);
    if (method.metadata.decline_fixture !== 'attach_succeeds_charge_fails_v2') {
      // The original 0002 fixture declines during attachment, before an invoice
      // payment occurs. Preserve its ID and replace only that owned, unattached
      // fixture with Stripe's documented 0341 decline-after-attaching card.
      assert.equal(objectId(method.customer), undefined);
      assert.equal(method.card?.last4, '0002', 'An unknown card fixture requires review instead of replacement.');
      change.retiredDeclinePaymentMethodIds = [...new Set([...(change.retiredDeclinePaymentMethodIds || []), method.id])];
      delete change.declinePaymentMethodId; method = undefined;
      await persist();
    }
  }
  if (!change.declinePaymentMethodId) {
    method = await stripe.paymentMethods.create({ type: 'card', card: { token: 'tok_chargeCustomerFail' },
      metadata: { vosift_sandbox_fixture: state.runId, purpose: 'upgrade_decline', operationId: change.id,
        decline_fixture: 'attach_succeeds_charge_fails_v2' } },
    { idempotencyKey: `sandbox-decline-method-v2:${state.runId}:${change.id}` });
    validateOwner(method);
    change.declinePaymentMethodId = method.id;
    change.declineFixturePhase = 'created';
    await persist();
  }
  assert.equal(method.id, change.declinePaymentMethodId); assert.equal(method.livemode, false);
  validateOwner(method); assert.equal(method.card?.last4, '0341');
  const customer = objectId(method.customer);
  if (!customer) method = await stripe.paymentMethods.attach(method.id, { customer: state.customerId },
    { idempotencyKey: `sandbox-attach-decline-v2:${state.runId}:${change.id}` });
  assert.equal(method.livemode, false); assert.equal(objectId(method.customer), state.customerId);
  if (change.declineFixturePhase !== 'attached') { change.declineFixturePhase = 'attached'; await persist(); }
  return method.id;
}

async function runCheckout(configuration, state, statePath, db, stripe, request, catalog, headed) {
  if (!state.standardCheckout) {
    const entry = catalog.plans.find(entry => entry.plan.key === 'standard');
    const checkout = await request('/api/stripe/checkout', { method: 'POST', body: { planKey: 'standard', catalogVersion: entry.catalogVersion } });
    await ownedCustomer(state, db, stripe);
    const profile = await db.collection('users').findOne({ authSubject: state.fixture.subject });
    state.standardCheckout = { id: profile.pendingCheckout.sessionId, url: checkout.url };
    await saveState(statePath, state);
  }
  await ownedCustomer(state, db, stripe);
  const id = state.standardCheckout.id;
  let session = await stripe.checkout.sessions.retrieve(id);
  assert.equal(session.livemode, false); assert.equal(objectId(session.customer), state.customerId);
  assert.equal(session.client_reference_id, state.fixture.subject); assert.equal(session.amount_total, 1000);
  await completeHostedPayment(state.standardCheckout.url, async () => {
    session = await stripe.checkout.sessions.retrieve(id);
    return session.status === 'complete' && session.payment_status === 'paid';
  }, statePath, 'standard-checkout', headed);
  const delivery = await waitForWebhook(configuration, state, db, stripe, request, 'checkout.session.completed', id);
  const profile = await eventually('paid Standard entitlement and exact meter setup', () => db.collection('users').findOne({ authSubject: state.fixture.subject }),
    profile => profile?.planKey === 'standard' && profile?.stripeMetering && profile?.stripeSubscriptionStatus === 'active');
  const subscription = await assertSubscription(state, stripe, catalog, 'standard', profile);
  const customer = await stripe.customers.retrieve(state.customerId);
  assert.ok(!customer.deleted && customer.name && customer.address?.line1 && customer.address?.country,
    'Checkout must save the collected customer billing details for later usage and plan-change invoices.');
  const invoice = await stripe.invoices.retrieve(objectId(subscription.latest_invoice));
  assert.equal(invoice.status, 'paid'); assert.equal(invoice.amount_paid, 1000);
  await record(state, statePath, 'Standard real Checkout and paid metering bootstrap', { sessionId: id, invoiceId: invoice.id,
    amountPaidMinor: invoice.amount_paid, subscriptionId: subscription.id, eventId: delivery.event.id, automaticDelivery: delivery.automaticDelivery });
}

async function runTopup(configuration, state, statePath, db, stripe, request, headed) {
  if (!state.topup) {
    const topup = await request('/api/stripe/usage-topup', { method: 'POST', body: { amountMinor: 500, currency: 'usd' } });
    const attempt = await db.collection('billing_prepaid_topups').findOne({ _id: topup.attemptId, authSubject: state.fixture.subject });
    assert.ok(attempt?.sessionId);
    state.topup = { attemptId: topup.attemptId, id: attempt.sessionId, url: topup.url };
    await saveState(statePath, state);
  }
  const id = state.topup.id;
  await ownedCustomer(state, db, stripe);
  await completeHostedPayment(state.topup.url, async () => {
    const session = await stripe.checkout.sessions.retrieve(id);
    assert.equal(session.livemode, false); assert.equal(objectId(session.customer), state.customerId); assert.equal(session.amount_total, 500);
    return session.status === 'complete' && session.payment_status === 'paid';
  }, statePath, 'usage-topup', headed);
  const delivery = await waitForWebhook(configuration, state, db, stripe, request, 'checkout.session.completed', id);
  const attempt = await eventually('one paid prepaid grant', () => db.collection('billing_prepaid_topups').findOne({ _id: state.topup.attemptId, authSubject: state.fixture.subject }),
    attempt => attempt?.state === 'complete' && attempt.creditGrantId);
  const grant = await stripe.billing.creditGrants.retrieve(attempt.creditGrantId);
  assert.equal(objectId(grant.customer), state.customerId); assert.equal(grant.category, 'paid'); assert.equal(grant.amount.monetary.value, 500);
  const wallet = await request('/api/stripe/usage-topup');
  assert.equal(wallet.fundedMicros, 5_000_000); assert.equal(wallet.spentMicros, 0);
  await record(state, statePath, 'USD 5 real top-up funds one usage grant and one local lot', { sessionId: id, grantId: grant.id,
    paymentIntentId: attempt.paymentIntentId, fundedMicros: wallet.fundedMicros, eventId: delivery.event.id, automaticDelivery: delivery.automaticDelivery });
  if (configuration.webhookSecret) {
    const before = await financialSnapshot(state, db);
    await signedReplay(configuration, state, delivery.event, request);
    await signedReplay(configuration, state, delivery.event, request);
    assert.deepEqual(await financialSnapshot(state, db), before, 'Duplicate signed real events must not mint money or alter entitlements.');
    await record(state, statePath, 'Duplicate signed real payment webhooks are idempotent', { eventId: delivery.event.id });
  }
}

async function runChange(configuration, state, statePath, db, stripe, request, catalog, target, headed, lifetime3ds = false) {
  const key = `${target}Change`, source = target === 'pro' ? 'standard' : 'pro';
  if (!state[key]) {
    const preview = await request('/api/stripe/plan-change/preview', { method: 'POST', body: { planKey: target } });
    assert.ok(preview.id); assert.equal(preview.targetPlanKey, target); assert.equal(preview.requiresPayment, true);
    state[key] = { id: preview.id, preview, sourceSubscriptionId: (await ownedCustomer(state, db, stripe)).profile.stripeSubscriptionId };
    await saveState(statePath, state);
  }
  const change = state[key];
  let operation = await request(`/api/stripe/plan-change/${change.id}`);
  if (!['awaiting_payment', 'applied', 'needs_review'].includes(operation.state)) {
    operation = await request('/api/stripe/plan-change', { method: 'POST', body: { previewId: change.id, storageOverageConsent: true } });
  }
  assert.notEqual(operation.state, 'needs_review', 'A money/proof disagreement must be investigated, never counted as success.');
  change.invoiceId = operation.invoiceId; change.url = operation.paymentUrl || change.url;
  await saveState(statePath, state);
  if (operation.state !== 'applied') {
    assert.equal(operation.state, 'awaiting_payment'); assert.equal(operation.sourcePlanUsable, true);
    const profile = (await ownedCustomer(state, db, stripe)).profile;
    assert.equal(profile.planKey, source); assert.equal(profile.stripeSubscriptionId, change.sourceSubscriptionId);
    await assertSubscription(state, stripe, catalog, source, profile);
    assert.equal((await request('/api/stripe/billing/status')).usageReady, true, 'The paid source plan stays usable while the voluntary invoice is unpaid.');
    if (target === 'pro' && !change.declineChecked) {
      const methodId = await ensureOwnedDeclinePaymentMethod(state, change, stripe, () => saveState(statePath, state));
      let declined = false;
      try { await stripe.invoices.pay(change.invoiceId, { payment_method: methodId },
        { idempotencyKey: `${state.runId}:upgrade-decline-attached:${methodId}` }); }
      catch (error) { declined = error.type === 'StripeCardError' || error.code === 'card_declined'; if (!declined) throw error; }
      assert.equal(declined, true, 'The real test payment must fail authoritatively.');
      const failed = await stripe.invoices.retrieve(change.invoiceId);
      assert.equal(failed.status, 'open'); assert.equal(failed.amount_paid, 0);
      const delivery = await waitForWebhook(configuration, state, db, stripe, request, 'invoice.payment_failed', failed.id);
      assert.equal((await request('/api/stripe/billing/status')).usageReady, true);
      const current = (await ownedCustomer(state, db, stripe)).profile;
      assert.equal(current.planKey, source); await assertSubscription(state, stripe, catalog, source, current);
      change.declineChecked = true; await saveState(statePath, state);
      await record(state, statePath, 'Failed real upgrade payment preserves paid Standard access', { invoiceId: failed.id,
        eventId: delivery.event.id, automaticDelivery: delivery.automaticDelivery });
    }
    try { change.hostedPaymentProof = await completeHostedPayment(change.url, async () => {
      const invoice = await stripe.invoices.retrieve(change.invoiceId);
      assert.equal(objectId(invoice.customer), state.customerId); assert.equal(invoice.livemode, false);
      return invoice.status === 'paid';
    }, statePath, `${target}-hosted-invoice`, headed, { require3ds: target === 'lifetime' && lifetime3ds }); }
    catch (error) { change.hostedPaymentProof = error.sandboxPaymentEvidence; await saveState(statePath, state); throw error; }
    await saveState(statePath, state);
  }
  const invoice = await stripe.invoices.retrieve(change.invoiceId);
  assert.equal(invoice.status, 'paid'); assert.equal(invoice.amount_paid, change.preview.amountDueMinor);
  const delivery = await waitForWebhook(configuration, state, db, stripe, request, 'invoice.paid', invoice.id);
  const profile = await eventually(`immediate paid ${target} activation`, () => db.collection('users').findOne({ authSubject: state.fixture.subject }),
    profile => profile?.planKey === target && profile?.stripeMetering && !profile?.billingOperation);
  const subscription = await assertSubscription(state, stripe, catalog, target, profile);
  assert.equal(subscription.id, change.sourceSubscriptionId, 'An immediate conversion must preserve the usage subscription.');
  assert.equal((await request(`/api/stripe/plan-change/${change.id}`)).state, 'applied');
  const invoiceLots = Object.values(profile.billingAccount?.fundingLots || {}).filter(lot => lot.reference === invoice.id);
  assert.equal(invoiceLots.length, 1, 'The real cash payment must create one immutable funding lot.');
  assert.equal(invoiceLots[0].kind, target === 'lifetime' ? 'lifetime' : 'base', 'Invoice funding must preserve the purchased plan role.');
  if (target === 'lifetime') {
    assert.equal(profile.lifetimePurchase?.proof, 'invoice'); assert.equal(profile.lifetimePurchase?.invoiceId, invoice.id);
    assert.equal(profile.storageAllocation, 0); assert.equal(profile.transcriptionAllocation, 0);
    if (lifetime3ds) {
      const proofs = [];
      for await (const payment of stripe.invoicePayments.list({ invoice: invoice.id, status: 'paid', limit: 100 })) {
        const intentId = objectId(payment.payment.payment_intent);
        if (!intentId) continue;
        const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge'] });
        assert.equal(intent.livemode, false); assert.equal(objectId(intent.customer), state.customerId);
        const charge = intent.latest_charge;
        if (!charge || typeof charge === 'string') continue;
        assert.equal(charge.paid, true); assert.equal(charge.livemode, false); assert.equal(objectId(charge.customer), state.customerId);
        proofs.push({ paymentIntentId: intent.id, chargeId: charge.id, status: intent.status,
          cardLast4: charge.payment_method_details?.card?.last4, threeDSecure: charge.payment_method_details?.card?.three_d_secure });
      }
      change.bankVerification = { requested: true, challengeObserved: Boolean(change.hostedPaymentProof?.challengeObserved), payments: proofs,
        verified: Boolean(change.hostedPaymentProof?.challengeObserved && proofs.some(proof => proof.cardLast4 === '3220'
          && proof.threeDSecure?.authentication_flow === 'challenge' && proof.threeDSecure?.result === 'authenticated')) };
      await saveState(statePath, state);
      if (change.bankVerification.verified) await record(state, statePath, 'Lifetime normal hosted bank verification and authoritative 3DS challenge proof', change.bankVerification);
      else console.log('Lifetime bank verification remains unproven; paid conversion is recorded separately.');
    }
  }
  await record(state, statePath, `Immediate paid ${source} to ${target} conversion`, { operationId: change.id, invoiceId: invoice.id,
    amountPaidMinor: invoice.amount_paid, sourceSubscriptionId: change.sourceSubscriptionId, subscriptionId: subscription.id,
    eventId: delivery.event.id, automaticDelivery: delivery.automaticDelivery, baseCreditMinor: change.preview.baseCreditMinor,
    fundingKind: invoiceLots[0].kind });
}

export async function runAppSandbox(configuration, { statePath, headed = false, lifetime3ds = false, stopAfterStandard = false } = {}) {
  const destination = privateStatePath(statePath || path.join(tmpdir(), `vosift-app-sandbox-${randomUUID()}.json`));
  const state = await loadState(destination, configuration);
  const client = new MongoClient(configuration.mongoUri, { serverSelectionTimeoutMS: 15_000 });
  const stripe = new Stripe(configuration.key, { maxNetworkRetries: 0, timeout: 30_000 });
  console.log(`Private diagnostic state: ${destination}`);
  try {
    await client.connect(); const db = client.db();
    const catalog = await preflight(configuration, db, stripe);
    await saveState(destination, state);
    const request = await createFixture(state, destination, db, configuration);
    await paymentGuards(request);
    await record(state, destination, 'Public APIs enforce authentication, origin, minimum top-up and webhook signatures', {});
    if (!state.checks.some(check => check.name === 'Standard real Checkout and paid metering bootstrap')) await runCheckout(configuration, state, destination, db, stripe, request, catalog, headed);
    if (stopAfterStandard) {
      state.checkpoint = { stage: 'standard_paid', stoppedAt: new Date().toISOString() };
      await saveState(destination, state);
      console.log('Stopped at paid Standard checkpoint. Top-up and plan changes were not run; this is partial diagnostic evidence.');
      return { statePath: destination, evidencePath: `${destination}.evidence.json`, checkpoint: 'standard_paid' };
    }
    if (!state.checks.some(check => check.name === 'USD 5 real top-up funds one usage grant and one local lot')) await runTopup(configuration, state, destination, db, stripe, request, headed);
    if (!state.checks.some(check => check.name === 'Immediate paid standard to pro conversion')) await runChange(configuration, state, destination, db, stripe, request, catalog, 'pro', headed);
    if (!state.checks.some(check => check.name === 'Immediate paid pro to lifetime conversion')) await runChange(configuration, state, destination, db, stripe, request, catalog, 'lifetime', headed, lifetime3ds);
    delete state.checkpoint; state.finishedAt = new Date().toISOString(); await saveState(destination, state);
    console.log('Real application sandbox diagnostic completed. This partial record does not enable live billing.');
    return { statePath: destination, evidencePath: `${destination}.evidence.json` };
  } finally { await client.close(); }
}

export async function cleanupAppSandbox(configuration, statePath) {
  const destination = privateStatePath(statePath), state = await loadState(destination, configuration);
  assert.ok(state.fixture && state.customerId, 'Cleanup requires an existing owned diagnostic run.');
  const client = new MongoClient(configuration.mongoUri, { serverSelectionTimeoutMS: 15_000 });
  const stripe = new Stripe(configuration.key, { maxNetworkRetries: 0, timeout: 30_000 });
  try {
    await client.connect(); const db = client.db();
    const { profile } = await ownedCustomer(state, db, stripe);
    // Disable only this profile before canceling its owned Stripe resources.
    await db.collection('users').updateOne({ _id: profile._id, [MARKER]: state.runId }, { $set: { disabled: true } });
    for await (const subscription of stripe.subscriptions.list({ customer: state.customerId, status: 'all', limit: 100 })) {
      assert.equal(subscription.livemode, false);
      if (subscription.status !== 'canceled') await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false });
    }
    for await (const invoice of stripe.invoices.list({ customer: state.customerId, limit: 100 })) {
      assert.equal(invoice.livemode, false);
      if (invoice.status === 'draft') await stripe.invoices.del(invoice.id);
      else if (invoice.status === 'open') await stripe.invoices.voidInvoice(invoice.id);
    }
    for await (const grant of stripe.billing.creditGrants.list({ customer: state.customerId, limit: 100 })) {
      if (!grant.voided_at && (!grant.expires_at || grant.expires_at > Date.now() / 1000)) await stripe.billing.creditGrants.expire(grant.id);
    }
    await stripe.customers.del(state.customerId);
    const userId = new ObjectId(state.fixture.subject);
    await db.collection('session').deleteMany({ userId });
    await db.collection('account').deleteOne({ _id: new ObjectId(state.fixture.accountId), userId, [MARKER]: state.runId });
    await db.collection('user').deleteOne({ _id: userId, email: state.fixture.email, [MARKER]: state.runId });
    state.cleanedAt = new Date().toISOString(); await saveState(destination, state);
    console.log('Owned test customer, subscriptions and credentials cleaned up. Disabled application/financial evidence remains for review.');
  } finally { await client.close(); }
}

async function main() {
  const [command, ...arguments_] = process.argv.slice(2);
  assert.ok(['run', 'cleanup'].includes(command), 'Usage: node scripts/stripe-app-sandbox.mjs run [--state /tmp/owned.json] [--headed] [--lifetime-3ds] [--stop-after-standard], or cleanup --state /tmp/owned.json');
  const stateIndex = arguments_.indexOf('--state'), statePath = stateIndex >= 0 ? arguments_[stateIndex + 1] : undefined;
  const configuration = readSandboxConfig();
  if (command === 'cleanup') { assert.ok(statePath, 'Cleanup requires --state.'); await cleanupAppSandbox(configuration, statePath); }
  else await runAppSandbox(configuration, { statePath, headed: arguments_.includes('--headed'), lifetime3ds: arguments_.includes('--lifetime-3ds'),
    stopAfterStandard: arguments_.includes('--stop-after-standard') });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(String(error.message || 'Sandbox diagnostic failed.').replace(/(?:sk_test_|sk_live_|whsec_)[A-Za-z0-9]+/g, '[redacted]'));
    process.exitCode = 1;
  });
}
