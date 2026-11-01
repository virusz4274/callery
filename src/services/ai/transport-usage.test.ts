import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { getGeminiClient } from './client';
import type { AiUsage } from './types';

const failureHook = registerHooks({ resolve(specifier, context, next) {
    if (specifier === './failure-events' && /\/(?:gemini-service|openai-compat-service)\.ts$/.test(context.parentURL || '')) {
        return { url: 'data:text/javascript,export async function logAiStepFailure(){}', shortCircuit: true };
    }
    return next(specifier, context);
} });
const { GeminiService } = await import('./gemini-service');
const { OpenAiCompatService } = await import('./openai-compat-service');
failureHook.deregister();

test('Gemini records actual usage immediately and applies a hard output cap', async t => {
    const client = getGeminiClient();
    const generate = t.mock.method(client.models, 'generateContent', async () => ({ text: 'Summary', responseId: 'provider-request', modelVersion: 'actual-model',
        usageMetadata: { promptTokenCount: 24, candidatesTokenCount: 8, thoughtsTokenCount: 3, cachedContentTokenCount: 4 } }));
    const usages: AiUsage[] = [];
    assert.equal(await new GeminiService().generateSummary('source '.repeat(1000), 'en', { throwOnError: true, onUsage: async usage => { usages.push(usage); } }), 'Summary');
    const request = generate.mock.calls[0].arguments[0];
    assert.ok(request);
    assert.equal(request.config?.maxOutputTokens, 512);
    assert.equal(request.config?.automaticContinuation, false);
    assert.ok(Buffer.byteLength(String(request.contents)) <= 2048);
    assert.deepEqual([usages[0].inputTokens, usages[0].outputTokens, usages[0].thoughtTokens, usages[0].cachedInputTokens], [24, 8, 3, 4]);
    assert.equal(usages[0].actualModel, 'actual-model');
    assert.equal(usages[0].requestId, 'provider-request');
});

test('compatible chat requests include the completion cap and preserve measured usage', async t => {
    const names = ['OPENAI_COMPAT_BASE_URL', 'OPENAI_COMPAT_CHAT_MODEL', 'OPENAI_COMPAT_EMBEDDING_MODEL'];
    const saved = names.map(name => [name, process.env[name]] as const);
    process.env.OPENAI_COMPAT_BASE_URL = 'https://provider.test/v1';
    process.env.OPENAI_COMPAT_CHAT_MODEL = 'test-chat';
    process.env.OPENAI_COMPAT_EMBEDDING_MODEL = 'test-embedding';
    t.after(() => { for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
    const bodies: Record<string, unknown>[] = [];
    t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return Response.json({ id: 'compat-request', choices: [{ message: { content: 'Summary' } }], usage: { prompt_tokens: 20, completion_tokens: 8, completion_tokens_details: { reasoning_tokens: 2 } } });
    });
    const usages: AiUsage[] = [];
    assert.equal(await new OpenAiCompatService().generateSummary('source', 'en', { throwOnError: true, onUsage: async usage => { usages.push(usage); } }), 'Summary');
    assert.equal(bodies[0].max_completion_tokens, 512);
    assert.deepEqual([usages[0].inputTokens, usages[0].outputTokens, usages[0].thoughtTokens], [20, 6, 2]);
});

test('planned Gemini requests transmit the pinned model, exact prompt, output and thinking limits', async t => {
    const client = getGeminiClient();
    const count = t.mock.method(client.models, 'countTokens', async () => ({ totalTokens: 27 }));
    const generate = t.mock.method(client.models, 'generateContent', async () => ({ text: 'Complete summary', candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 27, candidatesTokenCount: 4, thoughtsTokenCount: 2 } }));
    const service = new GeminiService();
    assert.equal(await service.countInputTokens('gemini-3.1-flash-lite-preview', 'EXACT SOURCE'), 27);
    assert.deepEqual(count.mock.calls[0].arguments[0], { model: 'gemini-3.1-flash-lite-preview', contents: 'EXACT SOURCE' });
    await service.generateSummary('unused legacy input', 'en', { throwOnError: true, plannedRequest: { version: 1, id: 'call', provider: 'gemini', model: 'gemini-3.1-flash-lite-preview',
        prompt: 'EXACT SOURCE', promptVersion: 'v1', inputTokens: 27, maxOutputTokens: 192, thinking: 'minimal' } });
    const request = generate.mock.calls[0].arguments[0];
    assert.ok(request);
    assert.equal(request.model, 'gemini-3.1-flash-lite-preview'); assert.equal(request.contents, 'EXACT SOURCE');
    assert.equal(request.config?.maxOutputTokens, 192); assert.equal(request.config?.thinkingConfig?.thinkingLevel, 'MINIMAL');
    assert.equal(request.config?.automaticContinuation, false);
});

test('planned Gemini truncation records incurred usage but cannot complete a checkpoint', async t => {
    const client = getGeminiClient();
    t.mock.method(client.models, 'generateContent', async () => ({ text: 'partial response', candidates: [{ finishReason: 'MAX_TOKENS' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, thoughtsTokenCount: 3 } }));
    const usages: AiUsage[] = [];
    await assert.rejects(new GeminiService().generateSummary('source', 'en', { throwOnError: true, onUsage: async usage => { usages.push(usage); },
        plannedRequest: { version: 1, id: 'call', provider: 'gemini', model: 'test', prompt: 'exact', promptVersion: 'v1', inputTokens: 10, maxOutputTokens: 128, thinking: 'off' } }), /incomplete, or truncated/);
    assert.equal(usages.length, 1); assert.equal(usages[0].thoughtTokens, 3);
});
