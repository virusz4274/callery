// Opt-in real sandbox diagnostic, restricted to its own meter/customer/identifiers.
// No application usage/customer records are inserted or changed by this script.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MongoClient } from 'mongodb';
import Stripe from 'stripe';

const types = ['v1.billing.meter.error_report_triggered', 'v1.billing.meter.no_meter_found'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function failure(error) {
  return { type: error.type, code: error.code, status: error.statusCode, requestId: error.requestId,
    message: String(error.message || '').replace(/(?:sk_test_|sk_live_|whsec_)[A-Za-z0-9]+/g, '[redacted]').slice(0, 250) };
}
async function save(file, evidence) { await writeFile(file, JSON.stringify(evidence, null, 2), { mode: 0o600 }); }

/** Retry only real reports containing this private run's exact sample IDs. */
export async function replayThinSandbox({ key, mongoUri, evidencePath, setupPath = '/tmp/vosift-stripe-sandbox-setup.json' }) {
  assert.ok(key?.startsWith('sk_test_')); assert.ok(mongoUri?.startsWith('mongodb'));
  assert.ok(path.resolve(evidencePath).startsWith(`${path.resolve(tmpdir())}${path.sep}`));
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8')), setup = JSON.parse(await readFile(setupPath, 'utf8'));
  assert.match(evidence.runId, /^[0-9a-f-]{36}$/); assert.equal(evidence.origin, setup.origin); assert.equal(setup.origin, 'https://vosift.coarde.com');
  const destination = setup.webhookEndpoints.meter;
  assert.equal(destination.id, evidence.destinationId); assert.ok(destination.secret.startsWith('whsec_'));
  const stripe = new Stripe(key, { maxNetworkRetries: 0, timeout: 30_000 });
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 15_000 });
  try {
    assert.equal((await stripe.accounts.retrieve(null)).id, setup.stripeAccountId);
    await client.connect(); const db = client.db();
    const results = [];
    for await (const event of stripe.v2.core.events.list({ types, created: { gte: evidence.startedAt }, limit: 100 })) {
      const samples = event.data.reason.error_types.flatMap(type => type.sample_errors.map(sample => sample.request.identifier));
      if (!samples.some(identifier => evidence.identifiers.includes(identifier))) continue;
      assert.equal(event.livemode, false); assert.ok(samples.every(identifier => evidence.identifiers.includes(identifier)));
      if (event.type === types[0]) assert.equal(event.related_object.id, evidence.meterId);
      for (const identifier of samples) assert.equal(await db.collection('usage_events').findOne({ _id: identifier.slice(0, identifier.lastIndexOf(':')) }), null);
      const authoritative = await stripe.v2.core.events.retrieve(event.id); assert.equal(authoritative.id, event.id);
      const before = await db.collection('stripe_meter_notifications').findOne({ _id: event.id });
      const payload = JSON.stringify(Object.fromEntries(Object.entries(event).filter(([key]) => ['id', 'object', 'type', 'created', 'livemode', 'context', 'related_object', 'reason'].includes(key))));
      const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: destination.secret });
      const response = await fetch(destination.url, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload });
      assert.equal(response.status, 200, `The public ${event.type} branch must recover this real event.`);
      const row = await db.collection('stripe_meter_notifications').findOne({ _id: event.id });
      assert.equal(row?.state, 'processed'); assert.equal(row.report.rejected, 0); assert.equal(row.report.quarantined, 0); assert.equal(row.report.unmatched, samples.length);
      const duplicate = await fetch(destination.url, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload });
      assert.equal(duplicate.status, 200); assert.equal(await duplicate.text(), 'Already processed');
      const unsigned = await fetch(destination.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload });
      assert.equal(unsigned.status, 400);
      results.push({ id: event.id, type: event.type, authoritativeFetch: true, previousState: before?.state, state: row.state,
        signedReplayStatus: response.status, duplicateStatus: duplicate.status, unsignedStatus: unsigned.status,
        rejected: row.report.rejected, quarantined: row.report.quarantined, unmatched: row.report.unmatched });
    }
    assert.ok(types.every(type => results.some(event => event.type === type)), 'Both real owned meter-error reports must exist.');
    evidence.recognizedEvents = results; evidence.recognizedBranchesVerified = true; evidence.recheckedAt = new Date().toISOString();
    await save(evidencePath, evidence); console.log(JSON.stringify({ evidencePath, recognizedBranchesVerified: true, results }));
    return evidence;
  } finally { await client.close(); }
}

