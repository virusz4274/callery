import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { registerHooks } from 'node:module';
import { ObjectId } from 'mongodb';
import type { Recording, UpdateRecordingInput } from '@/lib/db/types';
import type { TranscriptionExecution } from '@/lib/transcription/manual';
import { logger } from '@/lib/logger';

type Provider = 'soniox' | 'elevenlabs';
interface CallbackState {
    recording: Recording;
    event: 'unseen' | 'processing' | 'failed' | 'processed';
    slotHeld: boolean;
    jobState: string;
    enrichCalls: number;
    leaseStarts: number;
    leaseStops: number;
    usageReports: number;
    usageIncrements: number;
    settled: number;
    notifications: number;
    notificationKeys: Set<string>;
    notificationTypes: string[];
    processedReceipts: number;
    failReceipt: boolean;
    failEnrichment: boolean;
    usageIds: Set<string>;
    meterIds: Set<string>;
    counterIds: Set<string>;
    failUsage: boolean;
    afterTasks: Array<() => Promise<void>>;
    db: { collection: (name: string) => unknown };
    save: (owner: string, id: string, execution: TranscriptionExecution | undefined, patch: UpdateRecordingInput) => Promise<void>;
}
const key = Symbol.for('vosift.test.transcription-callbacks');
const shared = globalThis as typeof globalThis & { [key]: CallbackState };
const stateSource = `const state = () => globalThis[Symbol.for('vosift.test.transcription-callbacks')];`;
// Keep actual route authentication, payload parsing, correlation, result-marker
// and response logic. Every database, job and paid-provider boundary is local.
const modules: Record<string, string> = {
    'next/server': `export const NextResponse = { json: (body, init) => Response.json(body, init) }; export function after(task) { state().afterTasks.push(task); }`,
    '@/lib/mongodb': `export const Collections = { RECORDINGS: 'recordings' }; export async function getMongoDb() { return state().db; }`,
    '@/lib/db/recordings': `export async function getRecordingById(){return structuredClone(state().recording);} export async function updateRecording(id, owner, patch) { return state().save(owner, id, undefined, patch); }
        export async function markTranscriptionUsageReported(id, owner, reportId) { const current = state(); if (current.usageIds.has(reportId)) return false; current.usageIds.add(reportId); current.recording.transcriptionUsageReportId = reportId; return true; }`,
    '@/lib/db/users': `export async function findUserByAuthSubject() { return { _id: 'fixture-user' }; } export async function incrementTranscriptionUsed(owner, seconds, receipt) { const current = state(); if (!current.counterIds.has(receipt)) { current.counterIds.add(receipt); current.usageIncrements++; } }`,
    '@/lib/stripe/usage': `export async function drainLedgerOutbox() {} export async function reportUsage(owner, type, quantity, options) { const current = state(); if (current.failUsage) { current.failUsage = false; throw new Error('Fixture usage ledger interruption'); } if (!current.meterIds.has(options.identifier)) { current.meterIds.add(options.identifier); current.usageReports++; } }`,
    '@/lib/notifications': `export async function createNotification(user,type,title,message,link,options) { if(state().notificationKeys.has(options.eventKey))return;state().notificationKeys.add(options.eventKey);state().notificationTypes.push(type);state().notifications++; }`,
    '@/lib/transcription/execution': `export async function updateDeferredTranscriptionResult(owner,id,previous,execution,patch){return state().save(owner,id,execution,patch);} export async function updateLegacyTranscriptionResult(owner,id,previous,patch){return state().save(owner,id,undefined,patch);} export async function updateTranscriptionAttempt(owner, id, execution, patch) { return state().save(owner, id, execution, patch); }`,
    '@/lib/transcription/enrichment': `export async function finishTranscriptionEnrichment(owner, id, execution) {
        const current = state(); current.enrichCalls++; if (current.failEnrichment) throw new Error('Fixture AI busy');
        await current.save(owner, id, execution, { transcriptionStatus: 'completed', transcriptionEnrichmentPending: false, summary: 'Saved summary', transcriptionEnrichmentSteps: { summary: true, transliteration: true, embedding: true } });
    }`,
    '@/lib/integrations/jobs': `export async function queueDeferredTranscriptionCompletion(){state().jobState='pending';delete state().recording.transcriptionCompletionPending;} export async function beginQueuedWebhookExecution() { const current = state(); current.leaseStarts++; if (!current.slotHeld) {current.leaseStarts--;return undefined;} return () => { current.leaseStops++; }; }
        export async function settleQueuedTranscription() { const current = state(); current.settled++; current.slotHeld = false; current.jobState = current.recording.transcriptionStatus === 'completed' ? 'completed' : 'needs_review'; }
        export async function processTranscriptionJobs() { throw new Error('Background dispatcher must not execute in route unit tests'); }`,
    '@/lib/webhooks/transcription-events': `export async function claimTranscriptionWebhookEvent() { const current = state(); if (current.event === 'processed') return 'already_processed'; if (current.event === 'processing') return 'in_progress'; current.event = 'processing'; return 'claimed'; }
        export async function markTranscriptionWebhookProcessed() { const current = state(); current.processedReceipts++; if (current.failReceipt) { current.failReceipt = false; throw new Error('Fixture receipt write interrupted'); } current.event = 'processed'; }
        export async function markTranscriptionWebhookFailed() { state().event = 'failed'; }`,
};
const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
        const mapped = specifier === './execution' ? '@/lib/transcription/execution' : specifier === './enrichment' ? '@/lib/transcription/enrichment' : specifier;
        if (/\/(?:api\/webhooks\/(?:soniox|elevenlabs)\/route|lib\/transcription\/(?:completion|notifications))\.ts$/.test(context.parentURL || '') && modules[mapped]) {
            return { url: `data:text/javascript,${encodeURIComponent(stateSource + modules[mapped])}`, shortCircuit: true };
        }
        return nextResolve(specifier, context);
    },
});
const { POST: soniox } = await import('@/app/api/webhooks/soniox/route');
const { POST: elevenlabs } = await import('@/app/api/webhooks/elevenlabs/route');
hook.deregister();

