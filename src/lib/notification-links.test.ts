import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildRecordingNotificationLink,
    normalizeNotificationLink,
} from '@/lib/notification-links';

test('builds explicit recordings deep links for notification targets', () => {
    assert.equal(
        buildRecordingNotificationLink('recording-123'),
        '/recordings?id=recording-123'
    );
});

test('keeps current recording deep links unchanged', () => {
    assert.equal(
        normalizeNotificationLink('/recordings?id=recording-123'),
        '/recordings?id=recording-123'
    );
});

test('keeps safe relative notification links unchanged', () => {
    assert.equal(
        normalizeNotificationLink('/settings?tab=notifications'),
        '/settings?tab=notifications'
    );
});

test('rejects external notification links', () => {
    assert.equal(
        normalizeNotificationLink('https://example.com/recordings?id=recording-123'),
        undefined
    );
});
