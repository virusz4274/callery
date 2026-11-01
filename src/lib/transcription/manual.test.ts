import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { ObjectId } from 'mongodb';
import type { Recording, UpdateRecordingInput } from '@/lib/db/types';
import type { TranscriptionReceipt } from '@/lib/stripe/transcription-receipt';
import { ProcessingError } from './processing-errors';
import { OperatingFundingUnavailableError } from '@/lib/stripe/billing-errors';
import type { TranscriptionResult, TranscribeOptions } from '@/services/transcription/types';

type Fixture = {
    recording: Partial<Recording>;
    receipt: TranscriptionReceipt;
    receiptCalls: number;
    usageSettlements?: number;
    claims: number;
    providerCalls: number;
    releases: string[];
    writes: UpdateRecordingInput[];
    admissionError?: Error;
    configurationError?: Error;
    providerError?: Error;
    signingError?: Error;
    enrichmentError?: Error;
    enrichmentCalls?: number;
    providerResult?: TranscriptionResult;
    providerOptions?: TranscribeOptions;
};
const stateKey = Symbol.for('vosift.test.manual-transcription');
const shared = globalThis as typeof globalThis & { [stateKey]: Fixture };
const stateSource = `const state = () => globalThis[Symbol.for('vosift.test.manual-transcription')];`;

// Run the production admission and execution sequence. Only I/O and policy
// boundaries are replaced; error classification and result handling stay real.
const sources: Record<string, string> = {
    '@/lib/db/recordings': `
        export async function getRecordingById() { return structuredClone(state().recording); }
        export async function claimRecordingForTranscription(id, owner, patch) {
            state().claims++;
            Object.assign(state().recording, patch, { transcriptionStatus: 'processing' });
            return structuredClone(state().recording);
        }
        export async function updateRecording(id,owner,patch){state().writes.push(structuredClone(patch));Object.assign(state().recording,patch);} export async function markTranscriptionUsageReported() {}`,
    '@/services/transcription/audio-url': `export async function getTranscriptionAudioUrl() { if(state().signingError)throw state().signingError;return 'https://storage.example.com/owned-audio'; }`,
    './enrichment': `export async function finishTranscriptionEnrichment() { state().enrichmentCalls=(state().enrichmentCalls||0)+1; if(state().enrichmentError)throw state().enrichmentError; }`,
    '@/lib/mongodb': `
        export const Collections = { RECORDINGS: 'recordings' };
        export async function getMongoDb() { return { collection() { return { async updateOne() { return { matchedCount: 1 }; } }; } }; }`,
    './model': `export function defaultTranscriptionModel() { return 'approved-model'; }`,
    './execution': `export async function updateDeferredTranscriptionResult(owner,id,previous,execution,patch){state().writes.push(structuredClone(patch));Object.assign(state().recording,patch);} export async function updateLegacyTranscriptionResult(owner,id,previous,patch){state().writes.push(structuredClone(patch));Object.assign(state().recording,patch);} export async function updateTranscriptionAttempt(owner, id, execution, patch) {
        state().writes.push(structuredClone(patch));
        Object.assign(state().recording, patch);
    }`,
    '@/services/transcription/soniox-service': `export class SonioxService {}`,
    '@/services/transcription/elevenlabs-service': `export class ElevenLabsService {}`,
    '@/services/transcription/factory': `export const TranscriptionFactory = {
        isProviderAvailable() { return true; },
        getService() { return {
            async transcribe(url, options) {
                state().providerCalls++;
                state().providerOptions=options;
                if (state().providerError) throw state().providerError;
                if (state().providerResult) return state().providerResult;
                throw new Error('Unexpected successful provider execution in failure regression');
            },
        }; },
    };`,
    '@/lib/access-control': `export function checkUserAccess() { return { allowed: true }; }
        export function checkTranscriptionAccess() { return { allowed: true }; }`,
    '@/services/transcription': `export function resolveTranscriptionProvider() { return 'gemini'; }`,
    '@/lib/config': `export function billingEnabled() { return true; }`,
    '@/lib/db/users': `export async function findUserByAuthSubject(authSubject) {
        return { _id: 'user', authSubject, planId: 'internal', transcriptionAllocation: 3600 };
    }
        export async function incrementTranscriptionUsed() {}`,
    '@/lib/logger': `export const logger = { info() {}, error() {} };`,
    '@/lib/stripe/usage': `export async function reportUsage() {} export async function drainLedgerOutbox() {}
        export function captureTranscriptionBilling() { return null; }`,
    '@/lib/stripe/transcription-receipt': `
        export async function createTranscriptionReceipt() {
            state().receiptCalls++;
            if (state().admissionError) throw state().admissionError;
            return state().receipt;
        }
        export async function releaseTranscriptionReservation(owner, receipt) { state().releases.push(receipt.id); }
        export async function rememberProviderReference() {}
        export async function rememberProviderUsage() {}
        export async function settleCanonicalTranscription() { state().usageSettlements=(state().usageSettlements||0)+1; }`,
    '@/lib/stripe/catalog': `
        export function managedProvider() {
            if (state().configurationError) throw state().configurationError;
            return { model: 'approved-model', multiplier: 3 };
        }
        export function assertManagedTranscriptionLimits() {}`,
    './notifications': `export async function notifyProcessingOutcome() {}`,
    '@/lib/notification-links': `export function buildRecordingNotificationLink() { return '/recordings'; }`,
    '@/app/actions/transcription-providers': `export async function getProviderMultiplier() { return 3; }`,
    '@/lib/db/system-log': `export async function logSystemEvent() {}`,
    '@/lib/processing-availability': `export async function assertProcessingAvailable() {}`,
    '@/lib/team-policy': `export async function getTeamSettings() { return { enabled: false, transcriptionProvider: 'gemini' }; }`,
    '@/lib/integrations/jobs': `export async function isTranscriptionExecutionAuthorized() { return true; }`,
};
const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
        const source = /\/transcription\/(manual|completion)\.ts$/.test(context.parentURL || '') ? sources[specifier] : undefined;
        if (source) return { url: `data:text/javascript,${encodeURIComponent(stateSource + source)}`, shortCircuit: true };
        return nextResolve(specifier, context);
    },
});

