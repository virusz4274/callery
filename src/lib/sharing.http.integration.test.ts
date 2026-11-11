import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient, ObjectId } from 'mongodb';
import { SignJWT } from 'jose';
import { Collections } from './mongodb';
import { RECORDING_SHARES } from './recording-share-indexes';

// Explicitly target a separately started fixture; never read or reconfigure the shared deployment.
test('public HTML/RSC shares expose complete content and honor live revocation, expiry and owner access', {
    skip: !process.env.VOSIFT_TEST_API_BASE_URL || !process.env.VOSIFT_TEST_API_MONGODB_URI || !process.env.VOSIFT_TEST_SHARE_SECRET,
}, async () => {
    const base = new URL(process.env.VOSIFT_TEST_API_BASE_URL!);
    const uri = new URL(process.env.VOSIFT_TEST_API_MONGODB_URI!);
    assert.ok(['127.0.0.1', 'localhost'].includes(base.hostname));
    assert.ok(['127.0.0.1', 'localhost'].includes(uri.hostname));
    assert.ok(uri.pathname.startsWith('/vosift_api_'));
    const client = new MongoClient(uri.toString());
    const db = client.db();
    const recordingId = new ObjectId(), shareId = new ObjectId(), userId = new ObjectId();
    const nonce = randomUUID().replaceAll('-', '');
    const owner = `PRIVATE_OWNER_${nonce}`, key = `PRIVATE_STORAGE_${nonce}`, filename = `PRIVATE_FILENAME_${nonce}`;
    const content = `FULL_TRANSCRIPT_${nonce}`, summary = `FULL_SUMMARY_${nonce}`;
    const issuedAt = Math.floor(Date.now() / 1000), expiresAt = issuedAt + 3600;
    const sign = () => new SignJWT({ shareId: shareId.toString() }).setProtectedHeader({ alg: 'HS256' })
        .setAudience('vosift:share').setIssuedAt(issuedAt).setExpirationTime(expiresAt)
        .sign(new TextEncoder().encode(process.env.VOSIFT_TEST_SHARE_SECRET!));
    async function page(token: string, rsc: boolean) {
        const response = await fetch(new URL(`/s/${token}`, base), { headers: rsc ? { RSC: '1' } : {}, redirect: 'manual' });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type') || '', rsc ? /text\/x-component/ : /text\/html/);
        return response.text();
    }
    try {
        const settings = await db.collection(Collections.SYSTEM_SETTINGS).findOne({});
        assert.notEqual(settings?.team?.enabled, true, 'Requires a personal-account fixture deployment.');
        const now = new Date(issuedAt * 1000);
        await db.collection(Collections.USERS).insertOne({ _id: userId, authSubject: owner, disabled: false });
        await db.collection(Collections.RECORDINGS).insertOne({
            _id: recordingId, authSubject: owner, contactId: null, contactName: 'Shared call fixture', phoneNumber: '',
            normalizedPhoneNumber: '', fileName: filename, standardizedDisplayName: filename, r2Key: key,
            fileSize: 100, mimeType: 'audio/wav', duration: 60, recordedAt: now, createdAt: now, updatedAt: now,
            bulkImportId: 'PRIVATE_IMPORT', transcriptionStatus: 'completed', summary, tags: [], isArchived: false, isStarred: false,
            fullTranscript: [{ speakerId: 'provider-speaker-1', text: content, start: 0, end: 30, words: [] }],
        });
        await db.collection(RECORDING_SHARES).insertOne({ _id: shareId, owner, recordingId, createdAt: now, expiresAt: new Date(expiresAt * 1000) });
        const token = await sign();
        for (const rsc of [false, true]) {
            const body = await page(token, rsc);
            assert.ok(body.includes(content));
            assert.ok(body.includes(summary));
            assert.ok(body.includes('/api/shares/'), 'Playback must use the revocable app route.');
            for (const forbidden of [owner, key, filename, 'PRIVATE_IMPORT', 'X-Amz-Signature']) {
                assert.equal(body.includes(forbidden), false, `Public response disclosed ${forbidden}.`);
            }
        }
        for (const denied of ['revoked', 'owner-disabled', 'expired', 'deleted-recording']) {
            await db.collection(RECORDING_SHARES).updateOne({ _id: shareId }, { $unset: { revokedAt: '' }, $set: { expiresAt: new Date(expiresAt * 1000) } });
            await db.collection(Collections.USERS).updateOne({ _id: userId }, { $set: { disabled: false } });
            if (denied === 'revoked') await db.collection(RECORDING_SHARES).updateOne({ _id: shareId }, { $set: { revokedAt: new Date() } });
            if (denied === 'owner-disabled') await db.collection(Collections.USERS).updateOne({ _id: userId }, { $set: { disabled: true } });
            if (denied === 'expired') await db.collection(RECORDING_SHARES).updateOne({ _id: shareId }, { $set: { expiresAt: new Date(0) } });
            if (denied === 'deleted-recording') await db.collection(Collections.RECORDINGS).deleteOne({ _id: recordingId });
            for (const rsc of [false, true]) {
                const body = await page(token, rsc);
                assert.ok(body.includes('Share link unavailable'), denied);
                assert.equal(body.includes(content), false, denied);
                assert.equal(body.includes(summary), false, denied);
            }
            const audio = await fetch(new URL(`/api/shares/${token}/audio`, base), { headers: { Range: 'bytes=0-1' } });
            assert.equal(audio.status, 404, denied);
            assert.equal(audio.headers.get('cache-control'), 'private, no-store');
        }
    } finally {
        await db.collection(RECORDING_SHARES).deleteOne({ _id: shareId, owner });
        await db.collection(Collections.RECORDINGS).deleteOne({ _id: recordingId, authSubject: owner });
        await db.collection(Collections.USERS).deleteOne({ _id: userId, authSubject: owner });
        await client.close();
    }
});
