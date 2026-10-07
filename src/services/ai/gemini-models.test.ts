import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { GenerateContentParameters } from '@google/genai';
import { env } from '@/lib/env';
import { GeminiTranscriptionService, parseNativeGeminiTranscript } from '@/services/transcription/gemini-transcription-service';
import { getGeminiClient } from './client';
import { GeminiService } from './gemini-service';

function isolateGeminiEnv(t: TestContext) {
    const names = [
        'GOOGLE_GENERATIVE_AI_API_KEY',
        'GEMINI_MODEL_TRANSCRIPTION',
        'GEMINI_MODEL_SUMMARY',
        'GEMINI_MODEL_TRANSLITERATION',
        'GEMINI_MODEL_EMBEDDING',
    ];
    const previous = names.map(name => [name, process.env[name]] as const);
    for (const name of names) delete process.env[name];
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test';
    t.after(() => {
        for (const [name, value] of previous) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
    });
}

test('Gemini transcription sends the current env model or per-call override and records it', async t => {
    isolateGeminiEnv(t);
    const client = getGeminiClient();
    t.mock.method(globalThis, 'fetch', async () => new Response('audio', {
        headers: { 'content-type': 'audio/mpeg' },
    }));
    t.mock.method(client.files, 'upload', async () => ({
        name: 'files/test', uri: 'https://example.com/audio', state: 'ACTIVE', mimeType: 'audio/mpeg',
    }));
    const deleteFile = t.mock.method(client.files, 'delete', async () => undefined);
    const generate = t.mock.method(client.models, 'generateContent', async () => ({
        text: JSON.stringify({ language: 'en', segments: [{ speaker: 'SPEAKER_0', text: 'Hello', start: 0, end: 1 }] }),
    }));
    const service = new GeminiTranscriptionService();
    const cases = [
        { configured: undefined, override: undefined, expected: 'gemini-3.8-flash' },
        { configured: '', override: undefined, expected: 'gemini-3.8-flash' },
        { configured: '  ', override: undefined, expected: 'gemini-3.8-flash' },
        { configured: ' audio-model ', override: undefined, expected: 'audio-model' },
        { configured: 'next-audio-model', override: undefined, expected: 'next-audio-model' },
        { configured: 'audio-model', override: ' per-call-model ', expected: 'per-call-model' },
        { configured: 'audio-model', override: '  ', expected: 'audio-model' },
    ];
    process.env.GEMINI_MODEL_SUMMARY = 'summary-only-model';
    process.env.GEMINI_MODEL_TRANSLITERATION = 'transliteration-only-model';
    for (const { configured, override, expected } of cases) {
        if (configured === undefined) delete process.env.GEMINI_MODEL_TRANSCRIPTION;
        else process.env.GEMINI_MODEL_TRANSCRIPTION = configured;
        const result = await service.transcribe('https://example.com/source', { model: override });
        assert.equal(generate.mock.calls.at(-1)?.arguments[0]?.model, expected);
        assert.equal(result.model, expected);
        assert.equal(result.text, 'Hello');
        assert.equal(result.provider, 'gemini');
        assert.equal(env.GEMINI_MODEL_TRANSCRIPTION, configured?.trim() || 'gemini-3.8-flash');
        await service.deleteTranscript(result.transcriptionId);
    }
    assert.equal(deleteFile.mock.callCount(), cases.length);
});

test('Gemini text and embedding requests use independent env settings with supported defaults', async t => {
    isolateGeminiEnv(t);
    const client = getGeminiClient();
    const generate = t.mock.method(client.models, 'generateContent', async (request: GenerateContentParameters) => ({
        text: request.config?.responseMimeType === 'application/json'
            ? '[{"transliteratedText":"namaskaram"}]'
            : 'A summary.',
    }));
    const embed = t.mock.method(client.models, 'embedContent', async () => ({
        embeddings: [{ values: [0.1, 0.2] }],
    }));
    const service = new GeminiService();
    const segments = [{ speakerId: 'Speaker 0', text: 'നമസ്കാരം', start: 0, end: 1, words: [] }];
    process.env.GEMINI_MODEL_TRANSCRIPTION = 'audio-only-model';
    for (const configured of [undefined, '', '  ', 'custom']) {
        for (const feature of ['SUMMARY', 'TRANSLITERATION', 'EMBEDDING']) {
            const name = `GEMINI_MODEL_${feature}`;
            if (configured === undefined) delete process.env[name];
            else process.env[name] = configured === 'custom' ? ` ${feature.toLowerCase()}-model ` : configured;
        }
        assert.equal(await service.generateSummary('Hello', 'en'), 'A summary.');
        assert.equal((await service.generateTransliteration(segments, 'ml'))[0].transliteratedText, 'namaskaram');
        assert.deepEqual(await service.generateEmbedding('Hello'), [0.1, 0.2]);
        const requests = generate.mock.calls.slice(-2);
        assert.equal(requests[0].arguments[0].model, configured === 'custom' ? 'summary-model' : 'gemini-3.8-flash');
        assert.equal(requests[1].arguments[0].model, configured === 'custom' ? 'transliteration-model' : 'gemini-3.8-flash');
        assert.equal(embed.mock.calls.at(-1)?.arguments[0]?.model, configured === 'custom' ? 'embedding-model' : 'gemini-embedding-001');
        assert.equal(env.GEMINI_MODEL_SUMMARY, requests[0].arguments[0].model);
        assert.equal(env.GEMINI_MODEL_TRANSLITERATION, requests[1].arguments[0].model);
        assert.equal(env.GEMINI_MODEL_EMBEDDING, embed.mock.calls.at(-1)?.arguments[0]?.model);
    }
});

