import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import { writeFileSync } from 'node:fs';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import type { Recording, User } from '@/lib/db/types';
import type { AiStep, AiStepContext, AiUsage, IAIService } from '@/services/ai/types';
import { userFixture } from '@/lib/stripe/test-support';
import { Collections } from '@/lib/mongodb';

const fixtureKey = Symbol.for('vosift.test.real-bundled-enrichment');
const fixture = globalThis as typeof globalThis & { [fixtureKey]?: { db: Db; service: IAIService } };

/** Explicitly opted-in paid-provider acceptance. It never reads deployment
 * credentials itself, uploads audio, contacts Stripe, or uses a shared database. */
test('real Gemini completes bundled multilingual enrichment without expense funding and reuses all completed checkpoints', {
    skip: process.env.VOSIFT_TEST_REAL_AI !== '1' || !process.env.VOSIFT_TEST_MONGODB_URI || !process.env.VOSIFT_TEST_GEMINI_API_KEY,
    timeout: 180_000,
}, async t => {
    const client = new MongoClient(process.env.VOSIFT_TEST_MONGODB_URI!, { serverSelectionTimeoutMS: 15_000 });
    const db = client.db(`vt_realai_${randomUUID().replaceAll('-', '').slice(0, 16)}`);
    const names = ['NEXT_PUBLIC_ENABLE_BILLING', 'GOOGLE_GENERATIVE_AI_API_KEY', 'AI_PROVIDER', 'GEMINI_MODEL_SUMMARY', 'GEMINI_MODEL_TRANSLITERATION', 'GEMINI_MODEL_EMBEDDING', 'SEARCH_EMBEDDING_DIMENSIONS', 'MANAGED_COST_POLICY_JSON'];
    const previous = names.map(name => [name, process.env[name]] as const);
    const calls: { step: AiStep; inputTokens: number; maxOutputTokens: number; usage?: AiUsage }[] = [];
    const evidence: Record<string, unknown> = { kind: 'isolated_real_provider_acceptance', asrRequests: 0, stripeRequests: 0, calls, maximumRunUsd: 0.05,
        pricingSource: 'https://ai.google.dev/gemini-api/docs/pricing', pricingObservedOn: '2026-10-23', databaseDropped: false };
    let connected = false;
    let hook: ReturnType<typeof registerHooks> | undefined;
    try {
        await client.connect(); connected = true;
        Object.assign(process.env, { NEXT_PUBLIC_ENABLE_BILLING: 'true', GOOGLE_GENERATIVE_AI_API_KEY: process.env.VOSIFT_TEST_GEMINI_API_KEY!,
            AI_PROVIDER: 'gemini', GEMINI_MODEL_SUMMARY: 'gemini-3.5-flash-lite', GEMINI_MODEL_TRANSLITERATION: 'gemini-3.5-flash-lite', GEMINI_MODEL_EMBEDDING: 'gemini-embedding-001', SEARCH_EMBEDDING_DIMENSIONS: '3072' });
        delete process.env.MANAGED_COST_POLICY_JSON;
        hook = registerHooks({ resolve(specifier, context, next) {
            if (specifier === '@/lib/mongodb' || specifier === './mongodb' && context.parentURL?.endsWith('/processing-availability.ts')) return {
                url: `data:text/javascript,${encodeURIComponent(`export const Collections=${JSON.stringify(Collections)};export async function getMongoDb(){const f=globalThis[Symbol.for('vosift.test.real-bundled-enrichment')];if(!f)throw new Error('Disposable provider fixture unavailable');return f.db;}`)}`,
                shortCircuit: true,
            };
            if (specifier === '@/services/ai' && context.parentURL?.endsWith('/transcription/enrichment.ts')) return {
                url: `data:text/javascript,${encodeURIComponent(`export function getAiService(){const f=globalThis[Symbol.for('vosift.test.real-bundled-enrichment')];if(!f)throw new Error('Disposable provider fixture unavailable');return f.service;}`)}`,
                shortCircuit: true,
            };
            return next(specifier, context);
        } });
        const { getAiService } = await import('@/services/ai');
        const real = getAiService('gemini');
        const context = (step: AiStep, input?: AiStepContext): AiStepContext => {
            const request = input?.plannedRequest;
            assert.ok(request, 'The real transport must receive its exact planned request');
            assert.ok(request.inputTokens <= 2048 && request.maxOutputTokens <= 4096);
            assert.ok(calls.length < 4, 'The opt-in run permits at most four logical provider calls');
            // Reviewed Standard prices: $0.30/M input and $2.50/M output
            // (including thinking). Four maximum-sized calls remain < $0.05.
            const worstUsd = (calls.length + 1) * (2048 * 0.30 + 4096 * 2.50) / 1_000_000;
            assert.ok(worstUsd < 0.05, 'The isolated test ceiling must hold before a paid call');
            const call = { step, inputTokens: request.inputTokens, maxOutputTokens: request.maxOutputTokens, usage: undefined as AiUsage | undefined };
            calls.push(call);
            return { ...input, onUsage: async usage => { call.usage = usage; await input?.onUsage?.(usage); } };
        };
        const service: IAIService = {
            countInputTokens: real.countInputTokens!.bind(real),
            generateSummary: (text, language, input) => real.generateSummary(text, language, context('summary', input)),
            generateTransliteration: (segments, language, input) => real.generateTransliteration(segments, language, context('transliteration', input)),
            generateEmbedding: (text, input) => real.generateEmbedding(text, context('embedding', input)),
        };
        fixture[fixtureKey] = { db, service };
        const subject = `owned-fictional-${randomUUID()}`;
        const user = userFixture({ authSubject: subject, role: 'user', planKey: 'internal', transcriptionAllocation: 0, transcriptionUsed: 12345, storageAllocation: 1024 ** 4,
            billingEntitlement: { source: 'admin', grantedAt: new Date(), reference: 'isolated-provider-fixture' }, stripeCustomerId: undefined });
        await db.collection<User>(Collections.USERS).insertOne(user);
        const now = new Date(), id = new ObjectId();
        const recording: Recording = { _id: id, authSubject: subject, contactId: null, contactName: null, phoneNumber: '', normalizedPhoneNumber: '',
            r2Key: 'fictional/no-upload/no-asr', fileName: 'fictional-saved-transcript.mp3', standardizedDisplayName: 'Fictional provider acceptance', fileSize: 1000, mimeType: 'audio/mpeg', duration: 15,
            recordedAt: now, createdAt: now, updatedAt: now, transcriptionStatus: 'processing', tags: [], isStarred: false, isArchived: false,
            transcriptionEnrichmentPending: true, transcriptionResultAttemptId: 'historical-audio-no-funding-proof', languageCode: 'ml',
            fullTranscript: [
                { speakerId: 'A', start: 0, end: 5, text: 'Fictional demo: Maya plans a test.', words: [{ text: 'Fictional', start: 0, end: 1 }] },
                { speakerId: 'B', start: 5, end: 15, text: 'മായ നാളെ വരും. नमस्ते दोस्त।', words: [{ text: 'മായ', start: 5, end: 6 }] },
            ] };
        await db.collection<Recording>(Collections.RECORDINGS).insertOne(recording);
        const { finishTranscriptionEnrichment } = await import('./enrichment');
        await finishTranscriptionEnrichment(subject, id.toHexString());
        const completed = await db.collection<Recording>(Collections.RECORDINGS).findOne({ _id: id });
        assert.equal(completed?.transcriptionStatus, 'completed'); assert.equal(completed?.transcriptionEnrichmentPending, false);
        assert.ok(completed?.summary?.trim()); assert.equal(completed?.searchIndex?.state, 'ready');
        const passages = await db.collection<{ vector: number[] }>('recording_passages').find({ recordingId: id.toHexString() }).toArray();
        assert.ok(passages.length); assert.equal(passages[0].vector.length, 3072);
        assert.deepEqual(completed?.fullTranscript?.map(({ transliteratedText: _latin, ...source }) => source), recording.fullTranscript);
        assert.ok(completed?.fullTranscript?.every(segment => segment.transliteratedText?.trim()));
        assert.ok(completed?.fullTranscript?.[1].transliteratedText && /^[\x00-\x7f]+$/.test(completed.fullTranscript[1].transliteratedText));
        assert.equal(Object.keys(completed?.aiWorkCheckpoints || {}).length, 3);
        const count = calls.length;
        assert.deepEqual(calls.map(call => call.step), ['summary', 'transliteration', 'embedding']);
        await finishTranscriptionEnrichment(subject, id.toHexString());
        assert.equal(calls.length, count, 'Re-running completed enrichment must issue zero paid calls');
        const updated = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject });
        assert.equal(updated?.transcriptionUsed, 12345); assert.equal(updated?.billingAccount ?? null, null); assert.equal(updated?.stripeCustomerId ?? null, null);
        for (const name of ['billing_provider_attempts', 'billing_usage_receipts', 'billing_processing_budgets', 'billing_operator_budget', 'billing_internal_costs', 'usage_events']) {
            assert.equal(await db.collection(name).countDocuments({}), 0, `${name} must contain no fabricated accounting`);
        }
        const measuredTextMicros = calls.filter(call => call.step !== 'embedding').reduce((sum, call) => sum
            + (call.usage?.inputTokens || 0) * 0.30 + ((call.usage?.outputTokens || 0) + (call.usage?.thoughtTokens || 0)) * 2.50, 0);
        const embeddingBoundMicros = calls.filter(call => call.step === 'embedding').reduce((sum, call) => sum + call.inputTokens * 0.15, 0);
        Object.assign(evidence, { completed: true, repeatedPaidCalls: calls.length - count, summaryCharacters: completed!.summary!.length,
            embeddingDimensions: passages[0].vector.length, measuredTextMicros, embeddingBoundMicros, estimatedTotalUsd: (measuredTextMicros + embeddingBoundMicros) / 1_000_000 });
        t.diagnostic(JSON.stringify(evidence));
    } catch (error) {
        evidence.completed = false;
        evidence.error = error instanceof Error ? error.message : 'Provider acceptance failed';
        throw error;
    } finally {
        hook?.deregister(); delete fixture[fixtureKey];
        for (const [name, value] of previous) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
        if (connected) { await db.dropDatabase(); evidence.databaseDropped = true; }
        await client.close();
        const output = process.env.VOSIFT_TEST_AI_EVIDENCE_PATH;
        if (output) { assert.ok(output.startsWith('/tmp/'), 'Private acceptance evidence must stay outside the repository'); writeFileSync(output, JSON.stringify(evidence, null, 2), { mode: 0o600 }); }
    }
});
