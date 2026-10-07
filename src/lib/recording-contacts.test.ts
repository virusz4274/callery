import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId, type Db, type AnyBulkWriteOperation } from 'mongodb';
import { S3Client } from '@aws-sdk/client-s3';
import { parseContactFromFilename } from './utils/filename-parser';
import { buildFileSystemTree } from './file-system-tree';
import { createRecordingContactResolver, buildRecordingContactUpdate } from './db/contacts/resolve-recording-contact';
import { applyCurrentContactNames } from './db/recordings/hydrate-contacts';
import { reconcileRecordingContacts } from './db/contacts/reconcile';
import { Collections, getMongoClient, getMongoDb } from './mongodb';
import { randomUUID } from 'node:crypto';
import { upsertContacts } from './db/contacts/write/upsert-contacts';
import { getRecordingById, getRecordingsByUser } from './db/recordings/read';
import type { Contact, Recording } from './db/types';

export function contactFixture(overrides: Partial<Contact> = {}): Contact {
    return { _id: new ObjectId(), authSubject: 'owner', googleContactId: 'people/1', name: 'Achan', normalizedName: 'achan',
        phoneNumbers: ['+919446710273'], normalizedPhoneNumbers: ['+919446710273'], email: '', firstName: 'Achan', lastName: '',
        totalRecordings: 0, lastRecordingAt: null, createdAt: new Date(0), updatedAt: new Date(0), ...overrides };
}

export function recordingFixture(overrides: Partial<Recording> = {}): Recording {
    return { _id: new ObjectId(), authSubject: 'owner', contactId: null, contactName: 'achan', phoneNumber: 'Unknown',
        normalizedPhoneNumber: '', contactMatchSource: 'name', r2Key: 'immutable/object.m4a',
        fileName: 'Call achan_260627_053508.m4a', standardizedDisplayName: 'achan_2026-06-27_05-35-08',
        fileSize: 100, mimeType: 'audio/mp4', duration: 60, recordedAt: new Date(2026, 5, 27, 5, 35, 8),
        createdAt: new Date(0), updatedAt: new Date(0), transcriptionStatus: 'completed',
        fullTranscript: [{ speakerId: '1', text: 'Preserve this transcript.', words: [] }], tags: [], isStarred: false, isArchived: false,
        ...overrides };
}

test('filename parser accepts prefixes and formatted callers without including timestamps in names', () => {
    for (const prefix of ['Call ', 'Call recording ', 'CALL RECORDING ', 'call ']) {
        const named = parseContactFromFilename(`${prefix}John_Doe_260627_053508.m4a`);
        assert.equal(named.name, 'John Doe');
        assert.equal(named.phoneNumber, null);
        assert.equal(named.date?.getHours(), 5);
        assert.equal(named.date?.getDate(), 27);
        const numeric = parseContactFromFilename(`${prefix}+91_(944)-6710273_260627_131155.mp3`);
        assert.equal(numeric.name, null);
        assert.equal(numeric.phoneNumber, '+91(944)-6710273');
    }
    for (const tail of ['260230_053508', '261327_053508', '260627_253508', '260627_056108']) {
        const result = parseContactFromFilename(`Call achan_${tail}.m4a`);
        assert.equal(result.name, 'achan');
        assert.equal(result.date, null);
    }
    assert.deepEqual(parseContactFromFilename('Meeting notes.mp3'), { name: 'Meeting notes', phoneNumber: null, date: null });
    assert.deepEqual(parseContactFromFilename('Call planning notes.mp3'), { name: 'Call planning notes', phoneNumber: null, date: null });
});

test('name identity survives renames while phone links follow unique current numbers', () => {
    const contact = contactFixture({ name: 'Dad', normalizedName: 'dad', phoneNumbers: ['555'], normalizedPhoneNumbers: ['555'] });
    const resolve = createRecordingContactResolver('owner', [contact]);
    const named = recordingFixture({ contactId: contact._id, phoneNumber: '+919446710273' });
    assert.equal(resolve(named)?._id, contact._id);
    const metadata = buildRecordingContactUpdate(named, resolve(named));
    assert.equal(metadata.contactName, 'Dad');
    assert.equal(metadata.phoneNumber, '555');
    assert.match(metadata.standardizedDisplayName, /^Dad_2026-06-27_05-35-08$/);
    assert.equal(resolve({ ...named, contactMatchSource: 'phone' }), null);
    const replacement = contactFixture({ normalizedPhoneNumbers: ['+919446710273'] });
    assert.equal(createRecordingContactResolver('owner', [contact, replacement])({ ...named, contactMatchSource: 'phone' })?._id, replacement._id);
});

