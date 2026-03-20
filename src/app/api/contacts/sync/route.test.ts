import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureTestEnv } from '@/test/env-test-setup';

ensureTestEnv();

test('contacts sync route returns 401 when there is no authenticated session', async () => {
    const { createPostContactsSyncHandler } = await import('@/app/api/contacts/sync/handler');
    const POST = createPostContactsSyncHandler({
        getFirebaseUidFromSession: async () => null,
        findUserByFirebaseUid: async () => null,
        readStoredGoogleRefreshToken: () => null,
        prepareGoogleContactsSync: async () => {
            throw new Error('should not prepare sync');
        },
        runGoogleContactsSync: async () => {
            throw new Error('should not run sync');
        },
        markGoogleContactsSyncFailed: async () => {
            throw new Error('should not mark failure');
        },
        recoverStaleGoogleSync: async () => {
            throw new Error('should not recover stale sync');
        },
    });

    const response = await POST();
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.deepEqual(body, { success: false, error: 'Not authenticated' });
});

test('contacts sync route returns 400 when Google is not connected', async () => {
    const { createPostContactsSyncHandler } = await import('@/app/api/contacts/sync/handler');
    const POST = createPostContactsSyncHandler({
        getFirebaseUidFromSession: async () => 'user-1',
        findUserByFirebaseUid: async () => ({ firebaseUid: 'user-1', googleSync: undefined } as never),
        readStoredGoogleRefreshToken: () => null,
        prepareGoogleContactsSync: async () => {
            throw new Error('should not prepare sync');
        },
        runGoogleContactsSync: async () => {
            throw new Error('should not run sync');
        },
        markGoogleContactsSyncFailed: async () => {
            throw new Error('should not mark failure');
        },
        recoverStaleGoogleSync: async () => {
            throw new Error('should not recover stale sync');
        },
    });

    const response = await POST();
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'Google account is not connected. Please reconnect first.');
});

test('contacts sync route returns 409 when a sync is already running', async () => {
    const { createPostContactsSyncHandler } = await import('@/app/api/contacts/sync/handler');
    const POST = createPostContactsSyncHandler({
        getFirebaseUidFromSession: async () => 'user-1',
        findUserByFirebaseUid: async () => ({
            firebaseUid: 'user-1',
            googleSync: { status: 'syncing' },
        } as never),
        readStoredGoogleRefreshToken: () => 'refresh-token',
        prepareGoogleContactsSync: async () => {
            throw new Error('should not prepare sync');
        },
        runGoogleContactsSync: async () => {
            throw new Error('should not run sync');
        },
        markGoogleContactsSyncFailed: async () => {
            throw new Error('should not mark failure');
        },
        recoverStaleGoogleSync: async () => {
            throw new Error('should not recover stale sync');
        },
    });

    const response = await POST();
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.equal(body.error, 'Google Contacts sync is already in progress.');
});

test('contacts sync route runs sync and returns 200 on success', async () => {
    const { createPostContactsSyncHandler } = await import('@/app/api/contacts/sync/handler');
    const calls: string[] = [];
    const POST = createPostContactsSyncHandler({
        getFirebaseUidFromSession: async () => 'user-1',
        findUserByFirebaseUid: async () => ({
            firebaseUid: 'user-1',
            googleSync: {
                status: 'completed',
                scopes: ['contacts.readonly'],
                tokenExpiresAt: new Date('2026-03-21T00:00:00.000Z'),
            },
        } as never),
        readStoredGoogleRefreshToken: () => 'refresh-token',
        prepareGoogleContactsSync: async (firebaseUid, credentials) => {
            calls.push(`prepare:${firebaseUid}:${credentials.refreshToken}:${credentials.scopes?.join(',')}`);
        },
        runGoogleContactsSync: async (firebaseUid) => {
            calls.push(`run:${firebaseUid}`);
        },
        markGoogleContactsSyncFailed: async () => {
            throw new Error('should not mark failure');
        },
        recoverStaleGoogleSync: async () => {
            throw new Error('should not recover stale sync');
        },
    });

    const response = await POST();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { success: true, message: 'Contacts synced successfully.' });
    assert.deepEqual(calls, [
        'prepare:user-1:refresh-token:contacts.readonly',
        'run:user-1',
    ]);
});

test('contacts sync route recovers stale syncing state before running sync', async () => {
    const { createPostContactsSyncHandler } = await import('@/app/api/contacts/sync/handler');
    const calls: string[] = [];
    const staleAttemptAt = new Date(Date.now() - 16 * 60 * 1000);
    const POST = createPostContactsSyncHandler({
        getFirebaseUidFromSession: async () => 'user-1',
        findUserByFirebaseUid: async () => ({
            firebaseUid: 'user-1',
            googleSync: {
                status: 'syncing',
                lastAttemptAt: staleAttemptAt,
            },
        } as never),
        readStoredGoogleRefreshToken: () => 'refresh-token',
        prepareGoogleContactsSync: async () => {
            calls.push('prepare');
        },
        runGoogleContactsSync: async () => {
            calls.push('run');
        },
        markGoogleContactsSyncFailed: async () => {
            throw new Error('should not mark failure');
        },
        recoverStaleGoogleSync: async (firebaseUid) => {
            calls.push(`recover:${firebaseUid}`);
            return true;
        },
    });

    const response = await POST();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { success: true, message: 'Contacts synced successfully.' });
    assert.deepEqual(calls, ['recover:user-1', 'prepare', 'run']);
});

test('contacts sync route marks failed state and returns 500 when sync throws', async () => {
    const { createPostContactsSyncHandler } = await import('@/app/api/contacts/sync/handler');
    const failures: string[] = [];
    const POST = createPostContactsSyncHandler({
        getFirebaseUidFromSession: async () => 'user-1',
        findUserByFirebaseUid: async () => ({
            firebaseUid: 'user-1',
            googleSync: { status: 'completed' },
        } as never),
        readStoredGoogleRefreshToken: () => 'refresh-token',
        prepareGoogleContactsSync: async () => {},
        runGoogleContactsSync: async () => {
            throw new Error('sync exploded');
        },
        markGoogleContactsSyncFailed: async (firebaseUid, errorMessage) => {
            failures.push(`${firebaseUid}:${errorMessage}`);
        },
        recoverStaleGoogleSync: async () => {
            throw new Error('should not recover stale sync');
        },
    });

    const response = await POST();
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.error, 'sync exploded');
    assert.deepEqual(failures, ['user-1:sync exploded']);
});
