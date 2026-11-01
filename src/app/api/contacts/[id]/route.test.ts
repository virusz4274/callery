import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { createGetContactHandler } from './handler';
import type { Contact } from '@/lib/db/types';

const id = new ObjectId();
const contact: Contact = { _id: id, authSubject: 'owner', name: 'Fictional Contact', phoneNumbers: ['+12025550123'],
    normalizedName: 'fictional contact', normalizedPhoneNumbers: ['+12025550123'], firstName: 'Fictional', lastName: 'Contact', lastRecordingAt: null,
    email: '', googleContactId: 'people/fictional', createdAt: new Date('2026-10-23T00:00:00Z'), updatedAt: new Date('2026-10-23T00:00:00Z'), totalRecordings: 0 };
const request = new NextRequest(`https://app.example.com/api/contacts/${id}`);
const context = (value = id.toString()) => ({ params: Promise.resolve({ id: value }) });

test('contact details use one owner-scoped lookup and serialize the existing response shape', async () => {
    const calls: unknown[] = [];
    const GET = createGetContactHandler({ getUserFromRequest: async () => 'owner', findContactById: async (subject, contactId) => {
        calls.push([subject, contactId]); return contact;
    } });
    const response = await GET(request, context());
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.contact.id, id.toString());
    assert.equal(body.contact.createdAt, '2026-10-23T00:00:00.000Z');
    assert.deepEqual(calls, [['owner', id.toString()]]);
});

test('contact details authenticate before looking up or validating IDs', async () => {
    const GET = createGetContactHandler({ getUserFromRequest: async () => null, findContactById: async () => { throw new Error('must not query'); } });
    assert.equal((await GET(request, context('bad-id'))).status, 401);
});

test('contact details reject malformed IDs without a database lookup', async () => {
    const GET = createGetContactHandler({ getUserFromRequest: async () => 'owner', findContactById: async () => { throw new Error('must not query'); } });
    assert.equal((await GET(request, context('bad-id'))).status, 400);
});

test('a missing contact and a contact owned by a teammate have the same response', async () => {
    for (const found of [null, { ...contact, authSubject: 'teammate' }]) {
        const GET = createGetContactHandler({ getUserFromRequest: async () => 'owner', findContactById: async () => found });
        const response = await GET(request, context());
        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { error: 'Contact not found' });
    }
});
