import assert from 'node:assert/strict';
import test from 'node:test';
import { transcriptDownloadName, transcriptPlainText } from './transcript-export';

test('transcript text keeps speaker labels, timestamps, Unicode and every loaded segment', () => {
    const segments = [
        { speakerId: 'provider-b', text: 'Hello\nമലയാളം', start: 0.9 },
        { speakerId: 'provider-a', text: 'Reply.', start: 3661 },
        { speakerId: 'provider-b', text: 'Final detail.', start: 75 },
        { speakerId: '', text: 'Untimed participant.' },
    ];
    assert.equal(transcriptPlainText(segments), '[00:00] Speaker 1\nHello\nമലയാളം\n\n[61:01] Speaker 2\nReply.\n\n[01:15] Speaker 1\nFinal detail.\n\nUnknown speaker\nUntimed participant.');
});

test('transliteration export follows the selected script and falls back to original text', () => {
    const segments = [
        { speakerId: 'a', text: 'മലയാളം', transliteratedText: 'malayalam', start: 10 },
        { speakerId: 'b', text: 'Original fallback', transliteratedText: '', start: 20 },
    ];
    assert.equal(transcriptPlainText(segments, true), '[00:10] Speaker 1\nmalayalam\n\n[00:20] Speaker 2\nOriginal fallback');
    assert.match(transcriptPlainText(segments), /മലയാളം/);
});

test('empty transcripts and invalid times never export invented timestamps', () => {
    assert.equal(transcriptPlainText([]), '');
    assert.equal(transcriptPlainText([{ speakerId: 'a', text: '   ' }]), '');
    for (const start of [undefined, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.equal(transcriptPlainText([{ speakerId: 'a', text: 'No valid time', start }]), 'Speaker 1\nNo valid time');
    }
});

test('download filenames cannot introduce paths or control characters', () => {
    assert.equal(transcriptDownloadName('recording-one'), 'transcript-recording-one.txt');
    assert.equal(transcriptDownloadName('recording-one', true), 'transcript-recording-one-transliteration.txt');
    const name = transcriptDownloadName('../private/\r\n<script>');
    assert.doesNotMatch(name, /[.\/\\\r\n<>](?!txt$)/);
    assert.ok(transcriptDownloadName('a'.repeat(200)).length < 100);
});
