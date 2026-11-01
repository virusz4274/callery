import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { logger } from '@/lib/logger';
import type { TranscriptionSegment } from '@/lib/db/types';
import type { AiStepFailure } from './failure-events';
import { getGeminiClient } from './client';

// Provider tests must never write audit events into a real database. Keep the
// production transport and error handlers, replacing only their audit sink.
const failures: { error: unknown; failure: AiStepFailure }[] = [];
const stateKey = Symbol.for('vosift.test.strict-ai-failures');
const shared = globalThis as typeof globalThis & { [stateKey]: typeof failures };
shared[stateKey] = failures;
const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === './failure-events' && /\/(?:gemini-service|openai-compat-service)\.ts$/.test(context.parentURL || '')) {
            return {
                url: `data:text/javascript,${encodeURIComponent(`export async function logAiStepFailure(error, failure) { globalThis[Symbol.for('vosift.test.strict-ai-failures')].push({ error, failure }); }`)}`,
                shortCircuit: true,
            };
        }
        return nextResolve(specifier, context);
    },
});
const { GeminiService } = await import('./gemini-service');
const { OpenAiCompatService } = await import('./openai-compat-service');
hook.deregister();

const segments: TranscriptionSegment[] = [{ speakerId: 'Speaker 1', text: 'നമസ്കാരം', words: [] }];
const context = { recordingId: 'saved-recording', authSubject: 'owner', throwOnError: true };

function fixtureEnv(t: TestContext) {
    const names = ['GOOGLE_GENERATIVE_AI_API_KEY', 'OPENAI_COMPAT_BASE_URL', 'OPENAI_COMPAT_CHAT_MODEL', 'OPENAI_COMPAT_EMBEDDING_MODEL'];
    const saved = names.map(name => [name, process.env[name]] as const);
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'strict-failure-test';
    process.env.OPENAI_COMPAT_BASE_URL = 'https://provider.test/v1';
    process.env.OPENAI_COMPAT_CHAT_MODEL = 'chat-test';
    process.env.OPENAI_COMPAT_EMBEDDING_MODEL = 'embedding-test';
    failures.length = 0;
    t.mock.method(logger, 'error', () => {});
    t.after(() => {
        for (const [name, value] of saved) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
    });
}

test('Gemini paid enrichment rethrows provider errors only for strict callers', async t => {
    fixtureEnv(t);
    const service = new GeminiService();
    const error = new Error('Provider busy; retry after reviewing usage');
    const client = getGeminiClient();
    t.mock.method(client.models, 'generateContent', async () => { throw error; });
    t.mock.method(client.models, 'embedContent', async () => { throw error; });

    await assert.rejects(service.generateSummary('Hello', 'en', context), candidate => candidate === error);
    await assert.rejects(service.generateTransliteration(segments, 'ml', context), candidate => candidate === error);
    await assert.rejects(service.generateEmbedding('Hello', context), candidate => candidate === error);
    assert.equal(await service.generateSummary('Hello', 'en'), '');
    assert.equal(await service.generateTransliteration(segments, 'ml', { throwOnError: false }), segments);
    assert.deepEqual(await service.generateEmbedding('Hello'), []);
    assert.deepEqual(failures.map(entry => entry.failure.step), ['summary', 'transliteration', 'embedding', 'summary', 'transliteration', 'embedding']);
    assert.ok(failures.every(entry => entry.error === error && entry.failure.provider === 'gemini'));
    assert.equal(failures[0].failure.context?.recordingId, context.recordingId);
});

test('compatible providers retain fallbacks while strict batches reject HTTP failures', async t => {
    fixtureEnv(t);
    const service = new OpenAiCompatService();
    const requests: string[] = [];
    t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
        requests.push(String(input));
        return new Response('Busy', { status: 429 });
    });

    await assert.rejects(service.generateSummary('Hello', 'en', context), /Chat completions failed: 429/);
    await assert.rejects(service.generateTransliteration(segments, 'ml', context), /Chat completions failed: 429/);
    await assert.rejects(service.generateEmbedding('Hello', context), /Embeddings failed: 429/);
    assert.equal(await service.generateSummary('Hello', 'en'), '');
    assert.equal(await service.generateTransliteration(segments, 'ml'), segments);
    assert.deepEqual(await service.generateEmbedding('Hello', { throwOnError: false }), []);
    assert.equal(requests.filter(url => url.endsWith('/chat/completions')).length, 4);
    assert.equal(requests.filter(url => url.endsWith('/embeddings')).length, 2);
    assert.equal(failures.length, 6);
    assert.ok(failures.every(entry => entry.failure.provider === 'openai_compat'));
});

test('strict callers also reject malformed successful AI responses', async t => {
    fixtureEnv(t);
    const client = getGeminiClient();
    t.mock.method(client.models, 'generateContent', async () => ({ text: 'not JSON' }));
    const gemini = new GeminiService();
    await assert.rejects(gemini.generateTransliteration(segments, 'ml', context), SyntaxError);
    assert.equal(await gemini.generateTransliteration(segments, 'ml'), segments);

    t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => Response.json(String(input).endsWith('/embeddings')
        ? { data: [{ embedding: ['invalid'] }] }
        : { choices: [{ message: { content: 'not JSON' } }] }));
    const compat = new OpenAiCompatService();
    await assert.rejects(compat.generateTransliteration(segments, 'ml', context), SyntaxError);
    await assert.rejects(compat.generateEmbedding('Hello', context), /no numeric vector/);
    assert.equal(await compat.generateTransliteration(segments, 'ml'), segments);
    assert.deepEqual(await compat.generateEmbedding('Hello'), []);
});
