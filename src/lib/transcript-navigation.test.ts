import assert from 'node:assert/strict';
import test from 'node:test';
import { activeTranscriptSegment, findTranscriptMatches, playbackPositionKey, validPlaybackTime } from './transcript-navigation';

test('timing respects gaps, missing times, overlaps and actual ends', () => {
    const segments = [{ text: 'one', start: 0, end: 3 }, { text: 'no time' }, { text: 'two', start: 5 }, { text: 'three', start: 8, end: 10 }];
    assert.equal(activeTranscriptSegment(segments, 0), 0);
    assert.equal(activeTranscriptSegment(segments, 4), -1);
    assert.equal(activeTranscriptSegment(segments, 7), 2);
    assert.equal(activeTranscriptSegment(segments, 8), 3);
    assert.equal(activeTranscriptSegment(segments, 11), -1);
    assert.equal(activeTranscriptSegment([{ text: '', start: 0, end: 8 }, { text: '', start: 3, end: 6 }], 4), 1);
    assert.equal(validPlaybackTime(Number.NaN), undefined);
    assert.equal(validPlaybackTime(-1), undefined);
});

test('find handles Unicode, literal regex characters, repeated matches and script selection', () => {
    const segments = [{ text: 'Hello hello [price]. മലയാളം', transliteratedText: 'hello malayalam' }];
    assert.deepEqual(findTranscriptMatches(segments, 'hello').map(match => match.start), [0, 6]);
    assert.equal(findTranscriptMatches(segments, '[price]').length, 1);
    assert.equal(findTranscriptMatches(segments, 'മലയാളം').length, 1);
    assert.equal(findTranscriptMatches(segments, 'malayalam', true).length, 1);
    assert.equal(findTranscriptMatches(segments, '   ').length, 0);
});

test('playback history is scoped by account and recording without ambiguous keys', () => {
    assert.notEqual(playbackPositionKey('a', 'call'), playbackPositionKey('b', 'call'));
    assert.notEqual(playbackPositionKey('a:b', 'c'), playbackPositionKey('a', 'b:c'));
});
