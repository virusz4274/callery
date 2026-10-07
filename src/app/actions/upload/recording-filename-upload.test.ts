import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUploadContactFromFilename } from '@/lib/utils/filename-parser';
import { resolveUploadMimeType } from '@/lib/upload-audio-support';
import { prepareUploadContextWithDependencies, refreshUploadSessionContactWithDependencies } from './prepare-upload-context';
import type { Contact } from '@/lib/db/types';

const savedContact = {
    _id: { toString: () => 'contact-1' }, authSubject: 'owner', name: 'Current name',
    phoneNumbers: ['+919446710273'], googleContactId: 'people/123',
} as unknown as Contact;

function dependencies(lookups: string[]) {
    return {
        resolveUploadMimeType,
        validateAudioMimeType: () => true,
        parseContactFromFilename: parseUploadContactFromFilename,
        extractFileExtension: (filename: string) => filename.split('.').at(-1)!,
        findContactByPhone: async (owner: string, phone: string) => {
            assert.equal(owner, 'owner'); lookups.push(`phone:${phone}`); return savedContact;
        },
        findContactByName: async (owner: string, name: string) => {
            assert.equal(owner, 'owner'); lookups.push(`name:${name}`); return savedContact;
        },
        generateRecordingKey: () => 'immutable/object.m4a',
    };
}

test('shared upload preparation resolves non-Samsung callers using real parsing', async () => {
    const cases = [
        ['Call recording@+919446710273_20260627053508.mp3', 'phone:+919446710273'],
        ['John@+919446710273_20260627053508.m4a', 'phone:+919446710273'],
        ['John-2606270535.mp3', 'name:John'],
        ['CallRecord_20260627-053508_+919446710273.wav', 'phone:+919446710273'],
        ['+919446710273_260627_053508577.m4a', 'phone:+919446710273'],
        ['20260627_053508.088+0530_in_sim2_+919446710273_John.m4a', 'phone:+919446710273'],
    ];
    for (const [fileName, expectedLookup] of cases) {
        const lookups: string[] = [];
        const result = await prepareUploadContextWithDependencies('owner', fileName, undefined, dependencies(lookups));
        assert.ok(!('error' in result), fileName);
        assert.deepEqual(lookups, [expectedLookup], fileName);
        assert.equal(result.contactId, 'contact-1');
        assert.equal(result.contactName, 'Current name');
        assert.equal(result.contactMatchSource, expectedLookup.startsWith('phone:') ? 'phone' : 'name');
        assert.equal(result.recordedAt.getFullYear(), 2026);
        assert.equal(result.r2Key, 'immutable/object.m4a');
        if (fileName.startsWith('20260627')) assert.equal(result.recordedAt.toISOString(), '2026-06-27T00:05:08.088Z');
    }
});

test('unrecognized, invalid and unidentified metadata cannot match a contact', async () => {
    for (const fileName of ['Meeting notes.mp3', 'John-2602300535.mp3', 'Call recording 1234.m4a',
        'Call Unknown_260627_053508.m4a', 'REC20190410134327.mp3',
        'John@not-a-number_20260627053508.m4a']) {
        const lookups: string[] = [];
        const before = Date.now();
        const result = await prepareUploadContextWithDependencies('owner', fileName, undefined, dependencies(lookups));
        assert.ok(!('error' in result));
        assert.deepEqual(lookups, [], fileName);
        assert.equal(result.contactId, null);
        assert.equal(result.contactName, null);
        assert.equal(result.phoneNumber, 'Unknown');
        assert.equal(result.contactMatchSource, undefined);
        if (!fileName.includes('Unknown_')) {
            assert.ok(result.recordedAt.getTime() >= before && result.recordedAt.getTime() <= Date.now());
        }
    }
});

test('unsafe filenames are rejected before MIME and contact processing', async () => {
    for (const fileName of ['../John-2606270535.mp3', 'Call John\u0000_260627_053508.m4a']) {
        const lookups: string[] = [];
        const result = await prepareUploadContextWithDependencies('owner', fileName, undefined, {
            ...dependencies(lookups), resolveUploadMimeType: () => { throw new Error('must reject first'); },
        });
        assert.ok('error' in result);
        assert.match(result.error, /Invalid recording filename/);
        assert.deepEqual(lookups, []);
    }
});

test('filename recognition does not expand the audio upload allowlist', async () => {
    for (const fileName of ['+48123456789_260627_053508577.amr', 'Call recording 1234.aac',
        '20260627_053508.088+0530_in_+919446710273_John.oga']) {
        const lookups: string[] = [];
        const result = await prepareUploadContextWithDependencies('owner', fileName, undefined, dependencies(lookups));
        assert.ok('error' in result);
        assert.match(result.error, /Unsupported file type/);
        assert.deepEqual(lookups, []);
    }
});

test('completion reevaluates a Huawei number without falling back to its filename name', async () => {
    const payload = {
        authSubject: 'owner', contactId: 'old-contact', contactName: 'Old name', contactMatchSource: 'phone' as const,
        phoneNumber: '+919446710273', fileName: 'John@+919446710273_20260627053508.m4a',
        fileSize: 100, mimeType: 'audio/mp4', r2Key: 'immutable/object.m4a',
        recordedAtIso: new Date(2026, 5, 27, 5, 35, 8).toISOString(), standardizedDisplayName: 'Old title',
    };
    const refreshed = await refreshUploadSessionContactWithDependencies('owner', payload, {
        findContactByPhone: async (owner, phone) => {
            assert.equal(owner, 'owner'); assert.equal(phone, '+919446710273'); return savedContact;
        },
        findContactByName: async () => { throw new Error('number must take precedence'); },
        findContactById: async () => { throw new Error('phone identity must be reevaluated'); },
    });
    assert.equal(refreshed.contactId, 'contact-1');
    assert.equal(refreshed.contactName, 'Current name');
    for (const field of ['fileName', 'r2Key', 'recordedAtIso', 'fileSize', 'mimeType'] as const) {
        assert.equal(refreshed[field], payload[field]);
    }
});
