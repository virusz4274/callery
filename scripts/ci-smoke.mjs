// Called only by ci-acceptance.mjs against its disposable loopback deployment.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { MongoClient, ObjectId } from 'mongodb';
import { S3Client, CreateBucketCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { chromium } from '@playwright/test';
import { encryptGoogleRefreshToken, decryptGoogleRefreshToken } from '../src/services/google/refresh-token-crypto.ts';
import { waitUntil } from './ci-acceptance.mjs';
import { resolvePackageChain } from './dependency-patch.mjs';
import { assertFreshBillingBootstrap, assertFreshBillingPricing } from './ci-billing-smoke.mjs';

const base = new URL(process.env.TEST_BASE_URL);
const uri = new URL(process.env.VOSIFT_TEST_API_MONGODB_URI);
const storage = new URL(process.env.VOSIFT_TEST_STORAGE_ENDPOINT);
const mailpit = new URL(process.env.TEST_MAILPIT_URL);
for (const url of [base, uri, storage, mailpit]) assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Fixtures must use loopback services.');
assert.ok(uri.pathname.startsWith('/vosift_api_'), 'A disposable API database is required.');
const mongo = new MongoClient(uri.toString());
const db = mongo.db(uri.pathname.slice(1));
const restored = mongo.db(`${uri.pathname.slice(1)}_restore`);
const s3 = new S3Client({ endpoint: storage.href, forcePathStyle: true, region: 'us-east-1', credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
const email = 'operator@acceptance.invalid';
const password = 'AcceptancePassword123!';
const recoveredPassword = 'RecoveredAcceptancePassword123!';
const otherEmail = 'other@acceptance.invalid';
const sha = data => createHash('sha256').update(data).digest('hex');
const call = (pathname, body, token, options = {}) => fetch(new URL(pathname, base), {
  ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
  headers: { origin: base.origin, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
  ...options,
});
async function signIn(targetEmail = email, targetPassword = recoveredPassword) {
  const response = await call('/api/auth/sign-in/email', { email: targetEmail, password: targetPassword });
  assert.equal(response.status, 200, 'Fixture login must succeed.');
  return (await response.json()).token;
}
async function emailLink(recipient, subject) {
  let link;
  await waitUntil(async () => {
    const response = await fetch(new URL(`/api/v1/search?query=${encodeURIComponent(`to:${recipient} subject:${subject}`)}`, mailpit));
    if (!response.ok) return false;
    const messages = (await response.json()).messages || [];
    if (!messages.length) return false;
    const message = await (await fetch(new URL(`/api/v1/message/${messages[0].ID}`, mailpit))).json();
    link = message.HTML?.match(/href="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
    return Boolean(link);
  }, 'SMTP delivery');
  const url = new URL(link); assert.equal(url.origin, base.origin, 'Mail links must preserve the isolated public origin.');
  return url;
}
function wav() {
  const audio = Buffer.alloc(44 + 16000);
  audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(16000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write('data', 36); audio.writeUInt32LE(16000, 40);
  return audio;
}
async function seed() {
  const signup = await call('/api/auth/sign-up/email', { name: 'Acceptance Operator', email, password, callbackURL: '/recordings' });
  assert.equal(signup.status, 200);
  const identity = await signup.json(); assert.equal(identity.token, null);
  assert.equal((await call('/api/auth/sign-in/email', { email, password })).status, 403);
  assert.equal((await db.collection('users').findOne({ authSubject: identity.user.id }))?.role, 'user');
  const verification = await emailLink(email, 'Verify');
  assert.equal((await fetch(verification, { redirect: 'manual' })).status, 302);
  const session = await signIn(email, password);
  assert.equal((await db.collection('users').findOne({ authSubject: identity.user.id }))?.role, 'admin');
  await assertFreshBillingBootstrap({ db, request: call, token: session, subject: identity.user.id,
    billing: process.env.NEXT_PUBLIC_ENABLE_BILLING === 'true' });
  await db.collection('users').updateOne({ authSubject: identity.user.id }, { $set: {
    'transcriptionSettings.autoTranscribe': false, 'notificationSettings.activityDigest': 'off',
    googleSync: { status: 'not_connected', ...encryptGoogleRefreshToken('acceptance-refresh-token') },
  } });
  const credentials = await call('/api/user/api-tokens', { name: 'Acceptance upload', scopes: ['recordings:upload', 'recordings:read', 'recordings:download'] }, session);
  assert.equal(credentials.status, 201); const apiToken = (await credentials.json()).data.secret;
  const audio = wav();
  const upload = async () => {
    const form = new FormData();
    form.append('metadata', JSON.stringify({ fileName: 'acceptance.wav', fileSize: audio.length, recordedAt: '2026-10-01T12:00:00Z', source: 'acceptance', externalId: 'first-call' }));
    form.append('file', new Blob([audio], { type: 'audio/wav' }), 'acceptance.wav');
    const response = await fetch(new URL('/api/v1/recordings', base), { method: 'POST', body: form, headers: { authorization: `Bearer ${apiToken}`, 'idempotency-key': 'acceptance-first-call' } });
    assert.equal(response.status, 201, 'Real multipart audio upload must succeed.'); return (await response.json()).data;
  };
  const first = await upload(); const repeated = await upload();
  assert.equal(first.recordingId, repeated.recordingId, 'A retry must not duplicate the recording.');
  const record = await db.collection('recordings').findOne({ _id: new ObjectId(first.recordingId) });
  assert.equal(await db.collection('recordings').countDocuments({ authSubject: identity.user.id }), 1);
  assert.equal((await db.collection('users').findOne({ authSubject: identity.user.id })).storageUsed, audio.length);
  const download = await call(`/api/v1/recordings/${first.recordingId}/download`, undefined, apiToken);
  assert.equal(download.status, 200); const signedUrl = (await download.json()).data.url;
  const playback = await fetch(signedUrl); assert.equal(playback.status, 200);
  assert.equal(sha(Buffer.from(await playback.arrayBuffer())), sha(audio));
  assert.equal((await fetch(new URL(`/acceptance/${record.r2Key}`, storage))).status, 403, 'Unsigned object access must be private.');
  assert.equal((await call('/api/cron/process-ingestion')).status, 401);
  assert.equal((await call('/api/cron/process-ingestion', undefined, process.env.CRON_SECRET)).status, 200);
  await call('/api/auth/request-password-reset', { email, redirectTo: '/reset-password' });
  const resetLink = await emailLink(email, 'Reset');
  const resetRedirect = await fetch(resetLink, { redirect: 'manual' });
  const resetToken = new URL(resetRedirect.headers.get('location'), base).searchParams.get('token'); assert.ok(resetToken);
  assert.equal((await call('/api/auth/reset-password', { token: resetToken, newPassword: recoveredPassword })).status, 200);
  assert.equal((await call('/api/user/profile', undefined, session)).status, 401, 'Recovery must revoke the previous session.');
  await signIn();
  assert.equal((await call('/api/auth/sign-up/email', { name: 'Other Acceptance User', email: otherEmail, password, callbackURL: '/recordings' })).status, 200);
  assert.equal((await fetch(await emailLink(otherEmail, 'Verify'), { redirect: 'manual' })).status, 302);
  // Real browser sign-in complements fixture component suites and API checks.
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(); await page.goto(new URL('/login', base).href);
    await page.getByPlaceholder('you@company.com').fill(email);
    await page.getByPlaceholder('Enter your password').fill(recoveredPassword);
    await page.getByRole('button', { name: /^Sign In$/i }).click();
    await page.waitForURL('**/recordings');
    await page.getByRole('heading', { name: /^Recordings$/i, level: 1 }).waitFor();
    if (process.env.NEXT_PUBLIC_ENABLE_BILLING === 'true') {
      await page.goto(new URL('/pricing', base).href);
      await assertFreshBillingPricing(page);
    }
    await page.goto(new URL('/upload', base).href);
    await page.locator('input[type="file"]').setInputFiles({ name: 'acceptance-browser.wav', mimeType: 'audio/wav', buffer: audio });
    await page.getByRole('button', { name: /Upload All/i }).click();
    await page.getByText('Files uploaded successfully').waitFor({ timeout: 60_000 });
    assert.equal(await db.collection('recordings').countDocuments({ authSubject: identity.user.id, fileName: 'acceptance-browser.wav' }), 1, 'The real browser upload must reach private object storage.');
  } finally { await browser.close(); }
  const updatedUser = await db.collection('users').findOne({ authSubject: identity.user.id });
  await db.collection('acceptance_manifest').insertOne({ _id: 'sample', subject: identity.user.id, recordingId: first.recordingId, bytes: audio.length, storageUsed: updatedUser.storageUsed, sha256: sha(audio) });
  console.log('Fresh unpublished billing gates, real SMTP verification/reset, administrator bootstrap, browser login, private upload and playback passed.');
}
async function listObjects(bucket) {
  const items = []; let cursor;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: cursor }));
    items.push(...page.Contents || []); cursor = page.NextContinuationToken;
  } while (cursor);
  return items;
}
async function restore() {
  for await (const collection of db.listCollections()) {
    const indexes = await db.collection(collection.name).indexes();
    // MongoDB's own TTL monitor continues while the app is stopped. Expiring
    // cache/session documents may disappear between dump and comparison.
    if (!indexes.some(index => index.expireAfterSeconds !== undefined)) {
      assert.equal(await restored.collection(collection.name).countDocuments(), await db.collection(collection.name).countDocuments(), 'Restore must preserve durable collection counts.');
    }
    assert.deepEqual(await restored.collection(collection.name).indexes(), indexes, 'Restore must preserve ordinary indexes.');
  }
  await s3.send(new CreateBucketCommand({ Bucket: 'acceptance-restore' }));
  const objects = await listObjects('acceptance'); assert.ok(objects.length);
  for (const object of objects) {
    const original = await s3.send(new GetObjectCommand({ Bucket: 'acceptance', Key: object.Key }));
    const bytes = await original.Body.transformToByteArray();
    await s3.send(new PutObjectCommand({ Bucket: 'acceptance-restore', Key: object.Key, Body: bytes, ContentType: original.ContentType }));
    const copied = await s3.send(new GetObjectCommand({ Bucket: 'acceptance-restore', Key: object.Key }));
    assert.equal(sha(await copied.Body.transformToByteArray()), sha(bytes));
  }
  assert.equal((await listObjects('acceptance-restore')).length, objects.length);
  await restored.collection('session').deleteMany({});
  const state = await restored.collection('acceptance_manifest').findOne({ _id: 'sample' });
  const user = await restored.collection('users').findOne({ authSubject: state.subject });
  assert.equal(decryptGoogleRefreshToken(user.googleSync.refreshTokenCiphertext), 'acceptance-refresh-token');
  assert.equal(user.storageUsed, state.storageUsed);
  console.log('Database-tools restore preserved records/indexes; bucket restore preserved object keys, sizes and hashes; saved encryption key decrypts copied state.');
}
async function verifyRestore() {
  const state = await restored.collection('acceptance_manifest').findOne({ _id: 'sample' });
  const session = await signIn();
  const profile = await call('/api/user/profile', undefined, session); assert.equal(profile.status, 200);
  const credential = (await (await call('/api/user/api-tokens', { name: 'Restored download', scopes: ['recordings:read', 'recordings:download'] }, session)).json()).data.secret;
  const download = await call(`/api/v1/recordings/${state.recordingId}/download`, undefined, credential);
  assert.equal(download.status, 200);
  const audio = await fetch((await download.json()).data.url); assert.equal(audio.status, 200);
  assert.equal(sha(Buffer.from(await audio.arrayBuffer())), state.sha256);
  const otherSession = await signIn(otherEmail, password);
  const otherCredential = (await (await call('/api/user/api-tokens', { name: 'Other restored account', scopes: ['recordings:read', 'recordings:download'] }, otherSession)).json()).data.secret;
  assert.equal((await call(`/api/v1/recordings/${state.recordingId}`, undefined, otherCredential)).status, 404, 'Restored accounts must remain isolated.');
  assert.equal((await call(`/api/v1/recordings/${state.recordingId}/download`, undefined, otherCredential)).status, 404);
  const now = new Date(); const id = new ObjectId();
  await restored.collection('export_jobs').insertOne({ _id: id, authSubject: state.subject, requestedByAuthSubject: state.subject, status: 'pending', progress: 0, totalRecordings: 0, processedRecordings: 0, parts: [], checkpoint: { nextPartNumber: 1 }, createdAt: now, updatedAt: now });
  assert.equal((await call('/api/cron/process-exports', undefined, process.env.CRON_SECRET)).status, 200);
  const job = await restored.collection('export_jobs').findOne({ _id: id });
  assert.equal(job.status, 'completed', 'A restored account must produce an archive.'); assert.ok(job.parts.length);
  const archive = await fetch(job.parts[0].url); assert.equal(archive.status, 200);
  const fflateDirectory = resolvePackageChain(['vinext', '@vercel/og', 'satori', 'fflate']);
  const { unzipSync } = createRequire(path.join(fflateDirectory, 'package.json'))('fflate');
  const entries = unzipSync(new Uint8Array(await archive.arrayBuffer()));
  assert.ok(entries['viewer.html'], 'Export must include its offline viewer.');
  assert.equal(Object.keys(entries).some(name => name.endsWith('.missing.txt')), false, 'A missing-audio placeholder is not a successful restore.');
  assert.ok(Object.entries(entries).some(([name, bytes]) => name.endsWith('.wav') && sha(bytes) === state.sha256), 'Export must preserve the original restored WAV.');
  assert.ok(Object.entries(entries).some(([name, bytes]) => name.endsWith('.json') && JSON.parse(Buffer.from(bytes).toString())._id === state.recordingId), 'Export must include the restored recording metadata.');
  console.log('Restored application login, playback and export passed.');
}
try {
  const step = process.argv[2];
  if (step === 'seed') await seed(); else if (step === 'restore') await restore(); else if (step === 'verify-restore') await verifyRestore(); else throw new Error('Unknown isolated smoke step.');
} finally { await mongo.close(); s3.destroy(); }
