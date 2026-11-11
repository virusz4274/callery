import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAiWorkPlan, buildPreflightExecutionLimits, defaultTranscriptEnvelope, fingerprint, planAiCall, processingModels, transcriptRevision } from './ai-work-plan';
import { AI_PROMPT_V1 } from '@/services/ai/prompts';
import type { IAIService } from '@/services/ai/types';
import { ProcessingError } from './processing-errors';

const service: IAIService = { countInputTokens: async (_model, text) => Math.ceil(Buffer.byteLength(text) / 4), generateSummary: async () => '', generateTransliteration: async s => s, generateEmbedding: async () => [] };

test('paid preflight requires execution limits and credentials without cost policy or attestations', () => {
    const result = buildPreflightExecutionLimits({ fundingSource: 'customer', provider: 'gemini', model: 'test', durationSeconds: 15, fileSize: 1234 });
    assert.deepEqual(result.transcriptEnvelope, defaultTranscriptEnvelope(15));
    assert.equal('maximumCostMicros' in result, false);
    assert.equal('rate' in result.aiModels.summary, false);
});
test('token counting uses complete escaped instructions and indexed JSON rather than source text alone', async () => {
    let counted = '';
    const model = processingModels().transliteration;
    const call = await planAiCall({ id: 'escaped', step: 'transliteration', prompt: 'Instructions\\n[[0,"\\\"\\nമലയാളം"]]', model,
        service: { ...service, countInputTokens: async (_model, prompt) => { counted = prompt; return 127; } }, managed: true, maximumOutputTokens: 384 });
    assert.equal(counted, call.prompt); assert.equal(call.inputTokens, 127); assert.equal(call.maxOutputTokens, 384);
    assert.equal(call.maximumCostMicros, undefined);
});
test('configured provider without a tokenizer uses a conservative byte bound', async () => {
    const noCounter = { ...service }; delete noCounter.countInputTokens;
    const call = await planAiCall({ id: 'no-counter', step: 'summary', prompt: 'source', model: processingModels().summary, service: noCounter, managed: true, maximumOutputTokens: 512 });
    assert.equal(call.inputCountBasis, 'utf8_byte_bound');
    assert.equal(call.inputTokens, Buffer.byteLength(call.prompt));
});
test('exact request token overflow rejects instead of silently cutting source text', async () => {
    await assert.rejects(planAiCall({ id: 'overflow', step: 'summary', prompt: 'source', model: processingModels().summary,
        service: { ...service, countInputTokens: async () => 2049 }, managed: true, maximumOutputTokens: 512 }), /exact AI request exceeds/);
});
test('all source text remains in planned summary leaves and multilingual chunks with their stable source indexes', async () => {
    const segments = [{ speakerId: 'A', text: 'English'.repeat(100), words: [] }, { speakerId: 'B', text: 'മലയാളം'.repeat(100), words: [] }];
    const plan = await buildAiWorkPlan({ segments, language: 'ml', parentReceiptId: 'original', fundingSource: 'internal', aiModels: processingModels(), service, managed: true,
        envelope: { ...defaultTranscriptEnvelope(60), maxSourceTextBytes: 10_000 } });
    assert.ok(plan.summaryLeaves.some(l => l.sourceIndexes.includes(0))); assert.ok(plan.summaryLeaves.some(l => l.sourceIndexes.includes(1)));
    assert.equal(plan.transliterationChunks.flatMap(c => c.segments.map(s => s.text)).join(''), segments[1].text);
    assert.deepEqual(plan.passthroughIndexes, [0]);
    assert.ok(plan.summaryLeaves.every(l => l.call.maxOutputTokens <= 512));
    assert.ok(plan.transliterationChunks.every(c => c.call.inputTokens <= 2048 && c.call.maxOutputTokens <= 4096));
});
test('post-transcription plan preserves envelope limits and refuses an unsupported long recording', async () => {
    const envelope = defaultTranscriptEnvelope(1);
    await assert.rejects(buildAiWorkPlan({ segments: [{ speakerId: 'A', text: 'x'.repeat(envelope.maxSourceTextBytes + 1), words: [] }], language: 'en',
        parentReceiptId: 'original', fundingSource: 'internal', aiModels: processingModels(), service, managed: true, envelope }), /exceeds the accepted processing envelope/);
});

test('preflight covers many tiny source segments as well as newline overhead', async () => {
    const segments = Array.from({ length: 75 }, (_, i) => ({ speakerId: String(i), text: 'അ', words: [] }));
    const envelope = defaultTranscriptEnvelope(60);
    const preflight = buildPreflightExecutionLimits({ fundingSource: 'internal', provider: 'gemini', model: 'test', durationSeconds: 60, fileSize: 1000 });
    const plan = await buildAiWorkPlan({ segments, language: 'ml', parentReceiptId: 'tiny', fundingSource: 'internal', aiModels: preflight.aiModels, service, managed: true, envelope });
    assert.equal(plan.version, 2);
    assert.equal(plan.transliterationChunks.length, 1); assert.equal(plan.maximumCostMicros, undefined);
    assert.deepEqual(plan.transliterationChunks.flatMap(chunk => chunk.sources.map(source => source.index)), segments.map((_, index) => index));
    assert.equal(new Set(plan.summaryLeaves.flatMap(l => l.sourceIndexes)).size, segments.length);
});

test('Internal can use an explicit physical input estimate when a self-host provider has no tokenizer', async () => {
    const noCounter = { ...service }; delete noCounter.countInputTokens;
    const call = await planAiCall({ id: 'internal-physical', step: 'summary', prompt: 'bounded source', model: { provider: 'openai_compat', model: 'local-model' },
        service: noCounter, managed: true, maximumOutputTokens: 512, allowPhysicalInputBound: true });
    assert.equal(call.inputCountBasis, 'utf8_byte_bound'); assert.equal(call.maximumCostMicros, undefined);
});

