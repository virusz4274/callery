import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { registerHooks } from 'node:module';
import { ObjectId } from 'mongodb';
import type { Recording, UpdateRecordingInput } from '@/lib/db/types';

type Fixture = { recording: Partial<Recording>; writes: UpdateRecordingInput[]; processed: number; failed: number; billed: number; enriched: number; settled: number };
const stateKey = Symbol.for('vosift.test.callback-envelope');
const shared = globalThis as typeof globalThis & { [stateKey]: Fixture };
const stateSource = `const state=()=>globalThis[Symbol.for('vosift.test.callback-envelope')];`;
const stubs: Record<string, string> = {
    'next/server': `export const NextResponse={json(value,init){return Response.json(value,init)}};export function after(){}`,
    '@/lib/env': `export const env={SONIOX_WEBHOOK_SECRET:'fixture-signature',SONIOX_API_KEY:'fixture-key',SONIOX_API_BASE_URL:'https://provider.invalid',ELEVENLABS_WEBHOOK_SECRET:'fixture-signature'};`,
    '@/lib/logger': `export const logger={info(){},warn(){},error(){}};`,
    '@/lib/mongodb': `export const Collections={RECORDINGS:'recordings'}; export async function getMongoDb(){return {collection(){return {async findOne(){return structuredClone(state().recording)}}}};}`,
    '@/lib/db/recordings': `export async function getRecordingById(){return structuredClone(state().recording);} export async function updateRecording(id,owner,patch){state().writes.push(patch);Object.assign(state().recording,patch);} export async function markTranscriptionUsageReported(){state().billed++;}`,
    '@/lib/transcription/execution': `export async function updateDeferredTranscriptionResult(owner,id,previous,execution,patch){state().writes.push(patch);Object.assign(state().recording,patch);} export async function updateLegacyTranscriptionResult(owner,id,previous,patch){state().writes.push(patch);Object.assign(state().recording,patch);} export async function updateTranscriptionAttempt(owner,id,execution,patch){state().writes.push(patch);Object.assign(state().recording,patch);}`,
    '@/lib/transcription/enrichment': `export async function finishTranscriptionEnrichment(){state().enriched++;}`,
    '@/lib/integrations/jobs': `export async function queueDeferredTranscriptionCompletion(){} export async function settleQueuedTranscription(){state().settled++;} export async function processTranscriptionJobs(){} export async function beginQueuedWebhookExecution(){return ()=>{};}`,
    '@/lib/stripe/usage': `export async function reportUsage(){state().billed++;} export async function drainLedgerOutbox(){}`,
    '@/lib/stripe/transcription-receipt': `export async function settleCanonicalTranscription(){state().billed++;} export async function settleRemovedRecording(){} export async function settleFailedTranscription(){state().billed++;}`,
    '@/lib/db/users': `export async function incrementTranscriptionUsed(){state().billed++;} export async function findUserByAuthSubject(){return null;}`,
    '@/lib/notifications': `export async function createNotification(){}`,
    '@/lib/webhooks/transcription-events': `export async function claimTranscriptionWebhookEvent(){return 'claimed';} export async function markTranscriptionWebhookProcessed(){state().processed++;} export async function markTranscriptionWebhookFailed(){state().failed++;}`,
};
const hook = registerHooks({ resolve(specifier, context, next) {
    const source = /\/(?:api\/webhooks\/(?:soniox|elevenlabs)\/route|lib\/transcription\/completion)\.ts$/.test(context.parentURL || '') ? stubs[specifier] || stubs[specifier === './execution' ? '@/lib/transcription/execution' : specifier === './enrichment' ? '@/lib/transcription/enrichment' : specifier] : undefined;
    return source ? { url: `data:text/javascript,${encodeURIComponent(stateSource + source)}`, shortCircuit: true } : next(specifier, context);
} });
const { POST: sonioxCallback } = await import('@/app/api/webhooks/soniox/route');
const { POST: elevenlabsCallback } = await import('@/app/api/webhooks/elevenlabs/route');
after(() => hook.deregister());