export async function runThinSandbox({ key, mongoUri, setupPath = '/tmp/vosift-stripe-sandbox-setup.json', waitMs = 180_000 }) {
  assert.ok(key?.startsWith('sk_test_'), 'An explicit sandbox key is required; never use a live credential.');
  assert.ok(mongoUri?.startsWith('mongodb'), 'An explicit app database connection is required.');
  const setup = JSON.parse(await readFile(setupPath, 'utf8'));
  assert.equal(setup.origin, 'https://vosift.coarde.com');
  const destination = setup.webhookEndpoints.meter;
  assert.ok(destination.id.startsWith('ed_test_')); assert.ok(destination.secret.startsWith('whsec_'));
  assert.equal(destination.url, `${setup.origin}/api/stripe/meter-webhook`);
  const runId = randomUUID(), file = path.join(tmpdir(), `vosift-thin-sandbox-${runId}.json`);
  const eventName = `vosift_thin_${runId.replaceAll('-', '')}`;
  const invalidName = `${eventName}_missing`;
  const identifiers = [`vosift-thin-${runId}-invalid:1`, `vosift-thin-${runId}-missing:1`];
  const evidence = { schemaVersion: 1, partialAcceptanceOnly: true, notLiveLaunchEvidence: true, runId,
    startedAt: new Date().toISOString(), destinationId: destination.id, origin: setup.origin, identifiers,
    attempts: [], recognizedEvents: [], cleanup: {} };
  const stripe = new Stripe(key, { maxNetworkRetries: 0, timeout: 30_000 });
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 15_000 });
  let meter, customer;
  await save(file, evidence);
  console.log(`Private thin diagnostic evidence: ${file}`);
  try {
    const account = await stripe.accounts.retrieve(null);
    assert.equal(account.id, setup.stripeAccountId);
    const remoteDestination = await stripe.v2.core.eventDestinations.retrieve(destination.id);
    assert.equal(remoteDestination.livemode, false); assert.equal(remoteDestination.event_payload, 'thin');
    assert.equal(remoteDestination.status, 'enabled');
    assert.ok(types.every(type => remoteDestination.enabled_events.includes(type)));
    await client.connect(); const db = client.db();
    for (const identifier of identifiers) assert.equal(await db.collection('usage_events').findOne({ _id: identifier.slice(0, identifier.lastIndexOf(':')) }), null,
      'Fixture samples must never match an application usage receipt.');
    meter = await stripe.billing.meters.create({ display_name: `Owned thin diagnostic ${runId}`, event_name: eventName,
      default_aggregation: { formula: 'sum' }, customer_mapping: { type: 'by_id', event_payload_key: 'stripe_customer_id' },
      value_settings: { event_payload_key: 'value' } }, { idempotencyKey: `thin-meter:${runId}` });
    assert.equal(meter.livemode, false); evidence.meterId = meter.id;
    customer = await stripe.customers.create({ name: `Owned thin diagnostic ${runId}`, metadata: { vosift_thin_fixture: runId } },
      { idempotencyKey: `thin-customer:${runId}` });
    assert.equal(customer.livemode, false); evidence.customerId = customer.id;
    await save(file, evidence);
    const malformed = [
      { event_name: eventName, identifier: identifiers[0], payload: { stripe_customer_id: customer.id, value: 'not-a-number' } },
      { event_name: invalidName, identifier: identifiers[1], payload: { stripe_customer_id: customer.id, value: '1' } },
    ];

    // This is the public stripe-cli trigger strategy. Current docs call the
    // high-throughput stream live-only, so a sandbox rejection is evidence of a
    // testing limitation, never a reason to switch credentials or modes.
    try {
      const session = await stripe.v2.billing.meterEventSession.create({});
      assert.equal(session.livemode, false);
      const streaming = new Stripe(session.authentication_token, { maxNetworkRetries: 0, timeout: 30_000 });
      await streaming.v2.billing.meterEventStream.create({ events: malformed.map(event => ({ ...event, timestamp: new Date().toISOString() })) });
      evidence.attempts.push({ method: 'official-cli-v2-stream', accepted: true });
    } catch (error) { evidence.attempts.push({ method: 'official-cli-v2-stream', accepted: false, error: failure(error) }); }

    for (const [index, event] of malformed.entries()) {
      try {
        await stripe.billing.meterEvents.create(event, { idempotencyKey: `thin-v1:${runId}:${index}` });
        evidence.attempts.push({ method: 'v1-meter-event', case: index, accepted: true });
      } catch (error) { evidence.attempts.push({ method: 'v1-meter-event', case: index, accepted: false, error: failure(error) }); }
    }
    await save(file, evidence);
    const deadline = Date.now() + waitMs;
    do {
      const page = stripe.v2.core.events.list({ types, created: { gte: evidence.startedAt }, limit: 100 });
      for await (const event of page) {
        if (evidence.recognizedEvents.some(found => found.id === event.id)) continue;
        const samples = event.data.reason.error_types.flatMap(type => type.sample_errors.map(sample => sample.request.identifier));
        if (!samples.some(identifier => identifiers.includes(identifier))) continue;
        assert.equal(event.livemode, false);
        assert.ok(samples.every(identifier => identifiers.includes(identifier)), 'Mixed/other-account errors are not owned diagnostic events.');
        if (event.type === types[0]) assert.equal(event.related_object.id, meter.id);
        const authoritative = await stripe.v2.core.events.retrieve(event.id);
        assert.equal(authoritative.type, event.type);
        let row = await db.collection('stripe_meter_notifications').findOne({ _id: event.id });
        let signedReplay = false;
        const automaticDeadline = Date.now() + 20_000;
        while (row?.state !== 'processed' && Date.now() < automaticDeadline) {
          await sleep(2000);
          row = await db.collection('stripe_meter_notifications').findOne({ _id: event.id });
        }
        if (row?.state !== 'processed') {
          const notification = Object.fromEntries(Object.entries(event).filter(([key]) => ['id', 'object', 'type', 'created', 'livemode', 'context', 'related_object', 'reason'].includes(key)));
          const payload = JSON.stringify(notification);
          const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: destination.secret });
          const response = await fetch(destination.url, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload });
          assert.equal(response.status, 200, 'The public handler must verify, authoritatively fetch and process this real owned error event.');
          signedReplay = true;
          row = await db.collection('stripe_meter_notifications').findOne({ _id: event.id });
        }
        assert.equal(row?.state, 'processed'); assert.equal(row.report.rejected, 0); assert.equal(row.report.quarantined, 0);
        assert.equal(row.report.unmatched, samples.length);
        evidence.recognizedEvents.push({ id: event.id, type: event.type, authoritativeFetch: true, state: row.state,
          automaticDelivery: !signedReplay, signedReplay, rejected: row.report.rejected, quarantined: row.report.quarantined,
          unmatched: row.report.unmatched, totalErrors: row.report.totalErrors });
        await save(file, evidence);
      }
      if (types.every(type => evidence.recognizedEvents.some(event => event.type === type))) break;
      if (Date.now() < deadline) await sleep(10_000);
    } while (Date.now() < deadline);

    // A real Stripe ping proves only signature/routing, not the recognized
    // meter-error reconciliation branch. Keep it explicitly separate.
    const ping = await stripe.v2.core.eventDestinations.ping(destination.id);
    assert.equal(ping.livemode, false);
    const fetchedPing = await stripe.v2.core.events.retrieve(ping.id);
    const payload = JSON.stringify({ id: ping.id, object: ping.object, type: ping.type, created: ping.created, livemode: false });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: destination.secret });
    const replay = await fetch(destination.url, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload });
    const unsigned = await fetch(destination.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload });
    evidence.ping = { id: ping.id, type: fetchedPing.type, signedStatus: replay.status, unsignedStatus: unsigned.status,
      response: (await replay.text()).slice(0, 100), recognizedMeterErrorProof: false };
    assert.equal(replay.status, 200); assert.equal(unsigned.status, 400);
    evidence.recognizedBranchesVerified = types.every(type => evidence.recognizedEvents.some(event => event.type === type));
    evidence.finishedAt = new Date().toISOString();
  } finally {
    if (meter) {
      try {
        const current = await stripe.billing.meters.retrieve(meter.id);
        assert.equal(current.livemode, false); assert.equal(current.event_name, eventName);
        if (current.status !== 'inactive') await stripe.billing.meters.deactivate(meter.id);
        evidence.cleanup.meterDeactivated = true;
      } catch (error) { evidence.cleanup.meterError = failure(error); }
    }
    if (customer) {
      try {
        const current = await stripe.customers.retrieve(customer.id);
        assert.equal(current.livemode, false); assert.equal(current.metadata.vosift_thin_fixture, runId);
        await stripe.customers.del(customer.id); evidence.cleanup.customerDeleted = true;
      } catch (error) { evidence.cleanup.customerError = failure(error); }
    }
    await save(file, evidence); await client.close();
  }
  console.log(JSON.stringify({ evidencePath: file, recognizedBranchesVerified: evidence.recognizedBranchesVerified,
    recognizedEvents: evidence.recognizedEvents, attempts: evidence.attempts, ping: evidence.ping, cleanup: evidence.cleanup }));
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const configuration = { key: process.env.VOSIFT_TEST_STRIPE_SECRET_KEY, mongoUri: process.env.VOSIFT_TEST_MONGODB_URI,
    setupPath: process.env.VOSIFT_TEST_STRIPE_SETUP_PATH, waitMs: Number(process.env.VOSIFT_TEST_THIN_WAIT_MS || 180_000) };
  const execution = process.argv[2] === 'replay'
    ? replayThinSandbox({ ...configuration, evidencePath: process.argv[3] }) : runThinSandbox(configuration);
  execution
    .catch(error => { console.error(JSON.stringify(failure(error))); process.exitCode = 1; });
}