function fixture(t: TestContext, provider: Provider): CallbackState {
    const names = ['SONIOX_WEBHOOK_SECRET', 'SONIOX_API_KEY', 'SONIOX_API_BASE_URL', 'ELEVENLABS_WEBHOOK_SECRET'];
    const saved = names.map(name => [name, process.env[name]] as const);
    process.env.SONIOX_WEBHOOK_SECRET = 'callback-fixture-secret';
    process.env.ELEVENLABS_WEBHOOK_SECRET = 'callback-fixture-secret';
    process.env.SONIOX_API_KEY = 'callback-fixture-key';
    process.env.SONIOX_API_BASE_URL = 'https://soniox.fixture.test';
    t.after(() => {
        for (const [name, value] of saved) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
    });
    t.mock.method(logger, 'info', () => {});
    t.mock.method(logger, 'warn', () => {});
    t.mock.method(logger, 'error', () => {});
    t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
        assert.equal(provider, 'soniox', 'ElevenLabs callbacks already include transcript bytes');
        assert.equal(String(url), 'https://soniox.fixture.test/v1/transcriptions/external-fixture/transcript');
        return Response.json({ detected_language: 'en', tokens: [{ text: 'Hello', speaker: 0, start_ms: 0, end_ms: 1000 }] });
    });
    const recording: Recording = {
        _id: new ObjectId(), authSubject: 'owner', contactId: null, contactName: 'Caller', phoneNumber: '', normalizedPhoneNumber: '',
        r2Key: 'fixture/audio.wav', fileName: 'call.wav', standardizedDisplayName: 'Caller', fileSize: 100, mimeType: 'audio/wav',
        duration: 60, recordedAt: new Date(), createdAt: new Date(), updatedAt: new Date(), transcriptionStatus: 'processing',
        transcriptionProvider: provider, transcriptionJobId: 'job-fixture', transcriptionAttemptId: 'attempt-fixture',
        tags: [], isStarred: false, isArchived: false,
    };
    const current: CallbackState = {
        recording, event: 'unseen', slotHeld: true, jobState: 'submitted', enrichCalls: 0, leaseStarts: 0, leaseStops: 0,
        usageReports: 0, usageIncrements: 0, settled: 0, notifications: 0, notificationKeys: new Set(), notificationTypes: [], processedReceipts: 0,
        failReceipt: false, failEnrichment: false, failUsage: false, usageIds: new Set(), meterIds: new Set(), counterIds: new Set(), afterTasks: [],
        save: async (owner, id, execution, patch) => {
            assert.equal(owner, recording.authSubject);
            assert.equal(id, recording._id.toHexString());
            if (execution) {
                assert.equal(execution.jobId, recording.transcriptionJobId);
                assert.equal(execution.attemptId, recording.transcriptionAttemptId);
            }
            Object.assign(recording, structuredClone(patch));
        },
        db: { collection: name => {
            assert.equal(name, 'recordings');
            return {
                findOne: async () => ({ ...recording }),
                findOneAndUpdate: async (filter: Record<string, unknown>, patch: { $set: UpdateRecordingInput }) => {
                    assert.equal(filter.authSubject, 'owner');
                    assert.equal(filter.transcriptionAttemptId, recording.transcriptionAttemptId);
                    if (recording.externalTranscriptionId) return null;
                    Object.assign(recording, patch.$set);
                    return { ...recording };
                },
            };
        } },
    };
    shared[key] = current;
    return current;
}