for (const provider of ['soniox', 'elevenlabs'] as const) test(`${provider} oversized callback is durably reviewed without successful audio billing or enrichment`, async t => {
    const id = new ObjectId();
    const state: Fixture = shared[stateKey] = { recording: { _id: id, authSubject: 'owned-fixture', transcriptionStatus: 'processing',
        externalTranscriptionId: 'owned-provider-result',
        transcriptionReceipt: { id: 'owned-receipt', processingBudget: { transcriptEnvelope: {
            maxResponseBytes: 4096, maxSourceTextBytes: 4, maxSegments: 10, maxWords: 10,
        } } } as Recording['transcriptionReceipt'] }, writes: [], processed: 0, failed: 0, billed: 0, enriched: 0, settled: 0 };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ tokens: [{ text: 'Oversized transcript', speaker: 1, start_ms: 0, end_ms: 1000 }] });
    t.after(() => { globalThis.fetch = originalFetch; });
    let response: Response;
    if (provider === 'soniox') {
        response = await sonioxCallback(new Request(`https://app.invalid/api/webhooks/soniox?recordingId=${id}&authSubject=owned-fixture`, {
            method: 'POST', headers: { 'X-Soniox-Secret': 'fixture-signature' }, body: JSON.stringify({ id: 'owned-provider-result', status: 'completed' }),
        }));
    } else {
        const body = JSON.stringify({ request_id: 'owned-provider-result', transcription_id: 'owned-provider-result', status: 'success',
            words: [{ text: 'Oversized transcript', speaker_id: 'speaker_0', start: 0, end: 1 }], webhook_metadata: { recordingId: id.toString(), authSubject: 'owned-fixture' } });
        const timestamp = Math.floor(Date.now() / 1000), signature = createHmac('sha256', 'fixture-signature').update(`${timestamp}.${body}`).digest('hex');
        response = await elevenlabsCallback(new Request('https://app.invalid/api/webhooks/elevenlabs', {
            method: 'POST', headers: { 'elevenlabs-signature': `t=${timestamp},v0=${signature}` }, body,
        }));
    }
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, status: 'needs_review' });
    assert.equal(state.recording.transcriptionStatus, 'failed');
    assert.equal(state.recording.processingStatus?.code, 'transcript_envelope_exceeded');
    assert.equal(state.recording.processingStatus?.stage, 'transcription');
    assert.equal(state.recording.processingStatus?.providerOutcome, 'responded');
    assert.equal(state.recording.fullTranscript, undefined);
    assert.equal(state.recording.transcriptionReceipt?.readyAt, undefined);
    assert.equal(state.processed, 1); assert.equal(state.failed, 0); assert.equal(state.settled, 1);
    assert.equal(state.billed, 0); assert.equal(state.enriched, 0);
});


test('Soniox stops an oversized streamed provider body before JSON parsing, billing or enrichment', async t => {
    const id = new ObjectId();
    const state: Fixture = shared[stateKey] = { recording: { _id: id, authSubject: 'owned-fixture', transcriptionStatus: 'processing', externalTranscriptionId: 'owned-provider-result',
        transcriptionReceipt: { id: 'owned-receipt', processingBudget: { transcriptEnvelope: { maxResponseBytes: 4096, maxSourceTextBytes: 1024, maxSegments: 10, maxWords: 10 } } } as Recording['transcriptionReceipt'] },
        writes: [], processed: 0, failed: 0, billed: 0, enriched: 0, settled: 0 };
    const originalFetch = globalThis.fetch;globalThis.fetch = async () => new Response('x'.repeat(4097));t.after(() => { globalThis.fetch = originalFetch; });
    const response = await sonioxCallback(new Request(`https://app.invalid/api/webhooks/soniox?recordingId=${id}&authSubject=owned-fixture`, {
        method: 'POST', headers: { 'X-Soniox-Secret': 'fixture-signature' }, body: JSON.stringify({ id: 'owned-provider-result', status: 'completed' }),
    }));
    assert.equal(response.status, 200);assert.equal((await response.json()).status, 'needs_review');
    assert.equal(state.recording.processingStatus?.code, 'transcript_envelope_exceeded');assert.equal(state.recording.fullTranscript, undefined);
    assert.equal(state.billed, 0);assert.equal(state.enriched, 0);assert.equal(state.processed, 1);
});