test('v1 prompt requests retain their per-part shape while indexing pins the embedding profile', async () => {
    const segments = Array.from({ length: 8 }, (_, index) => ({ speakerId: String(index), text: 'അ', words: [] }));
    const input = { segments, language: 'ml', parentReceiptId: 'accepted', fundingSource: 'internal' as const, aiModels: processingModels(), service, managed: true, envelope: defaultTranscriptEnvelope(60) };
    const legacy = await buildAiWorkPlan({ ...input, plannerVersion: 1 });
    assert.equal(legacy.version, 1);
    assert.equal(legacy.id, fingerprint({ revision: transcriptRevision(segments), parent: input.parentReceiptId, models: input.aiModels, prompts: AI_PROMPT_V1, embeddingProfile: legacy.embeddingProfile.id }));
    assert.deepEqual(legacy.transliterationChunks.map(chunk => chunk.call.id), segments.map((_, index) => `transliteration-${index}-0`));
    const current = await buildAiWorkPlan(input);
    assert.equal(current.transliterationChunks.length, 1);
    assert.notEqual(current.id, legacy.id);
});

test('new summary prompts state the transmitted cap while accepted v1 prompts stay unchanged', async () => {
    const segments = [{ speakerId: 'A', text: 'source '.repeat(400), words: [] }];
    const input = { segments, language: 'en', parentReceiptId: 'summary-limits', fundingSource: 'internal' as const,
        aiModels: processingModels(), service, managed: true, envelope: defaultTranscriptEnvelope(120) };
    const current = await buildAiWorkPlan(input), legacy = await buildAiWorkPlan({ ...input, plannerVersion: 1 });
    assert.ok(current.summaryLeaves.length > 1);
    for (const leaf of current.summaryLeaves) {
        assert.equal(leaf.call.maxOutputTokens, 192);
        assert.ok(leaf.call.prompt.includes('at most 192 tokens.'));
        assert.equal(leaf.call.promptVersion, current.promptVersion);
    }
    for (const leaf of legacy.summaryLeaves) {
        assert.equal(leaf.call.maxOutputTokens, 192);
        assert.ok(leaf.call.prompt.includes('at most 512 tokens.'));
        assert.equal(leaf.call.promptVersion, AI_PROMPT_V1);
    }
});

test('packed multilingual chunks retain every escaped source part and bounded output', async () => {
    const segments = [
        { speakerId: 'A', start: 0, end: 20, text: ('മലയാളം "quoted" \\\n\u0000').repeat(75), words: [{ text: 'private-word', start: 1 }] },
        { speakerId: 'B', text: 'English passthrough', words: [] },
        { speakerId: 'C', text: 'नमस्ते שלום 😀'.repeat(50), words: [] },
    ];
    const original = structuredClone(segments), counted: string[] = [];
    const plan = await buildAiWorkPlan({ segments, language: 'ml', parentReceiptId: 'escaping', fundingSource: 'selfhost', aiModels: processingModels(),
        service: { ...service, countInputTokens: async (_model, prompt) => { counted.push(prompt); return Math.ceil(Buffer.byteLength(prompt) / 4); } }, managed: false,
        envelope: defaultTranscriptEnvelope(180) });
    const reconstructed = ['', segments[1].text, ''];
    const parts = [0, 0, 0];
    for (const chunk of plan.transliterationChunks) {
        assert.ok(counted.includes(chunk.call.prompt));
        assert.ok(chunk.call.inputTokens <= 2048 && chunk.call.maxOutputTokens <= 4096);
        assert.ok(!chunk.call.prompt.includes('private-word'));
        chunk.sources.forEach((source, index) => {
            assert.equal(source.part, parts[source.index]++);
            reconstructed[source.index] += chunk.segments[index].text;
        });
    }
    assert.deepEqual(reconstructed, segments.map(segment => segment.text));
    assert.deepEqual(segments, original);
});

test('missing bundled AI credentials rejects before transcription even when Internal has unlimited funding', t => {
    const previous = process.env.GOOGLE_GENERATIVE_AI_API_KEY; delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    t.after(() => { if (previous === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY; else process.env.GOOGLE_GENERATIVE_AI_API_KEY = previous; });
    assert.throws(() => buildPreflightExecutionLimits({ fundingSource: 'internal', provider: 'soniox', model: 'stt-async-v5', durationSeconds: 15, fileSize: 1000 }),
        (e: unknown) => e instanceof ProcessingError && e.processingStatus.stage === 'transcription' && e.processingStatus.providerOutcome === 'not_started' && e.processingStatus.code === 'provider_configuration');
});

test('configured compatible models do not require monetary costs or tokenizer attestations', t => {
    const names = ['AI_PROVIDER', 'OPENAI_COMPAT_BASE_URL', 'OPENAI_COMPAT_CHAT_MODEL', 'OPENAI_COMPAT_EMBEDDING_MODEL'];
    const previous = names.map(name => [name, process.env[name]] as const);
    Object.assign(process.env, { AI_PROVIDER: 'openai_compat', OPENAI_COMPAT_BASE_URL: 'https://owned-provider.invalid/v1', OPENAI_COMPAT_CHAT_MODEL: 'configured', OPENAI_COMPAT_EMBEDDING_MODEL: 'embedding' });
    t.after(() => { for (const [name, value] of previous) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
    assert.equal(processingModels().summary.provider, 'openai_compat');
    assert.equal(processingModels().summary.provider, 'openai_compat');
});
