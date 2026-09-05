import test from 'node:test';
import assert from 'node:assert/strict';
import {
    EnsureProfileBodySchema,
    UpdateProfileBodySchema,
    InitDirectUploadBodySchema,
    CompleteDirectUploadBodySchema,
    PushSubscribeBodySchema,
    ContactsListQuerySchema,
} from '@/lib/schemas';

test('EnsureProfileBodySchema accepts an empty object', () => {
    const result = EnsureProfileBodySchema.safeParse({});
    assert.equal(result.success, true);
});

test('EnsureProfileBodySchema rejects oversized displayName', () => {
    const result = EnsureProfileBodySchema.safeParse({ displayName: 'a'.repeat(101) });
    assert.equal(result.success, false);
});

test('EnsureProfileBodySchema rejects malformed photoURL', () => {
    const result = EnsureProfileBodySchema.safeParse({ photoURL: 'not-a-url' });
    assert.equal(result.success, false);
});

test('EnsureProfileBodySchema accepts valid displayName + photoURL', () => {
    const result = EnsureProfileBodySchema.safeParse({
        displayName: 'Jane Doe',
        photoURL: 'https://example.com/avatar.png',
    });
    assert.equal(result.success, true);
});

test('UpdateProfileBodySchema strips unknown fields by rejecting', () => {
    const result = UpdateProfileBodySchema.safeParse({ planKey: 'pro' });
    assert.equal(result.success, false);
});

test('UpdateProfileBodySchema accepts partial nested settings', () => {
    const result = UpdateProfileBodySchema.safeParse({
        notificationSettings: { ingestSuccess: true },
        storageSettings: { deletionPolicy: '6m' },
    });
    assert.equal(result.success, true);
});

test('UpdateProfileBodySchema rejects invalid deletionPolicy', () => {
    const result = UpdateProfileBodySchema.safeParse({
        storageSettings: { deletionPolicy: '99y' },
    });
    assert.equal(result.success, false);
});

test('InitDirectUploadBodySchema rejects missing fileName', () => {
    const result = InitDirectUploadBodySchema.safeParse({ fileSize: 1234 });
    assert.equal(result.success, false);
});

test('InitDirectUploadBodySchema rejects negative fileSize', () => {
    const result = InitDirectUploadBodySchema.safeParse({ fileName: 'x.m4a', fileSize: -1 });
    assert.equal(result.success, false);
});

test('InitDirectUploadBodySchema rejects fileSize over 5 GiB', () => {
    const result = InitDirectUploadBodySchema.safeParse({
        fileName: 'x.m4a',
        fileSize: 6 * 1024 * 1024 * 1024,
    });
    assert.equal(result.success, false);
});

test('InitDirectUploadBodySchema accepts valid input', () => {
    const result = InitDirectUploadBodySchema.safeParse({
        fileName: 'recording.m4a',
        fileSize: 1024,
        mimeType: 'audio/mp4',
    });
    assert.equal(result.success, true);
});

test('CompleteDirectUploadBodySchema rejects empty token', () => {
    const result = CompleteDirectUploadBodySchema.safeParse({ uploadToken: '' });
    assert.equal(result.success, false);
});

test('PushSubscribeBodySchema rejects missing keys', () => {
    const result = PushSubscribeBodySchema.safeParse({
        endpoint: 'https://fcm.googleapis.com/x',
    });
    assert.equal(result.success, false);
});

test('PushSubscribeBodySchema accepts valid subscription', () => {
    const result = PushSubscribeBodySchema.safeParse({
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'pub', auth: 'auth' },
    });
    assert.equal(result.success, true);
});

test('PushSubscribeBodySchema rejects oversized endpoint', () => {
    const result = PushSubscribeBodySchema.safeParse({
        endpoint: `https://x.example/${'a'.repeat(2000)}`,
        keys: { p256dh: 'pub', auth: 'auth' },
    });
    assert.equal(result.success, false);
});

test('ContactsListQuerySchema clamps via rejection — limit > 100 fails', () => {
    const result = ContactsListQuerySchema.safeParse({ limit: '999' });
    assert.equal(result.success, false);
});

test('ContactsListQuerySchema coerces string params from URLSearchParams', () => {
    const result = ContactsListQuerySchema.safeParse({ limit: '50', skip: '10' });
    assert.equal(result.success, true);
    if (result.success) {
        assert.equal(result.data.limit, 50);
        assert.equal(result.data.skip, 10);
    }
});

test('ContactsListQuerySchema rejects negative skip', () => {
    const result = ContactsListQuerySchema.safeParse({ skip: '-1' });
    assert.equal(result.success, false);
});