const { executeTranscription, validateTranscriptionRequest } = await import('./manual');
after(() => hook.deregister());

function setup(): Fixture {
    return shared[stateKey] = {
        recording: { _id: new ObjectId(), authSubject: 'owner', transcriptionStatus: 'pending',
            standardizedDisplayName: 'Fictional demo', r2Key: 'owned/demo.mp3', duration: 60, fileSize: 1024 },
        receipt: { version: 2, id: 'operator-reservation', sourceAttemptId: 'attempt', provider: 'gemini',
            model: 'approved-model', multiplier: 3, consumedSeconds: 180, allowanceSeconds: 3600, acceptedAt: new Date(),
            billing: null, maximumCostMicros: 1000, tariffVersion: 'test', currency: 'usd', operatorReservationId: 'operator-reservation' },
        receiptCalls: 0, claims: 0, providerCalls: 0, releases: [], writes: [],
    };
}

async function run(state: Fixture) {
    const result = await executeTranscription('owner', state.recording._id!.toHexString(), { provider: 'gemini' },
        { jobId: 'owned-job', attemptId: 'attempt' });
    assert.ok('providerOutcomeUncertain' in result, 'The exercised failure must pass through the production error handler');
    return result;
}

test('operator funding admission rejection stays a known failure before any provider submission', async () => {
    const state = setup();
    state.admissionError = new Error('Verified customer billing or an explicit operator-funded entitlement is required before provider work.');

    const result = await run(state);

    assert.equal(result.error, state.admissionError.message);
    assert.equal(result.providerOutcomeUncertain, false);
    assert.equal(state.receiptCalls, 1);
    assert.equal(state.claims, 0);
    assert.equal(state.providerCalls, 0);
    assert.equal(state.recording.transcriptionStatus, 'pending');
    assert.deepEqual(state.releases, []);
    assert.deepEqual(state.writes, []);
});

test('unavailable operator cash gives a support remedy without claiming customer debt or provider uncertainty', async () => {
    const state = setup();
    state.admissionError = new OperatingFundingUnavailableError('Operating funding is temporarily unavailable. No provider request was started.');
    const result = await run(state);
    assert.deepEqual(result.processingStatus, { stage: 'transcription', state: 'blocked', code: 'operating_funds_unavailable', retryAction: 'contact_admin', providerOutcome: 'not_started' });
    assert.equal(result.providerOutcomeUncertain, false);
    assert.equal(state.providerCalls, 0); assert.equal(state.claims, 0);
    assert.deepEqual(state.releases, []);
});

test('configuration and admission network errors cannot imply a provider submission', async t => {
    for (const boundary of ['configurationError', 'admissionError'] as const) {
        await t.test(boundary, async () => {
            const state = setup();
            state[boundary] = new Error('Network connection lost while reading billing configuration');

            const result = await run(state);

            assert.equal(result.error, state[boundary].message);
            assert.equal(result.providerOutcomeUncertain, false);
            assert.equal(state.claims, 0);
            assert.equal(state.providerCalls, 0);
            assert.equal(state.recording.transcriptionStatus, 'pending');
        });
    }
});

