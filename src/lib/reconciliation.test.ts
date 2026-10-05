import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { featureSigningKey } from './signing-key';
import { createUploadSessionToken, verifyUploadSessionToken } from './upload-session-token';
import { createMobileSyncSessionToken, verifyMobileSyncSessionToken } from './mobile-sync-session-token';
import { generateShareToken, verifyShareToken } from './sharing';
import { removeStoredObjects } from './storage-cleanup';
import { meterQuantity, reportUsage } from './stripe/usage';

test('upload, sharing and sync tokens cannot substitute for each other even with the same secret', async () => {
    process.env.UPLOAD_SESSION_SECRET = process.env.SHARE_LINK_SECRET = process.env.MOBILE_SYNC_SESSION_SECRET = 'a-shared-secret-for-token-confusion-regression';
    const upload = await createUploadSessionToken({
        authSubject: 'owner', r2Key: 'owner/audio.wav', fileName: 'audio.wav', fileSize: 100,
        mimeType: 'audio/wav', contactId: null, contactName: null, phoneNumber: '',
        recordedAtIso: new Date().toISOString(), standardizedDisplayName: 'Audio',
    });
    const sync = await createMobileSyncSessionToken('owner');
    const share = await generateShareToken({ recordingId: 'recording' });
    assert.equal((await verifyUploadSessionToken(upload))?.authSubject, 'owner');
    assert.equal((await verifyMobileSyncSessionToken(sync))?.authSubject, 'owner');
    assert.equal((await verifyShareToken(share))?.recordingId, 'recording');
    assert.equal(await verifyMobileSyncSessionToken(upload), null);
    assert.equal(await verifyUploadSessionToken(sync), null);
    const wrongAudience = await new SignJWT({ recordingId: 'recording', authSubject: 'owner' })
        .setProtectedHeader({ alg: 'HS256' }).setAudience('vosift:upload').setExpirationTime('1h')
        .sign(featureSigningKey('SHARE_LINK_SECRET', 'share'));
    assert.equal(await verifyShareToken(wrongAudience), null);
    const expired = await new SignJWT({ authSubject: 'owner' })
        .setProtectedHeader({ alg: 'HS256' }).setAudience('vosift:sync').setExpirationTime(1)
        .sign(featureSigningKey('MOBILE_SYNC_SESSION_SECRET', 'sync'));
    assert.equal(await verifyMobileSyncSessionToken(expired), null);
});

test('a local instance derives separate feature keys without extra secrets', () => {
    delete process.env.UPLOAD_SESSION_SECRET;
    delete process.env.SHARE_LINK_SECRET;
    delete process.env.MOBILE_SYNC_SESSION_SECRET;
    process.env.AUTH_PROVIDER = 'local';
    process.env.BETTER_AUTH_SECRET = 'one-local-auth-secret-at-least-thirty-two-characters';
    delete process.env.APP_SIGNING_SECRET;
    assert.notDeepEqual(featureSigningKey('UPLOAD_SESSION_SECRET', 'upload'), featureSigningKey('SHARE_LINK_SECRET', 'share'));
    assert.notDeepEqual(featureSigningKey('UPLOAD_SESSION_SECRET', 'upload'), featureSigningKey('MOBILE_SYNC_SESSION_SECRET', 'sync'));
});

test('cleanup retains failed object keys and deletes each successful key once', async () => {
    const attempts: string[] = [];
    const failed = await removeStoredObjects(['a', 'b', 'a', '', 'c'], async key => {
        attempts.push(key);
        if (key === 'b') throw new Error('Storage offline');
    });
    assert.deepEqual(failed, ['b']);
    assert.deepEqual(attempts.sort(), ['a', 'b', 'c']);
});

test('weighted meter values are integers and billing-off requests need no Stripe key or database', async () => {
    assert.equal(meterQuantity(1, 0.1), 1);
    assert.equal(meterQuantity(60, 0.5), 30);
    assert.equal(meterQuantity(NaN), 0);
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'false';
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.MONGODB_URI;
    await reportUsage('owner', 'transcription', 60);
});
