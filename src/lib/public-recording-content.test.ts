import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import type { TranscriptionSegment } from './db/types';
import { toPublicRecordingContent } from './public-recording-content';

test('full shares preserve all text, speakers, timing, transliteration and summary while omitting private metadata', () => {
    const fullTranscript: TranscriptionSegment[] = Array.from({ length: 7 }, (_, i) => ({
        speakerId: `provider-${i}`, text: `Complete utterance ${i}`, start: i * 10, end: i * 10 + 8,
        transliteratedText: `Complete transliteration ${i}`, words: [{ text: 'INTERNAL_WORDS', confidence: 0.9 }],
    }));
    const source = {
        _id: new ObjectId(), mimeType: 'audio/mpeg', transcriptionStatus: 'completed' as const,
        transcriptionProvider: 'soniox' as const, transcriptionModel: 'test', fullTranscript,
        summary: 'Complete summary', authSubject: 'PRIVATE_OWNER', r2Key: 'PRIVATE_KEY',
        fileName: 'PRIVATE_FILENAME', bulkImportId: 'PRIVATE_IMPORT', transcriptionCostMultiplier: 99,
    };
    const result = toPublicRecordingContent(source);
    assert.equal(result.summary, source.summary);
    assert.equal(result.fullTranscript?.length, 7);
    for (const [index, segment] of result.fullTranscript!.entries()) {
        assert.equal(segment.text, fullTranscript[index].text);
        assert.equal(segment.speakerId, fullTranscript[index].speakerId);
        assert.equal(segment.transliteratedText, fullTranscript[index].transliteratedText);
        assert.equal(segment.start, fullTranscript[index].start);
        assert.equal('words' in segment, false);
    }
    const serialized = JSON.stringify(result);
    for (const forbidden of ['PRIVATE_', 'INTERNAL_WORDS', 'confidence', 'authSubject', 'r2Key', 'fileName', 'bulkImportId', 'transcriptionCostMultiplier']) {
        assert.equal(serialized.includes(forbidden), false, forbidden);
    }
});

test('projection preserves untimed transcripts and does not copy additional embedded fields', () => {
    const result = toPublicRecordingContent({ _id: new ObjectId(), mimeType: 'audio/wav', transcriptionStatus: 'completed',
        fullTranscript: [{ speakerId: 'other', text: 'An untimed sentence', words: [], privateNote: 'PRIVATE_NOTE' } as TranscriptionSegment] });
    assert.equal(result.fullTranscript?.[0].text, 'An untimed sentence');
    assert.equal(result.fullTranscript?.[0].start, undefined);
    assert.equal(JSON.stringify(result).includes('PRIVATE_NOTE'), false);
});
