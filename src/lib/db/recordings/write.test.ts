import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureTestEnv } from '@/test/env-test-setup';
import { buildRecordingWriteData } from '@/lib/db/recordings/write';

ensureTestEnv();

test('buildRecordingWriteData stores a normalized phone number shadow field', () => {
    const timestamp = new Date('2026-03-21T10:15:00.000Z');
    const recording = buildRecordingWriteData({
        firebaseUid: 'user-1',
        contactId: null,
        contactName: 'Deon M Sebastian',
        phoneNumber: '+91 93530 96358',
        r2Key: 'recording-key',
        fileName: 'Call recording +91 93530 96358.mp3',
        standardizedDisplayName: 'Deon_M_Sebastian_2026-03-21_15-45-00',
        fileSize: 123,
        mimeType: 'audio/mpeg',
        duration: 60,
        recordedAt: new Date('2026-03-21T10:15:00.000Z'),
        transcriptionStatus: 'pending',
        tags: [],
        isStarred: false,
        isArchived: false,
    }, timestamp);

    assert.equal(recording.normalizedPhoneNumber, '+919353096358');
    assert.equal(recording.createdAt, timestamp);
    assert.equal(recording.updatedAt, timestamp);
});