test('duplicates and other accounts never create an arbitrary link', () => {
    const one = contactFixture();
    const duplicate = contactFixture({ googleContactId: 'people/2' });
    const resolve = createRecordingContactResolver('owner', [one, duplicate]);
    assert.equal(resolve(recordingFixture()), null);
    assert.equal(resolve(recordingFixture({ phoneNumber: '+919446710273', contactMatchSource: 'phone' })), null);
    const foreign = contactFixture({ authSubject: 'other' });
    assert.equal(createRecordingContactResolver('owner', [foreign])(recordingFixture()), null);
});

test('tree groups by identity, keeps equal-name contacts separate and preserves IDs through rename', () => {
    const contact = contactFixture();
    const second = recordingFixture({ contactId: contact._id, recordedAt: new Date(2026, 5, 27, 13, 11, 55) });
    const first = recordingFixture({ contactId: contact._id });
    const tree = buildFileSystemTree([first, second]);
    assert.equal(tree.children?.length, 1);
    assert.equal(tree.children?.[0].children?.[0].children?.[0].children?.length, 2);
    const refreshed = applyCurrentContactNames([first, second], [{ ...contact, name: 'Dad' }], 'owner');
    const renamed = buildFileSystemTree(refreshed);
    assert.equal(renamed.children?.[0].id, tree.children?.[0].id);
    assert.equal(renamed.children?.[0].name, 'Dad');
    assert.equal(buildFileSystemTree([first, recordingFixture({ contactId: new ObjectId() })]).children?.length, 2);
    assert.equal(buildFileSystemTree([recordingFixture(), recordingFixture({ contactName: '  ACHAN ' })]).children?.length, 1);
    assert.equal(buildFileSystemTree([recordingFixture({ contactMatchSource: 'phone', contactName: null, phoneNumber: '555-1234' }), recordingFixture({ contactMatchSource: 'phone', contactName: null, phoneNumber: '555 1234' })]).children?.length, 1);
    assert.equal(applyCurrentContactNames([first], [{ ...contact, authSubject: 'other', name: 'Wrong' }], 'owner')[0].contactName, first.contactName);
});

test('reconciliation updates only caller metadata, preserves malformed history and makes zero R2 calls', async t => {
    let storageCalls = 0;
    t.mock.method(S3Client.prototype, 'send', () => { storageCalls++; throw new Error('Contact sync must not touch audio'); });
    const contact = contactFixture({ name: 'Dad' });
    const linked = recordingFixture({ contactId: contact._id, isArchived: true });
    const malformed = recordingFixture({ contactMatchSource: undefined, contactName: 'Call achan_260627_053508', standardizedDisplayName: 'legacy-title' });
    const batches: AnyBulkWriteOperation<Recording>[][] = [];
    const statsWrites: unknown[] = [];
    const db = { collection(name: string) {
        if (name === Collections.RECORDINGS) return {
            find(filter: unknown) { assert.deepEqual(filter, { authSubject: 'owner' }); return [linked, malformed]; },
            async bulkWrite(writes: AnyBulkWriteOperation<Recording>[]) { batches.push(writes); },
            aggregate(pipeline: unknown[]) {
                assert.deepEqual(pipeline[0], { $match: { authSubject: 'owner', contactId: { $ne: null } } });
                return { async toArray() { return [{ _id: contact._id, count: 1, last: linked.recordedAt }]; } };
            },
        };
        assert.equal(name, Collections.CONTACTS);
        return { async bulkWrite(writes: unknown[]) { statsWrites.push(...writes); } };
    } } as unknown as Db;
    await reconcileRecordingContacts('owner', [contact], [], db);
    assert.equal(batches.flat().length, 1);
    const operation = batches[0][0];
    assert.ok('updateOne' in operation);
    assert.deepEqual(operation.updateOne.filter, { _id: linked._id, authSubject: 'owner', updatedAt: linked.updatedAt });
    const update = operation.updateOne.update as { $set: Record<string, unknown> };
    assert.equal(update.$set.contactName, 'Dad');
    assert.deepEqual(Object.keys(update.$set).sort(), ['contactId', 'contactName', 'normalizedPhoneNumber', 'phoneNumber', 'standardizedDisplayName', 'updatedAt']);
    assert.equal(linked.r2Key, 'immutable/object.m4a');
    assert.equal(linked.fullTranscript?.[0].text, 'Preserve this transcript.');
    assert.equal(malformed.standardizedDisplayName, 'legacy-title');
    assert.equal(statsWrites.length, 1);
    assert.equal(storageCalls, 0);
});