test('Gemini 3.5 Transcribe requests native ASR and preserves speakers, language, and fractional word timestamps', async t => {
    isolateGeminiEnv(t);
    process.env.GEMINI_MODEL_TRANSCRIPTION = 'gemini-3.5-transcribe';
    const client = getGeminiClient();
    t.mock.method(globalThis, 'fetch', async () => new Response('audio'));
    t.mock.method(client.files, 'upload', async () => ({
        name: 'files/test', uri: 'https://example.com/audio', state: 'ACTIVE', mimeType: 'audio/wav',
    }));
    const deleteFile = t.mock.method(client.files, 'delete', async () => undefined);
    const generate = t.mock.method(client.models, 'generateContent', async () => ({
        candidates: [{ content: { parts: [
            { audioTranscription: { text: 'Hello world.', languageCode: 'en-US', speakerLabel: 'spk_1', words: [
                { word: 'Hello', startOffset: '0.100s', endOffset: '0.450s' },
                { word: 'world.', startOffset: '0.500s', endOffset: '0.850s' },
            ] } },
            { audioTranscription: { text: 'Hi.', speakerLabel: 'spk_2', words: [
                { word: 'Hi.', startOffset: '1.100s', endOffset: '1.500s' },
            ] } },
        ] } }],
    }));
    const service = new GeminiTranscriptionService();
    const result = await service.transcribe('https://example.com/source', { durationSeconds: 2 });
    const request = generate.mock.calls[0].arguments[0];
    assert.ok(request);
    assert.equal(request.model, 'gemini-3.5-transcribe');
    assert.deepEqual(request.contents, [{ fileData: { fileUri: 'https://example.com/audio', mimeType: 'audio/wav' } }]);
    assert.deepEqual(request.config, { audioTranscriptionConfig: { mode: 'VERBATIM', diarization: true, wordTimestamp: true } });
    assert.equal(result.languageCode, 'en-US');
    assert.equal(result.text, 'Hello world. Hi.');
    assert.deepEqual(result.segments, [
        { speakerId: 'spk_1', text: 'Hello world.', start: 0.1, end: 0.85, words: [
            { text: 'Hello', start: 0.1, end: 0.45, speakerId: 'spk_1' },
            { text: 'world.', start: 0.5, end: 0.85, speakerId: 'spk_1' },
        ] },
        { speakerId: 'spk_2', text: 'Hi.', start: 1.1, end: 1.5, words: [
            { text: 'Hi.', start: 1.1, end: 1.5, speakerId: 'spk_2' },
        ] },
    ]);
    assert.equal(deleteFile.mock.callCount(), 1);
    await service.deleteTranscript(result.transcriptionId);
    assert.equal(deleteFile.mock.callCount(), 1, 'Job cleanup must not delete the already removed audio upload');
    generate.mock.mockImplementation(async () => { throw new Error('API unavailable'); });
    await assert.rejects(new GeminiTranscriptionService().transcribe('https://example.com/source'), /API unavailable/);
    assert.equal(deleteFile.mock.callCount(), 2);
});

test('native Gemini transcription rejects recordings above its timestamp/diarization duration limit before uploading', async t => {
    isolateGeminiEnv(t);
    process.env.GEMINI_MODEL_TRANSCRIPTION = 'models/gemini-3.5-transcribe';
    const download = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Must not download'); });
    await assert.rejects(
        new GeminiTranscriptionService().transcribe('https://example.com/source', { durationSeconds: 1801 }),
        /at most 30 minutes.*GEMINI_MODEL_TRANSCRIPTION/,
    );
    assert.equal(download.mock.callCount(), 0);
});

test('native Gemini parsing retains untimed speech and validates word offsets', () => {
    const parsed = parseNativeGeminiTranscript([
        { text: 'Untimed speech.' },
        { words: [
            { word: 'Hello', startOffset: 'invalid', endOffset: '-1s' },
            { word: 'world.', startOffset: '1.234567890s', endOffset: '30s' },
        ] },
    ], 2);
    assert.equal(parsed.languageCode, 'unknown');
    assert.equal(parsed.segments[0].text, 'Untimed speech.');
    assert.equal(parsed.segments[1].text, 'Hello world.');
    assert.deepEqual(parsed.segments[1].words, [
        { text: 'Hello', start: 0, end: 0, speakerId: 'Unknown' },
        { text: 'world.', start: 1.23456789, end: 2, speakerId: 'Unknown' },
    ]);
});
