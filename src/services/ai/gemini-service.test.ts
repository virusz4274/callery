import test from 'node:test';
import assert from 'node:assert/strict';
import { GeminiService } from './gemini-service';

test('generateTransliteration parser accepts a clean JSON array', () => {
    const service = new GeminiService();
    const parseTransliterationSegments = (service as unknown as {
        parseTransliterationSegments: (responseText: string) => Array<{ transliteratedText?: string }>;
    }).parseTransliterationSegments.bind(service);

    const parsed = parseTransliterationSegments('[{"speakerId":"spk_0","text":"halo","words":[],"transliteratedText":"halo"}]');

    assert.equal(parsed[0]?.transliteratedText, 'halo');
});

test('generateTransliteration parser extracts the first JSON array when Gemini adds trailing text', () => {
    const service = new GeminiService();
    const parseTransliterationSegments = (service as unknown as {
        parseTransliterationSegments: (responseText: string) => Array<{ transliteratedText?: string }>;
    }).parseTransliterationSegments.bind(service);

    const parsed = parseTransliterationSegments(`
[{"speakerId":"spk_0","text":"namaskaram","words":[],"transliteratedText":"namaskaram"}]
This transliteration preserves the original meaning.
`);

    assert.equal(parsed[0]?.transliteratedText, 'namaskaram');
});