test('unknown outcomes after a provider call still require review and keep its cost reservation', async t => {
    for (const message of ['Network connection lost during submission', 'Unexpected provider response']) {
        await t.test(message, async () => {
            const state = setup();
            state.providerError = new Error(message);

            const result = await run(state);

            assert.equal(result.error, message);
            assert.equal(result.providerOutcomeUncertain, true);
            assert.equal(state.providerCalls, 1);
            assert.equal(state.claims, 1);
            assert.equal(state.recording.transcriptionStatus, 'failed');
            assert.deepEqual(state.releases, []);
        });
    }
});

test('an authoritative provider rejection still releases the accepted reservation', async () => {
    const state = setup();
    state.providerError = Object.assign(new Error('Invalid credentials'), { status: 401 });

    const result = await run(state);

    assert.equal(result.providerOutcomeUncertain, false);
    assert.equal(state.providerCalls, 1);
    assert.equal(state.recording.transcriptionStatus, 'failed');
    assert.deepEqual(state.releases, [state.receipt.id]);
});

test('a known pre-call enrichment block resumes the saved transcript without an audio call or uncertain-review state', async () => {
    const state = setup();
    state.recording.transcriptionEnrichmentPending = true;
    state.recording.fullTranscript = [{ speakerId: 'A', text: 'Saved transcript', words: [] }];
    state.recording.transcriptionReceipt = state.receipt;
    state.configurationError = new Error('Audio model is no longer configured');
    state.enrichmentError = new ProcessingError('The accepted AI budget cannot fund summary.', {
        stage: 'summary', state: 'blocked', code: 'ai_budget_exhausted', retryAction: 'resume_enrichment', providerOutcome: 'not_started',
    });
    const original = structuredClone(state.recording.fullTranscript);
    const result = await run(state);
    assert.equal(result.providerOutcomeUncertain, false);
    assert.ok(state.enrichmentError instanceof ProcessingError);
    assert.deepEqual(result.processingStatus, state.enrichmentError.processingStatus);
    assert.equal(state.recording.processingStatus?.state, 'blocked');
    assert.equal(state.recording.processingStatus?.stage, 'summary');
    assert.equal(state.receiptCalls, 0);
    assert.equal(state.providerCalls, 0);
    assert.equal(state.enrichmentCalls, 1);
    assert.deepEqual(state.recording.fullTranscript, original);
    assert.equal(state.recording.transcriptionReceipt?.id, state.receipt.id);
    assert.deepEqual(state.releases, []);
});

test('an explicit reconciliation hold remains a review result even before provider submission', async () => {
    const state = setup();
    state.admissionError = Object.assign(new Error('Accepted prior transcription needs reconciliation.'), { code: 'transcription_review_required' });

    const result = await run(state);

    assert.equal(result.requiresReview, true);
    assert.equal(result.providerOutcomeUncertain, false);
    assert.equal(state.providerCalls, 0);
});

test('a saved processing envelope reaches the provider and rejects oversized output before storing or charging successful audio', async () => {
    const state = setup();
    state.receipt.processingBudget = {
        version: 1, id: state.receipt.id, parentReceiptId: state.receipt.id, fundingSource: 'internal',
        provider: 'gemini', model: 'approved-model', asrCostMicros: 100, aiCostMicros: 100, totalCostMicros: 200,
        aiModels: { summary: { provider: 'gemini', model: 'test' }, transliteration: { provider: 'gemini', model: 'test' }, embedding: { provider: 'gemini', model: 'test' } },
        transcriptEnvelope: { maxResponseBytes: 1024, maxSourceTextBytes: 4, maxWords: 10, maxSegments: 10,
            maxSummaryLeaves: 10, maxReduceLevels: 10, maxTransliterationChunks: 10 },
        acceptedAt: new Date().toISOString(),
    };
    state.providerResult = { transcriptionId: 'transcript-fixture', provider: 'gemini', model: 'approved-model', text: 'Oversized transcript',
        segments: [{ speakerId: 'A', start: 0, end: 60, text: 'Oversized transcript', words: [] }], languageCode: 'en' };
    const result = await run(state);
    assert.deepEqual(state.providerOptions?.processingEnvelope, state.receipt.processingBudget.transcriptEnvelope);
    assert.match(result.error!, /processing envelope/);
    assert.equal(state.recording.fullTranscript, undefined);
    assert.equal(state.recording.transcriptionReceipt?.readyAt, undefined);
    assert.equal(state.enrichmentCalls, undefined);
    assert.equal(state.providerCalls, 1);
});


