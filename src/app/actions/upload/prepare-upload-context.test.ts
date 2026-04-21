import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureTestEnv } from '@/test/env-test-setup';
import { prepareUploadContextWithDependencies } from '@/app/actions/upload/prepare-upload-context';

ensureTestEnv();

function buildExpectedDisplayName(contactName: string, recordedAt: Date): string {
    const displayDate = recordedAt.toISOString().split('T')[0];
    const displayTime = recordedAt.toTimeString().split(' ')[0].replace(/:/g, '-');
    return `${contactName}_${displayDate}_${displayTime}`;
}

test('prepareUploadContext links uploads to an existing Google contact by phone', async () => {
    const recordedAt = new Date('2026-03-21T10:15:00.000Z');
    const result = await prepareUploadContextWithDependencies(
        'user-1',
        'Call recording +91 93530 96358_260321_101500.mp3',
        'audio/mpeg',
        {
            resolveUploadMimeType: () => 'audio/mpeg',
            validateAudioMimeType: () => true,
            parseContactFromFilename: () => ({
                name: null,
                phoneNumber: '+91 93530 96358',
                date: recordedAt,
            }),
            extractFileExtension: () => 'mp3',
            findContactByPhone: async () => ({
                _id: { toString: () => 'contact-1' },
                firebaseUid: 'user-1',
                googleContactId: 'people/123',
                name: 'Achan',
                normalizedName: 'achan',
                phoneNumbers: ['+91 93530 96358'],
                normalizedPhoneNumbers: ['+919353096358'],
                email: '',
                firstName: 'Achan',
                lastName: '',
                createdAt: new Date(),
                updatedAt: new Date(),
                totalRecordings: 0,
                lastRecordingAt: null,
            }) as never,
            findContactByName: async () => {
                throw new Error('should not match by name');
            },
            generateRecordingKey: (_firebaseUid, contactId, phoneNumber) => `${contactId ?? 'none'}:${phoneNumber}`,
        }
    );

    assert.deepEqual(result, {
        contactId: 'contact-1',
        contactName: 'Achan',
        phoneNumber: '+91 93530 96358',
        googleContactId: 'people/123',
        extension: 'mp3',
        mimeType: 'audio/mpeg',
        recordedAt,
        standardizedDisplayName: buildExpectedDisplayName('Achan', recordedAt),
        r2Key: 'contact-1:+91 93530 96358',
    });
});

test('prepareUploadContext leaves uploads unlinked when no Google contact matches', async () => {
    const recordedAt = new Date('2026-03-21T10:15:00.000Z');
    const result = await prepareUploadContextWithDependencies(
        'user-1',
        'Call recording achan_260321_101500.mp3',
        'audio/mpeg',
        {
            resolveUploadMimeType: () => 'audio/mpeg',
            validateAudioMimeType: () => true,
            parseContactFromFilename: () => ({
                name: 'achan',
                phoneNumber: null,
                date: recordedAt,
            }),
            extractFileExtension: () => 'mp3',
            findContactByPhone: async () => null,
            findContactByName: async () => null,
            generateRecordingKey: (_firebaseUid, contactId, phoneNumber) => `${contactId ?? 'none'}:${phoneNumber}`,
        }
    );

    assert.deepEqual(result, {
        contactId: null,
        contactName: 'achan',
        phoneNumber: 'Unknown',
        googleContactId: undefined,
        extension: 'mp3',
        mimeType: 'audio/mpeg',
        recordedAt,
        standardizedDisplayName: buildExpectedDisplayName('achan', recordedAt),
        r2Key: 'none:Unknown',
    });
});
