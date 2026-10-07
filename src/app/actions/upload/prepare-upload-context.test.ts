import test from 'node:test';
import assert from 'node:assert/strict';

import { parseContactFromFilename } from '@/lib/utils/filename-parser';
import { ensureTestEnv } from '@/test/env-test-setup';
import { prepareUploadContextWithDependencies, resolveUploadContactWithDependencies, refreshUploadSessionContactWithDependencies } from '@/app/actions/upload/prepare-upload-context';

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
                authSubject: 'user-1',
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
            generateRecordingKey: (_authSubject, contactId, phoneNumber) => `${contactId ?? 'none'}:${phoneNumber}`,
        }
    );

    assert.deepEqual(result, {
        contactId: 'contact-1',
        contactName: 'Achan',
        phoneNumber: '+91 93530 96358',
        googleContactId: 'people/123',
        contactMatchSource: 'phone',
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
            generateRecordingKey: (_authSubject, contactId, phoneNumber) => `${contactId ?? 'none'}:${phoneNumber}`,
        }
    );

    assert.deepEqual(result, {
        contactId: null,
        contactName: 'achan',
        phoneNumber: 'Unknown',
        googleContactId: undefined,
        contactMatchSource: 'name',
        extension: 'mp3',
        mimeType: 'audio/mpeg',
        recordedAt,
        standardizedDisplayName: buildExpectedDisplayName('achan', recordedAt),
        r2Key: 'none:Unknown',
    });
});

const achan = {
    _id: { toString: () => 'contact-1' }, authSubject: 'user-1', name: 'Achan',
    phoneNumbers: ['+919446710273'], googleContactId: 'people/123',
} as unknown as import('@/lib/db/types').Contact;

test('reported Call filenames resolve both calls to one contact and preserve the unmatched number', async () => {
    for (const fileName of ['Call achan_260627_053508.m4a', 'Call achan_260627_131155.m4a', 'Call 09947555123_260627_181347.m4a']) {
        const result = await prepareUploadContextWithDependencies('user-1', fileName, 'audio/mp4', {
            resolveUploadMimeType: () => 'audio/mp4', validateAudioMimeType: () => true,
            parseContactFromFilename, extractFileExtension: () => 'm4a',
            findContactByName: async (owner, name) => { assert.equal(owner, 'user-1'); assert.equal(name, 'achan'); return achan; },
            findContactByPhone: async (owner, phone) => { assert.equal(owner, 'user-1'); assert.equal(phone, '09947555123'); return null; },
            generateRecordingKey: (_owner, id) => `stable/${id || 'unknown'}/object.m4a`,
        });
        assert.ok(!('error' in result));
        assert.equal(result.recordedAt.getFullYear(), 2026);
        assert.equal(result.recordedAt.getMonth(), 5);
        assert.equal(result.recordedAt.getDate(), 27);
        assert.equal(result.contactId, fileName.includes('achan') ? 'contact-1' : null);
        assert.equal(result.contactName, fileName.includes('achan') ? 'Achan' : null);
        assert.equal(result.phoneNumber, fileName.includes('achan') ? '+919446710273' : '09947555123');
        assert.equal(result.contactMatchSource, fileName.includes('achan') ? 'name' : 'phone');
    }
});

test('upload completion retains name-matched identity through a rename and phone change', async () => {
    const caller = parseContactFromFilename('Call achan_260627_053508.m4a');
    const current = { ...achan, name: 'Dad', phoneNumbers: ['+919999999999'] };
    const result = await resolveUploadContactWithDependencies('user-1', caller, {
        findContactById: async (owner, id) => { assert.equal(owner, 'user-1'); assert.equal(id, 'contact-1'); return current; },
        findContactByName: async () => { throw new Error('renamed identity must not be looked up by its old name'); },
        findContactByPhone: async () => { throw new Error('name matches must not use a synthesized phone'); },
    }, { contactId: 'contact-1', contactMatchSource: 'name' });
    assert.equal(result.contactId, 'contact-1');
    assert.equal(result.contactName, 'Dad');
    assert.equal(result.phoneNumber, '+919999999999');
    assert.equal(caller.date?.getHours(), 5);
});

test('upload completion reevaluates phone matches and handles a deleted contact', async () => {
    const result = await resolveUploadContactWithDependencies('user-1', parseContactFromFilename('Call 09947555123_260627_181347.m4a'), {
        findContactById: async () => { throw new Error('phone matching must be reevaluated'); },
        findContactByName: async () => { throw new Error('numeric caller must not be looked up by name'); },
        findContactByPhone: async () => null,
    }, { contactId: 'contact-1', contactMatchSource: 'phone' });
    assert.equal(result.contactId, null);
    assert.equal(result.phoneNumber, '09947555123');
});

test('refreshing a signed upload changes its caller metadata without changing its object or timestamp', async () => {
    const payload = {
        authSubject: 'user-1', contactId: 'contact-1', contactName: 'Achan', contactMatchSource: 'name' as const,
        phoneNumber: '+919446710273', fileName: 'Call achan_260627_053508.m4a',
        fileSize: 100, mimeType: 'audio/mp4', r2Key: 'user-1/contact-1/2026/06/original-object.m4a',
        recordedAtIso: new Date(2026, 5, 27, 5, 35, 8).toISOString(), standardizedDisplayName: 'Old title',
    };
    const current = { ...achan, name: 'Dad' };
    const refreshed = await refreshUploadSessionContactWithDependencies('user-1', payload, {
        findContactById: async () => current,
        findContactByName: async () => null,
        findContactByPhone: async () => null,
    });
    assert.equal(refreshed.contactName, 'Dad');
    assert.equal(refreshed.standardizedDisplayName, 'Dad_2026-06-27_05-35-08');
    for (const field of ['r2Key', 'recordedAtIso', 'fileName', 'fileSize', 'mimeType', 'authSubject'] as const) {
        assert.equal(refreshed[field], payload[field]);
    }
    assert.equal(payload.contactName, 'Achan');
});