test('historical saved transcript resumes AI without fabricating an audio settlement or requiring a monetary receipt', async () => {
    const state = setup();
    Object.assign(state.recording, { transcriptionEnrichmentPending: true, fullTranscript: [{ speakerId: 'A', text: 'Owned historical source', words: [] }],
        transcriptionReceipt: { id: 'historical-no-expense-proof', billing: null, maximumCostMicros: 0, version: 2 } });
    const result = await executeTranscription('owner', state.recording._id!.toHexString(), undefined, { jobId: 'owned-job', attemptId: 'attempt' });
    assert.equal(result.error, undefined);
    assert.equal(state.providerCalls, 0); assert.equal(state.receiptCalls, 0); assert.equal(state.usageSettlements || 0, 0);
    assert.equal(state.enrichmentCalls, 1);
});


test('historical delivered audio does not require an expired expense fingerprint for AI-only continuation', async () => {
    const state = setup();
    Object.assign(state.recording, { transcriptionEnrichmentPending: true, fullTranscript: [{ speakerId: 'A', text: 'Delivered source', words: [] }],
        transcriptionUsageReportId: 'authoritative-original-audio-delivery', transcriptionUsageReportedAt: new Date(),
        transcriptionReceipt: { ...state.receipt, operatorReservationId: undefined, reservationId: 'old-retail-claim', billing: { authSubject: 'owner' }, costPolicyVersion: undefined } });
    const result = await executeTranscription('owner', state.recording._id!.toHexString(), undefined, { jobId: 'owned-job', attemptId: 'attempt' });
    assert.equal(result.error, undefined); assert.equal(state.usageSettlements || 0, 0);
    assert.equal(state.providerCalls, 0); assert.equal(state.enrichmentCalls, 1);
});


test('a separately requested new retail transcription settles despite delivery marks from older audio', async () => {
    const state = setup();
    Object.assign(state.recording, { transcriptionEnrichmentPending: true, fullTranscript: [{ speakerId: 'A', text: 'New separately requested transcript', words: [] }],
        transcriptionUsageReportId: 'old-audio-delivery', transcriptionUsageReportedAt: new Date(0),
        transcriptionReceipt: { ...state.receipt, id: 'new-retail-audio', operatorReservationId: undefined, reservationId: 'new-retail-audio',
            accountingMode: 'retail_only', executionPolicy: { id: 'new-retail-audio' } } });
    const result = await executeTranscription('owner', state.recording._id!.toHexString(), undefined, { jobId: 'owned-job', attemptId: 'attempt' });
    assert.equal(result.error, undefined); assert.equal(state.usageSettlements, 1);
    assert.equal(state.providerCalls, 0); assert.equal(state.enrichmentCalls, 1);
});

test('a matching modern audio-delivery identity is reused without another settlement', async () => {
    const state = setup();
    Object.assign(state.recording, { transcriptionEnrichmentPending: true, fullTranscript: [{ speakerId: 'A', text: 'Saved transcript', words: [] }],
        transcriptionUsageReportId: 'delivered-modern-audio', transcriptionUsageReportedAt: new Date(),
        transcriptionReceipt: { ...state.receipt, id: 'delivered-modern-audio', operatorReservationId: undefined, reservationId: 'delivered-modern-audio',
            accountingMode: 'retail_only', executionPolicy: { id: 'delivered-modern-audio' } } });
    const result = await executeTranscription('owner', state.recording._id!.toHexString(), undefined, { jobId: 'owned-job', attemptId: 'attempt' });
    assert.equal(result.error, undefined); assert.equal(state.usageSettlements || 0, 0);
    assert.equal(state.providerCalls, 0); assert.equal(state.enrichmentCalls, 1);
});


test('request validation reads eligibility without claims, reservations, provider calls or recording writes', async () => {
    const state = setup();
    const validated = await validateTranscriptionRequest('owner', state.recording._id!.toHexString(), { provider: 'gemini' });
    assert.equal(validated.providerId, 'gemini');
    assert.equal(validated.multiplier, 3);
    assert.equal(state.claims, 0); assert.equal(state.receiptCalls, 0); assert.equal(state.providerCalls, 0);
    assert.deepEqual(state.writes, []);
});


for (const boundary of ['signed URL', 'Gemini download']) test(`${boundary} failure releases unused retail allowance without provider outcome acknowledgement`, async () => {
    const state = setup();
    if (boundary === 'signed URL') state.signingError = new Error('Storage signing unavailable');
    else state.providerError = new ProcessingError('Failed to download audio for Gemini transcription: 503',
        { stage: 'transcription', state: 'blocked', code: 'recording_audio_unavailable', retryAction: 'retry_transcription', providerOutcome: 'not_started' });
    const result = await run(state);
    assert.equal(result.providerOutcomeUncertain, false); assert.equal(result.processingStatus?.providerOutcome, 'not_started');
    assert.equal(result.requiresReview, undefined); assert.deepEqual(state.releases, [state.receipt.id]);
    if (boundary === 'signed URL') assert.equal(state.providerCalls, 0);
});
