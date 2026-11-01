import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBilledDuration, isKnownAudioDuration } from './billing';

test('billable media must have a finite positive duration before paid provider submission', () => {
    for (const duration of [0, -1, NaN, Infinity, -Infinity]) assert.equal(isKnownAudioDuration(duration), false);
    for (const duration of [0.1, 1, 15, 15.1, 3600]) {
        assert.equal(isKnownAudioDuration(duration), true);
        assert.ok(calculateBilledDuration(duration) >= duration);
    }
    assert.equal(calculateBilledDuration(0.1), 15);
    assert.equal(calculateBilledDuration(15), 15);
    assert.equal(calculateBilledDuration(15.1), 30);
});