test('complete contact snapshots reconcile calls and stats in an isolated database', {
    skip: !process.env.VOSIFT_TEST_MONGODB_URI,
}, async t => {
    const savedUri = process.env.MONGODB_URI;
    const uri = new URL(process.env.VOSIFT_TEST_MONGODB_URI!);
    const databaseName = `cl_${randomUUID().replaceAll('-', '')}`;
    uri.pathname = `/${databaseName}`;
    process.env.MONGODB_URI = uri.toString();
    const client = await getMongoClient();
    const db = await getMongoDb();
    let storageCalls = 0;
    t.mock.method(S3Client.prototype, 'send', () => { storageCalls++; throw new Error('Contact sync must not touch storage'); });
    try {
        assert.equal(db.databaseName, databaseName);
        const named = recordingFixture();
        const archived = recordingFixture({ isArchived: true, recordedAt: new Date(2026, 5, 27, 13, 11, 55) });
        const numbered = recordingFixture({ contactName: null, phoneNumber: '09947555123', normalizedPhoneNumber: '09947555123', contactMatchSource: 'phone' });
        const malformed = recordingFixture({ contactMatchSource: undefined, contactName: 'Call achan_260627_053508', standardizedDisplayName: 'legacy-title' });
        delete malformed.contactMatchSource;
        const foreign = recordingFixture({ authSubject: 'another-owner' });
        const originals = [named, archived, numbered, malformed, foreign];
        await db.collection<Recording>(Collections.RECORDINGS).insertMany(originals);
        const sync = (name: string, phoneNumbers = ['+919446710273']) => upsertContacts('owner', [
            { googleContactId: 'people/1', name, phoneNumbers, email: null },
        ]);
        await sync('Achan');
        const firstContact = await db.collection<Contact>(Collections.CONTACTS).findOne({ authSubject: 'owner' });
        assert.ok(firstContact);
        assert.equal(firstContact.totalRecordings, 2);
        assert.equal(firstContact.lastRecordingAt?.getTime(), archived.recordedAt.getTime());
        assert.equal((await getRecordingById(named._id.toString(), 'owner'))?.contactId?.toString(), firstContact._id.toString());

        await sync('Dad', ['555']);
        const renamed = await getRecordingById(named._id.toString(), 'owner');
        assert.equal(renamed?.contactName, 'Dad');
        assert.equal(renamed?.phoneNumber, '555');
        assert.equal(renamed?.contactId?.toString(), firstContact._id.toString());
        // Read paths take their label from the contact even if the cached snapshot is stale.
        await db.collection<Recording>(Collections.RECORDINGS).updateOne({ _id: named._id }, { $set: { contactName: 'Stale' } });
        assert.equal((await getRecordingsByUser('owner')).find(call => call._id.equals(named._id))?.contactName, 'Dad');
        assert.equal((await getRecordingById(named._id.toString(), 'owner'))?.contactName, 'Dad');
        await sync('Dad', ['555']);

        await upsertContacts('owner', [
            { googleContactId: 'people/1', name: 'Dad', phoneNumbers: ['555'], email: null },
            { googleContactId: 'people/2', name: 'Numbered caller', phoneNumbers: ['09947555123'], email: null },
        ]);
        assert.equal((await getRecordingById(numbered._id.toString(), 'owner'))?.contactName, 'Numbered caller');
        await upsertContacts('owner', [
            { googleContactId: 'people/1', name: 'Dad', phoneNumbers: ['555'], email: null },
            { googleContactId: 'people/2', name: 'Numbered caller', phoneNumbers: ['09947555123'], email: null },
            { googleContactId: 'people/3', name: 'Shared number', phoneNumbers: ['09947555123'], email: null },
        ]);
        assert.equal((await getRecordingById(numbered._id.toString(), 'owner'))?.contactId, null);
        await upsertContacts('owner', []);
        assert.equal((await getRecordingById(named._id.toString(), 'owner'))?.contactId, null);
        assert.equal((await getRecordingById(named._id.toString(), 'owner'))?.contactName, 'Dad');
        assert.equal(await db.collection(Collections.CONTACTS).countDocuments({ authSubject: 'owner' }), 0);

        for (const original of originals) {
            const stored = await db.collection<Recording>(Collections.RECORDINGS).findOne({ _id: original._id });
            assert.ok(stored);
            for (const field of ['r2Key', 'fileName', 'recordedAt', 'createdAt', 'fullTranscript', 'duration', 'fileSize'] as const) {
                assert.deepEqual(stored[field], original[field]);
            }
            if (original === malformed || original === foreign) assert.deepEqual(stored, original);
        }
        assert.equal(storageCalls, 0);
    } finally {
        try {
            if (db.databaseName === databaseName) await db.dropDatabase();
        } finally {
            await client.close();
            if (savedUri === undefined) delete process.env.MONGODB_URI;
            else process.env.MONGODB_URI = savedUri;
        }
    }
});