function callback(provider: Provider, state: CallbackState, attemptId = 'attempt-fixture', failure = false) {
    const metadata = { recordingId: state.recording._id.toHexString(), authSubject: 'owner', jobId: 'job-fixture', attemptId };
    if (provider === 'soniox') return soniox(new Request(`https://app.fixture.test/api/webhooks/soniox?${new URLSearchParams(metadata)}`, {
        method: 'POST', headers: { 'X-Soniox-Secret': 'callback-fixture-secret' },
        body: JSON.stringify({ id: 'external-fixture', status: failure ? 'error' : 'completed' }),
    }));
    const body = JSON.stringify({ request_id: 'external-fixture', transcription_id: 'external-fixture', status: failure ? 'failed' : 'success',
        webhook_metadata: metadata, language_code: 'en', words: [{ text: 'Hello', start: 0, end: 1, speaker_id: 'speaker_0', type: 'word' }] });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', 'callback-fixture-secret').update(`${timestamp}.${body}`).digest('hex');
    return elevenlabs(new Request('https://app.fixture.test/api/webhooks/elevenlabs', { method: 'POST',
        headers: { 'elevenlabs-signature': `t=${timestamp},v0=${signature}` }, body }));
}

for (const provider of ['soniox', 'elevenlabs'] as const) {
    test(`${provider}: a current early callback initializes correlation and enriches once`, async t => {
        const state = fixture(t, provider);
        const response = await callback(provider, state);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).status, 'completed');
        assert.equal(state.recording.externalTranscriptionId, 'external-fixture');
        assert.equal(state.recording.transcriptionResultAttemptId, 'attempt-fixture');
        assert.equal(state.recording.fullTranscript?.[0].text, 'Hello');
        assert.equal(state.enrichCalls, 1);
        assert.equal(state.leaseStarts, 1);
        assert.equal(state.leaseStops, 1);
        assert.equal(state.usageReports, 1);
        assert.equal(state.jobState, 'completed');
        assert.equal((await (await callback(provider, state)).json()).status, 'already_processed');
        assert.equal(state.enrichCalls, 1);
        assert.equal(state.usageReports, 1);
    });

    test(`${provider}: stale attempts cannot initialize correlation or start paid work`, async t => {
        const state = fixture(t, provider);
        assert.equal((await (await callback(provider, state, 'stale-attempt')).json()).status, 'ignored_stale_attempt');
        assert.equal(state.recording.externalTranscriptionId, undefined);
        assert.equal(state.enrichCalls + state.leaseStarts + state.usageReports + state.settled, 0);
        assert.equal(state.event, 'unseen');
    });

    test(`${provider}: redelivery after a failed receipt retains the result without paid enrichment or slot reacquisition`, async t => {
        const state = fixture(t, provider);
        state.failReceipt = true;
        assert.equal((await callback(provider, state)).status, 500);
        assert.equal(state.event, 'failed');
        assert.equal(state.recording.transcriptionStatus, 'completed');
        assert.equal(state.enrichCalls, 1);
        // A cron reconciler may release a completed attempt before redelivery.
        state.slotHeld = false;
        const response = await callback(provider, state);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).status, 'completed');
        assert.equal(state.enrichCalls, 1);
        assert.equal(state.leaseStarts, 1);
        assert.equal(state.usageIncrements, 1);
        assert.equal(state.usageReports, 1);
        assert.equal(state.processedReceipts, 2);
        assert.equal(state.event, 'processed');
        assert.equal(state.recording.summary, 'Saved summary');
        assert.equal(state.notifications, 1, 'Receipt retry cannot repeat the completion notification');
        assert.equal(state.jobState, 'completed');
    });

    test(`${provider}: a failed usage-ledger write is retried before the result is acknowledged`, async t => {
        const state = fixture(t, provider);
        state.failUsage = true;
        assert.equal((await callback(provider, state)).status, 500);
        assert.equal(state.usageReports, 0);
        assert.equal(state.usageIncrements, 0);
        assert.equal(state.usageIds.size, 0);
        const response = await callback(provider, state);
        assert.equal(response.status, 200);
        assert.equal(state.usageReports, 1);
        assert.equal(state.usageIncrements, 1);
        assert.equal(state.enrichCalls, 1);
        assert.equal(state.event, 'processed');
    });
    test(`${provider}: enrichment failure retains the provider transcript and stops for review`, async t => {
        const state = fixture(t, provider);
        state.failEnrichment = true;
        const response = await callback(provider, state);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).status, 'needs_review');
        assert.equal(state.recording.fullTranscript?.[0].text, 'Hello');
        assert.equal(state.recording.transcriptionResultAttemptId, 'attempt-fixture');
        assert.equal(state.recording.transcriptionEnrichmentPending, true);
        assert.equal(state.recording.transcriptionStatus, 'failed');
        assert.equal(state.jobState, 'needs_review');
        assert.equal(state.leaseStops, 1);
        assert.equal(state.usageReports, 1);
        assert.deepEqual(state.notificationTypes, ['warning']);
        assert.equal((await (await callback(provider, state)).json()).status, 'already_processed');
        assert.equal(state.enrichCalls, 1, 'Provider redelivery cannot retry a failed AI step without review');
    });
}


