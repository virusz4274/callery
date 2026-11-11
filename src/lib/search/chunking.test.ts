import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkTranscript, PASSAGE_LIMITS } from './chunking';

test('passages preserve every multilingual source character and offsets without invented timing', async () => {
    const segments = [
        { speakerId: 'A', text: 'Delivery is delayed until Friday. '.repeat(80), words: [], start: 0, end: 180 },
        { speakerId: 'B', text: 'മലയാളം नमस्ते שלום 🎵 '.repeat(80), words: [] },
        { speakerId: 'C', text: 'Final invoice is 4762.', words: [] },
    ];
    const passages = await chunkTranscript(segments);
    assert.ok(passages.length > 3);
    for (let index = 0; index < segments.length; index++) {
        const covered = new Set<number>();
        for (const passage of passages) for (const source of passage.sources.filter(item => item.segmentIndex === index)) {
            assert.ok(passage.text.includes(segments[index].text.slice(source.from, source.to)));
            for (let offset = source.from; offset < source.to; offset++) covered.add(offset);
        }
        assert.equal(covered.size, segments[index].text.length);
    }
    assert.ok(passages.every(passage => Buffer.byteLength(passage.text) <= PASSAGE_LIMITS.maximum));
    assert.ok(passages.some(passage => passage.start === undefined));
    assert.deepEqual(passages, await chunkTranscript(segments), 'same transcript yields deterministic source references');
    assert.ok(passages.every(passage => !passage.text.includes('\ufffd')));
});

test('provider counting packs utterances to token bounds and retains all model speaker IDs', async () => {
    const segments = Array.from({ length: 12 }, (_, i) => ({ speakerId: String(i), text: `Speaker ${i} says ${'a '.repeat(40)}`, words: [] }));
    const passages = await chunkTranscript(segments, async text => Math.ceil(Buffer.byteLength(text) / 4));
    assert.ok(passages.length < segments.length);
    assert.deepEqual([...new Set(passages.flatMap(passage => passage.sources.map(source => source.segmentIndex)))], segments.map((_, i) => i));
    assert.ok(passages.every(passage => passage.inputTokens <= 512));
});

test('blank transcripts create no passages; a single oversized utterance is completely split', async () => {
    assert.deepEqual(await chunkTranscript([{ speakerId: 'A', text: '  \n', words: [] }]), []);
    const text = 'x'.repeat(1800);
    const passages = await chunkTranscript([{ speakerId: 'A', text, words: [] }]);
    assert.ok(passages.length >= 4);
    assert.equal(passages[0].sources[0].from, 0);
    assert.equal(passages.at(-1)!.sources.at(-1)!.to, text.length);
    assert.ok(passages[1].sources[0].from < passages[0].sources.at(-1)!.to, 'adjacent passages include overlap');
});

test('token counting scales with passages rather than each source segment or overlap character', async () => {
    let calls = 0;
    const segments = Array.from({ length: 500 }, (_, i) => ({ speakerId: String(i % 8), text: `A short sentence ${i}.`, words: [] }));
    const passages = await chunkTranscript(segments, async text => { calls++; return Math.ceil(Buffer.byteLength(text) / 4); });
    assert.ok(passages.length < 20);
    assert.ok(calls < passages.length * 16, `Only ${calls} tokenizer calls for ${passages.length} passages`);
});
