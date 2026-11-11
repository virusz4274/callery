import test from 'node:test';
import assert from 'node:assert/strict';
import { saveUserProfile, userProfileKey } from './profile-client';

test('profile saves keep the PATCH contract and refresh only the accepted user cache', async t => {
    const requests: unknown[] = [], refreshed: unknown[] = [];
    t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
        requests.push([url, init.method, JSON.parse(init.body as string), init.credentials]);
        return Response.json({ success: true });
    });
    await saveUserProfile('auth-owner', { timezone: 'Asia/Kolkata' }, async key => { refreshed.push(key); });
    assert.deepEqual(requests, [['/api/user/profile', 'PATCH', { timezone: 'Asia/Kolkata' }, 'include']]);
    assert.deepEqual(refreshed, [userProfileKey('auth-owner')]);
    assert.notDeepEqual(userProfileKey('auth-owner'), userProfileKey('another-user'));
});

test('failed profile saves preserve the server error and do not revalidate stored data', async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Company policy manages these settings.' }, { status: 403 }));
    await assert.rejects(saveUserProfile('owner', { storageSettings: { deletionPolicy: '6m' } }, async () => {
        assert.fail('failed write must not reset the draft through revalidation');
    }), /Company policy manages/);
});

test('successful writes stay successful if a subsequent refresh is unavailable', async t => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ success: true }));
    await saveUserProfile('owner', { notificationSettings: { activityDigest: 'off' } }, async () => { throw new Error('offline refresh'); });
});

test('different sections can save concurrently without copying unrelated profile fields', async t => {
    const requests: unknown[] = [], owners: unknown[] = [];
    t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
        requests.push(JSON.parse(init.body as string)); return Response.json({ success: true });
    });
    await Promise.all([
        saveUserProfile('owner', { timezone: 'Europe/London' }, async key => { owners.push(key); }),
        saveUserProfile('owner', { transcriptionSettings: { autoTranscribe: false } }, async key => { owners.push(key); }),
    ]);
    assert.deepEqual(requests, [{ timezone: 'Europe/London' }, { transcriptionSettings: { autoTranscribe: false } }]);
    assert.deepEqual(owners, [userProfileKey('owner'), userProfileKey('owner')]);
});
