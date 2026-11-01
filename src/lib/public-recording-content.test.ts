import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import type { TranscriptionSegment } from './db/types';
import { toPublicRecordingContent } from './public-recording-content';

function recording(fullTranscript: TranscriptionSegment[]) {
    return {
        _id: new ObjectId('507f1f77bcf86cd799439011'), duration: 60, mimeType: 'audio/mpeg',
        transcriptionStatus: 'completed' as const, transcriptionProvider: 'soniox' as const,
        transcriptionModel: 'soniox-test', fullTranscript, summary: 'FULL_CALL_SUMMARY_SECRET',
        authSubject: 'PRIVATE_OWNER', contactId: new ObjectId(), r2Key: 'PRIVATE_STORAGE_KEY',
        fileName: 'PRIVATE_FILENAME', bulkImportId: 'PRIVATE_IMPORT', transcriptionBatchId: 'PRIVATE_BATCH',
        transcriptionCostMultiplier: 99, tags: ['PRIVATE_TAG'], isStarred: true, isArchived: true,
    };
}

function segment(overrides: Partial<TranscriptionSegment> = {}): TranscriptionSegment {
    return { speakerId: 'Speaker 1', text: 'Permitted transcript', start: 12, end: 18, words: [], ...overrides };
}

test('serialized clipped shares contain permitted words and no outside text, summary, or private fields', () => {
    const source = recording([
        segment({ text: 'OUTSIDE_BEFORE_SECRET', start: 0, end: 9 }),
        segment({
            text: 'OUTSIDE_BOUNDARY_SECRET keep these OUTSIDE_AFTER_SECRET', start: 8, end: 23,
            transliteratedText: 'OUTSIDE_TRANSLITERATION_SECRET',
            words: [
                { text: 'OUTSIDE_BOUNDARY_SECRET', start: 8, end: 11 },
                { text: 'keep', start: 12, end: 14 }, { text: 'these', start: 15, end: 17 },
                { text: 'OUTSIDE_AFTER_SECRET', start: 19, end: 23 },
            ],
        }),
        segment({ text: 'OUTSIDE_AFTER_SEGMENT_SECRET', start: 21, end: 30 }),
    ]);
    const projected = toPublicRecordingContent(source, { clipStartSeconds: 10, clipEndSeconds: 20 });
    assert.deepEqual(projected.fullTranscript, [{ speakerId: 'Speaker 1', text: 'keep these', start: 12, end: 17 }]);
    const payload = JSON.stringify(projected);
    assert.match(payload, /keep these/);
    for (const privateText of ['OUTSIDE_', 'FULL_CALL_SUMMARY_SECRET', 'PRIVATE_', 'words', 'authSubject', 'contactId', 'r2Key', 'fileName', 'bulkImportId', 'transcriptionBatchId', 'transcriptionCostMultiplier', 'tags', 'isStarred', 'isArchived', 'playbackUrl']) {
        assert.equal(payload.includes(privateText), false, privateText);
    }
    assert.equal('summary' in projected, false);
});

test('fully contained timed segments preserve text and transliteration without exporting raw words', () => {
    const source = recording([segment({
        transliteratedText: 'Permitted transliteration',
        words: [{ text: 'Permitted', start: 12, end: 14 }, { text: 'transcript', start: 14, end: 18 }],
    })]);
    const projected = toPublicRecordingContent(source, { clipStartSeconds: 10, clipEndSeconds: 20 });
    assert.deepEqual(projected.fullTranscript, [{ speakerId: 'Speaker 1', text: 'Permitted transcript', start: 12, end: 18, transliteratedText: 'Permitted transliteration' }]);
    assert.equal('words' in projected.fullTranscript![0], false);
});

test('partial segments without reliable words and unlocatable text are omitted', () => {
    const source = recording([
        segment({ text: 'PARTIAL_SECRET', start: 5, end: 15 }),
        segment({ text: 'UNTIMED_SECRET', start: undefined, end: undefined }),
        segment({ text: 'MISSING_END_SECRET', start: 12, end: undefined }),
        segment({ text: 'REVERSED_SECRET', start: 18, end: 12 }),
        segment({ text: 'NONFINITE_SECRET', start: Number.NaN, end: 18 }),
        segment({ text: 'ZERO_LENGTH_SECRET', start: 12, end: 12 }),
        segment(),
    ]);
    const projected = toPublicRecordingContent(source, { clipStartSeconds: 10, clipEndSeconds: 20 });
    assert.equal(projected.fullTranscript?.length, 1);
    assert.equal(JSON.stringify(projected).includes('_SECRET'), false);
});

