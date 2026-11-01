import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_LIMITS, buildSummaryPrompt, buildTransliterationPrompt, mergeTransliteration } from './prompts';
import { buildAiWorkPlan, defaultTranscriptEnvelope, processingModels } from '@/lib/transcription/ai-work-plan';
import { assertAiCallAuthorized, compatUsage, geminiUsage } from './usage';

test('summary and every compact transliteration chunk obey the input bound without losing the transcript tail', async () => {
    const original = [{ speakerId: 'A', text: 'മലയാളം "quoted" \\ words '.repeat(170), words: [{ text: 'private-word-metadata', start: 3 }] },
        { speakerId: 'B', text: 'The final sentence must survive.', words: [] }];
    const summary = buildSummaryPrompt(original[0].text, 'ml');
    assert.ok(Buffer.byteLength(summary) <= AI_LIMITS.inputTokens - 32);
    const plan = await buildAiWorkPlan({ segments: original, language: 'ml', parentReceiptId: 'bounded-text', fundingSource: 'selfhost', aiModels: processingModels(),
        service: { generateSummary: async () => '', generateTransliteration: async s => s, generateEmbedding: async () => [] }, managed: false, envelope: defaultTranscriptEnvelope(300) });
    const chunks = plan.transliterationChunks;
    assert.ok(chunks.length > 1);
    const reconstructed = ['', original[1].text];
    for (const chunk of chunks) {
        const prompt = buildTransliterationPrompt(chunk.segments, 'ml');
        assert.ok(Buffer.byteLength(prompt) <= AI_LIMITS.inputTokens - 32);
        assert.ok(!prompt.includes('private-word-metadata'));
        assert.ok(!prompt.includes('speakerId'));
        chunk.sources.forEach((source, index) => { reconstructed[source.index] += chunk.segments[index].text; });
    }
    assert.deepEqual(reconstructed, original.map(segment => segment.text));
});

test('indexed model output cannot replace original words, timestamps or text, including reordered/malicious indexes', () => {
    const original = [{ speakerId: 'A', text: 'source', start: 1, end: 2, words: [{ text: 'source', start: 1, end: 2 }] },
        { speakerId: 'B', text: 'tail', words: [] }];
    assert.throws(() => mergeTransliteration(original, [[1, 'tail latin'], [0, 'first latin'], [0, 'duplicate'], [100, 'wrong']]), /invalid, duplicate/);
    const result = mergeTransliteration(original, [[1, 'tail latin'], [0, 'first latin']]);
    assert.deepEqual(result.map(segment => segment.transliteratedText), ['first latin', 'tail latin']);
    assert.deepEqual(result[0].words, original[0].words);
    assert.equal(result[0].text, 'source');
    assert.equal(result[0].start, 1);
});

test('actual Gemini and compatible usage keeps cached and thought tokens without double counting reasoning', () => {
    const gemini = geminiUsage('approved', 'summary', { promptTokenCount: 41, candidatesTokenCount: 7, thoughtsTokenCount: 3, cachedContentTokenCount: 5 }, 'request');
    assert.equal(gemini.measured, true);
    assert.deepEqual([gemini.inputTokens, gemini.outputTokens, gemini.thoughtTokens, gemini.cachedInputTokens], [41, 7, 3, 5]);
    const compat = compatUsage('approved', 'summary', { prompt_tokens: 41, completion_tokens: 10,
        prompt_tokens_details: { cached_tokens: 5 }, completion_tokens_details: { reasoning_tokens: 3 } });
    assert.deepEqual([compat.inputTokens, compat.outputTokens, compat.thoughtTokens, compat.cachedInputTokens], [41, 7, 3, 5]);
    assert.equal(geminiUsage('approved', 'embedding').measured, false);
    assert.equal(compatUsage('approved', 'embedding', { prompt_tokens: 4 }).measured, true);
});

test('managed calls require execution provenance and pinned models without cost tables', t => {
    const names = ['NEXT_PUBLIC_ENABLE_BILLING', 'MANAGED_COST_POLICY_JSON'];
    const saved = names.map(name => [name, process.env[name]] as const);
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true'; delete process.env.MANAGED_COST_POLICY_JSON;
    t.after(() => { for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
    assert.throws(() => assertAiCallAuthorized('gemini', 'configured', 'summary'), /owned execution call/);
    assert.throws(() => assertAiCallAuthorized('gemini', 'configured', 'summary', { authSubject: 'owner' }), /owned execution call/);
    const context = { authSubject: 'owner', reservationId: 'execution-call', fundingSource: 'customer' as const, onUsage: async () => {} };
    assert.doesNotThrow(() => assertAiCallAuthorized('gemini', 'configured', 'summary', context));
    assert.throws(() => assertAiCallAuthorized('gemini', 'substituted', 'summary', { ...context,
        plannedRequest: { version: 1, id: 'call', provider: 'gemini', model: 'configured', prompt: 'bounded', promptVersion: 'pinned', inputTokens: 1, maxOutputTokens: 512, thinking: 'off' } }), /differs from its accepted request/);
});
