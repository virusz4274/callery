import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { Collections, getMongoClient, getMongoDb } from '@/lib/mongodb';
import { createCoreIndexes } from '@/lib/db/init/indexes';
import { seedPlans, seedSystemSettings } from '@/lib/db/init/seed';
import { createAuth } from '@/lib/auth/server';
import { updateSystemSettingsDocument } from '@/lib/db/system-settings';
import { resolveTranscriptionMultipliers } from '@/lib/transcription-multipliers';
import type { Contact, SystemSettings } from '@/lib/db/types';
import { countContactsByUser, getContactsByUser } from './read';

test('directory searches count all matches and multiplier edits preserve settings', {
    skip: !process.env.VOSIFT_TEST_MONGODB_URI,
}, async t => {
    const savedUri = process.env.MONGODB_URI;
    const savedEmail = process.env.EMAIL_PROVIDER;
    const uri = new URL(process.env.VOSIFT_TEST_MONGODB_URI!);
    const databaseName = `vd_${randomUUID().replaceAll('-', '')}`;
    uri.pathname = `/${databaseName}`;
    process.env.MONGODB_URI = uri.toString();
    process.env.EMAIL_PROVIDER = 'none';
    const client = await getMongoClient();
    const db = await getMongoDb();
    assert.equal(db.databaseName, databaseName);

    try {
        await createCoreIndexes(db, Collections);
        await seedPlans(db, Collections);
        await seedSystemSettings(db, Collections);
        const auth = createAuth(db);
        const signup = await auth.handler(new Request(`${process.env.NEXT_PUBLIC_APP_URL}/api/auth/sign-up/email`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: process.env.NEXT_PUBLIC_APP_URL! },
            body: JSON.stringify({ name: 'Directory Fixture', email: 'directory@example.com', password: 'DirectoryFixturePassword123!' }),
        }));
        assert.equal(signup.status, 200, await signup.clone().text());
        const { user, token } = await signup.json();
        const authSubject = user.id as string;
        const now = new Date();
        const contacts: Contact[] = Array.from({ length: 45 }, (_, index) => ({
            _id: new ObjectId(), authSubject, googleContactId: `people/${index}`,
            name: index >= 20 ? `Zebra Needle ${index}` : `Contact ${String(index).padStart(2, '0')}`,
            normalizedName: index >= 20 ? `zebra needle ${index}` : `contact ${String(index).padStart(2, '0')}`,
            firstName: 'Contact', lastName: String(index), phoneNumbers: [], normalizedPhoneNumbers: [],
            email: '', createdAt: now, updatedAt: now, totalRecordings: 0, lastRecordingAt: null,
        }));
        contacts[0].phoneNumbers = ['+44 (20) 555-1234'];
        contacts[1].company = 'Acme [R&D]';
        contacts[2].jobTitle = 'Lead Engineer';
        contacts[3].name = 'Regex .* person';
        await db.collection<Contact>(Collections.CONTACTS).insertMany([
            ...contacts,
            { ...contacts[20], _id: new ObjectId(), authSubject: 'other-user', company: 'Acme [R&D]' },
        ]);

        await t.test('totals stay independent of page size; searches include contacts beyond the first page', async () => {
            assert.equal(await countContactsByUser(authSubject), 45);
            const initial = await getContactsByUser(authSubject, { limit: 20 });
            assert.equal(initial.length, 20);
            assert.ok(initial.every(contact => !contact.name.includes('Needle')));
            assert.equal(await countContactsByUser(authSubject, '  NEEDLE  '), 25);
            const first = await getContactsByUser(authSubject, { limit: 20, search: 'needle' });
            const second = await getContactsByUser(authSubject, { limit: 20, skip: 20, search: 'needle' });
            assert.equal(first.length, 20);
            assert.equal(second.length, 5);
            assert.equal(new Set([...first, ...second].map(contact => contact._id.toString())).size, 25);
            assert.equal(await countContactsByUser('other-user', 'needle'), 1);
            assert.equal(await countContactsByUser(authSubject, 'missing'), 0);
            assert.deepEqual(await getContactsByUser(authSubject, { search: 'missing' }), []);
            assert.equal(await countContactsByUser(authSubject, '   '), 45);
        });

        await t.test('literal searches cover phone numbers, companies, job titles and regex punctuation', async () => {
            for (const search of ['+44 (20)', '[r&d]', 'lead ENGINEER', '.*']) {
                const matches = await getContactsByUser(authSubject, { search });
                assert.equal(matches.length, 1, search);
                assert.equal(await countContactsByUser(authSubject, search), 1, search);
                assert.equal(matches[0].authSubject, authSubject);
            }
        });

        await t.test('the authenticated API applies search to both listing and counts', async () => {
            const { GET } = await import('@/app/api/contacts/route');
            for (const [skip, length] of [[0, 20], [20, 5]]) {
                const request = new NextRequest(`${process.env.NEXT_PUBLIC_APP_URL}/api/contacts?limit=20&skip=${skip}&search=needle`, {
                    headers: { authorization: `Bearer ${token}` },
                });
                const response = await GET(request);
                assert.equal(response.status, 200);
                const body = await response.json();
                assert.equal(body.totalCount, 25);
                assert.equal(body.contacts.length, length);
                assert.ok(body.contacts.every((contact: { authSubject: string }) => contact.authSubject === authSubject));
            }
            const unauthorized = await GET(new NextRequest(`${process.env.NEXT_PUBLIC_APP_URL}/api/contacts`));
            assert.equal(unauthorized.status, 401);
            const invalid = await GET(new NextRequest(`${process.env.NEXT_PUBLIC_APP_URL}/api/contacts?search=${'a'.repeat(201)}`, {
                headers: { authorization: `Bearer ${token}` },
            }));
            assert.equal(invalid.status, 400);
        });

        await t.test('all four multiplier edits persist without replacing unrelated settings', async () => {
            const before = await db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).findOne({});
            assert.ok(before);
            const multipliers = { soniox: 2, elevenlabs: 4, gemini: 0.25, openai_compat: 0.05 };
            await updateSystemSettingsDocument({ transcriptionMultipliers: multipliers });
            const after = await db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).findOne({});
            assert.ok(after);
            assert.deepEqual(after.transcriptionMultipliers, multipliers);
            assert.equal(after.allowSignups, before.allowSignups);
            assert.equal(after.maintenanceMode, before.maintenanceMode);
            assert.ok(after.defaultPlanId.equals(before.defaultPlanId));
            await updateSystemSettingsDocument({ transcriptionMultipliers: { soniox: 3, elevenlabs: 4 } });
            const patched = await db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).findOne({});
            assert.deepEqual(resolveTranscriptionMultipliers(multipliers, patched?.transcriptionMultipliers), { ...multipliers, soniox: 3 });
        });
    } finally {
        assert.equal(db.databaseName, databaseName);
        try {
            await db.dropDatabase();
        } finally {
            await client.close();
            if (savedUri === undefined) delete process.env.MONGODB_URI;
            else process.env.MONGODB_URI = savedUri;
            if (savedEmail === undefined) delete process.env.EMAIL_PROVIDER;
            else process.env.EMAIL_PROVIDER = savedEmail;
        }
    }
});