test('boundary words require complete valid timing and cannot cross or merely touch the clip', () => {
    const source = recording([segment({
        text: 'ORIGINAL_BOUNDARY_SECRET', start: 0, end: 60,
        words: [
            { text: 'TOUCH_START_SECRET', start: 9, end: 10 },
            { text: 'TOUCH_END_SECRET', start: 20, end: 21 },
            { text: 'CROSS_START_SECRET', start: 9, end: 11 },
            { text: 'CROSS_END_SECRET', start: 19, end: 21 },
            { text: 'MISSING_END_SECRET', start: 12 }, { text: 'MISSING_START_SECRET', end: 14 },
            { text: 'REVERSED_SECRET', start: 15, end: 14 }, { text: 'ZERO_SECRET', start: 15, end: 15 },
            { text: 'NEGATIVE_SECRET', start: -1, end: 13 }, { text: 'INFINITE_SECRET', start: 12, end: Infinity },
            { text: 'exact', start: 10, end: 12 }, { text: 'range', start: 18, end: 20 },
        ],
    })]);
    const projected = toPublicRecordingContent(source, { clipStartSeconds: 10, clipEndSeconds: 20 });
    assert.deepEqual(projected.fullTranscript, [{ speakerId: 'Speaker 1', text: 'exact range', start: 10, end: 20 }]);
    assert.equal(JSON.stringify(projected).includes('_SECRET'), false);
});

test('contradictory segment timing cannot disclose the original text or transliteration', () => {
    const source = recording([segment({
        text: 'CONTRADICTORY_TEXT_SECRET', transliteratedText: 'CONTRADICTORY_TRANSLITERATION_SECRET',
        words: [{ text: 'OUTSIDE_SECRET', start: 2, end: 5 }, { text: 'inside', start: 12, end: 14 }],
    })]);
    const projected = toPublicRecordingContent(source, { clipStartSeconds: 10, clipEndSeconds: 20 });
    assert.deepEqual(projected.fullTranscript, [{ speakerId: 'Speaker 1', text: 'inside', start: 12, end: 14 }]);
    assert.equal(JSON.stringify(projected).includes('_SECRET'), false);
});

test('independently timed words can preserve text when segment timing is absent', () => {
    const source = recording([segment({
        text: 'UNLOCATABLE_ORIGINAL_SECRET', start: undefined, end: undefined,
        words: [{ text: 'reliable', start: 12, end: 14 }, { text: 'UNLOCATABLE_WORD_SECRET' }],
    })]);
    const projected = toPublicRecordingContent(source, { clipStartSeconds: 10, clipEndSeconds: 20 });
    assert.deepEqual(projected.fullTranscript, [{ speakerId: 'Speaker 1', text: 'reliable', start: 12, end: 14 }]);
    assert.equal(JSON.stringify(projected).includes('_SECRET'), false);
});

test('valid full shares retain complete transcript, transliteration, and summary without internal fields', () => {
    const source = recording([segment({ start: undefined, end: undefined, transliteratedText: 'Complete transliteration' })]);
    const projected = toPublicRecordingContent(source);
    assert.equal(projected.fullTranscript?.[0].text, 'Permitted transcript');
    assert.equal(projected.fullTranscript?.[0].transliteratedText, 'Complete transliteration');
    assert.equal(projected.summary, source.summary);
    assert.equal(JSON.stringify(projected).includes('PRIVATE_'), false);
    assert.equal('words' in projected.fullTranscript![0], false);
});

test('one-sided clips constrain content and invalid bounds never produce full content', () => {
    const source = recording([segment({ text: 'Beginning', start: 0, end: 8 }), segment({ text: 'Ending', start: 45, end: 55 })]);
    assert.equal(toPublicRecordingContent(source, { clipEndSeconds: 10 }).fullTranscript?.[0].text, 'Beginning');
    assert.equal(toPublicRecordingContent(source, { clipStartSeconds: 40 }).fullTranscript?.[0].text, 'Ending');
    assert.equal('summary' in toPublicRecordingContent(source, { clipStartSeconds: 0 }), false);
    for (const bounds of [{ clipStartSeconds: -1 }, { clipEndSeconds: 0 }, { clipEndSeconds: 61 }, { clipStartSeconds: 60 }, { clipStartSeconds: 20, clipEndSeconds: 10 }]) {
        assert.throws(() => toPublicRecordingContent(source, bounds), /Clip/);
    }
    assert.throws(() => toPublicRecordingContent({ ...source, duration: 0 }, { clipStartSeconds: 0 }), /recording duration/);
});

test('public projection does not copy unknown fields embedded in transcript entries', () => {
    const unsafeSegment = { ...segment(), privateNote: 'PRIVATE_SEGMENT_SECRET' } as TranscriptionSegment;
    const source = recording([unsafeSegment]);
    const projected = toPublicRecordingContent(source);
    assert.equal(JSON.stringify(projected).includes('PRIVATE_'), false);
});