for (const provider of ['soniox', 'elevenlabs'] as const) test(`${provider}: a late current success queues enrichment without reacquiring another job's slot`, async t => {
    const state = fixture(t, provider);state.slotHeld = false;state.jobState = 'needs_review';state.recording.transcriptionStatus = 'failed';
    const response = await callback(provider, state);
    assert.equal(response.status, 200);assert.equal((await response.json()).status, 'queued');
    assert.equal(state.recording.fullTranscript?.[0].text, 'Hello');assert.equal(state.recording.transcriptionEnrichmentPending, true);
    assert.equal(state.jobState, 'pending');assert.equal(state.enrichCalls, 0);assert.equal(state.usageReports, 1);
    assert.equal(state.leaseStarts, 0);assert.equal(state.settled, 0);assert.equal(state.slotHeld, false);
    assert.equal((await (await callback(provider, state)).json()).status, 'already_processed');
});


for (const provider of ['soniox', 'elevenlabs'] as const) test(`${provider}: out-of-order failure cannot replace an accepted transcript`, async t => {
    const state = fixture(t, provider);await callback(provider, state);state.event = 'unseen';
    const response = await callback(provider, state, 'attempt-fixture', true);
    assert.equal(response.status, 200);assert.equal((await response.json()).status, 'ignored_obsolete_failure');
    assert.equal(state.recording.transcriptionStatus, 'completed');assert.equal(state.recording.summary, 'Saved summary');
    assert.equal(state.enrichCalls, 1);assert.equal(state.usageReports, 1);assert.deepEqual(state.notificationTypes, ['success']);
});
