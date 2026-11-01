import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient, ObjectId } from 'mongodb';
import { SignJWT } from 'jose';
import { Collections } from './mongodb';

// Use the separately started API fixture only. The explicit signing secret must
// match that fixture's SHARE_LINK_SECRET; no application configuration is read.
test('running public share HTML and RSC responses enforce clipped-content privacy', {
    skip: !process.env.VOSIFT_TEST_API_BASE_URL || !process.env.VOSIFT_TEST_API_MONGODB_URI || !process.env.VOSIFT_TEST_SHARE_SECRET,
}, async () => {
    const base = new URL(process.env.VOSIFT_TEST_API_BASE_URL!);
    const uri = new URL(process.env.VOSIFT_TEST_API_MONGODB_URI!);
    assert.ok(['127.0.0.1', 'localhost'].includes(base.hostname));
    assert.ok(['127.0.0.1', 'localhost'].includes(uri.hostname));
    assert.ok(uri.pathname.startsWith('/vosift_api_'));
    const client = new MongoClient(uri.toString());
    const db = client.db();
    const id = new ObjectId();
    const nonce = randomUUID().replaceAll('-', '');
    const outside = `OUTSIDE_CLIP_${nonce}`;
    const inside = `PERMITTED_CLIP_${nonce}`;
    const summary = `FULL_SUMMARY_${nonce}`;
    const privateOwner = `PRIVATE_OWNER_${nonce}`;
    const privateKey = `PRIVATE_STORAGE_${nonce}`;
    const privateFilename = `PRIVATE_FILENAME_${nonce}`;
    const privateImport = `PRIVATE_IMPORT_${nonce}`;
    const sign = (bounds: Record<string, unknown> = {}) => new SignJWT({ recordingId: id.toString(), ...bounds })
        .setProtectedHeader({ alg: 'HS256' }).setAudience('vosift:share').setIssuedAt().setExpirationTime('1h')
        .sign(new TextEncoder().encode(process.env.VOSIFT_TEST_SHARE_SECRET!));
    const response = async (token: string, rsc: boolean) => {
        const result = await fetch(new URL(`/s/${token}`, base), {
            headers: rsc ? { RSC: '1' } : {}, redirect: 'manual',
        });
        assert.equal(result.status, 200);
        assert.match(result.headers.get('content-type') || '', rsc ? /text\/x-component/ : /text\/html/);
        return result.text();
    };
    try {
        const settings = await db.collection(Collections.SYSTEM_SETTINGS).findOne({});
        assert.notEqual(settings?.team?.enabled, true, 'This test needs a personal-account fixture deployment.');
        const now = new Date();
        await db.collection(Collections.RECORDINGS).insertOne({
            _id: id, authSubject: privateOwner, contactId: null, contactName: 'Public share fixture',
            phoneNumber: '', normalizedPhoneNumber: '', fileName: privateFilename, r2Key: privateKey,
            standardizedDisplayName: privateFilename, fileSize: 100, mimeType: 'audio/wav', duration: 60,
            recordedAt: now, createdAt: now, updatedAt: now, bulkImportId: privateImport,
            transcriptionStatus: 'completed', summary, tags: [], isArchived: false, isStarred: false,
            fullTranscript: [{
                speakerId: 'Speaker 1', text: `${outside} ${inside}`, transliteratedText: outside,
                start: 0, end: 30, words: [
                    { text: outside, start: 0, end: 8 }, { text: inside, start: 12, end: 15 },
                ],
            }],
        });
        const clippedToken = await sign({ clipStartSeconds: 10, clipEndSeconds: 20 });
        for (const rsc of [false, true]) {
            const body = await response(clippedToken, rsc);
            assert.ok(body.includes(inside), 'The permitted words must remain in the response.');
            for (const forbidden of [outside, summary, privateOwner, privateKey, privateFilename, privateImport, 'X-Amz-Signature']) {
                assert.equal(body.includes(forbidden), false, `Public ${rsc ? 'RSC' : 'HTML'} disclosed ${forbidden}.`);
            }
        }
        const fullToken = await sign();
        for (const rsc of [false, true]) {
            const body = await response(fullToken, rsc);
            assert.ok(body.includes(outside));
            assert.ok(body.includes(inside));
            assert.ok(body.includes(summary));
            assert.ok(body.includes('X-Amz-Signature'), 'Full shares must retain signed audio playback.');
        }
        const malformed = await sign({ clipStartSeconds: '10' });
        for (const rsc of [false, true]) {
            const body = await response(malformed, rsc);
            assert.equal(body.includes(inside), false);
            assert.equal(body.includes(outside), false);
            assert.equal(body.includes(summary), false);
            assert.ok(body.includes('Link Expired or Invalid'));
        }
    } finally {
        await db.collection(Collections.RECORDINGS).deleteOne({ _id: id, authSubject: privateOwner });
        await client.close();
    }
});
