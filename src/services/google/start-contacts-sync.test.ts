import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureTestEnv } from '@/test/env-test-setup';

ensureTestEnv();

test('startGoogleContactsSync schedules background sync after preparing state', async () => {
    const { startGoogleContactsSyncWithDependencies } = await import('@/services/google/start-contacts-sync');
    const scheduled: string[] = [];
    const prepared: Array<{ firebaseUid: string; refreshToken?: string; scopes?: string[]; expiryDate?: number }> = [];
    const fakeClient = {
        getToken: async () => ({
            tokens: {
                refresh_token: 'fresh-token',
                expiry_date: 1_234,
                scope: 'scope-a scope-b',
            },
        }),
        setCredentials: () => {},
    };

    const result = await startGoogleContactsSyncWithDependencies('oauth-code', {
        getOAuth2Client: () => fakeClient as never,
        getFirebaseUidFromSession: async () => 'user-1',
        findUserByFirebaseUid: async () => ({
            firebaseUid: 'user-1',
            googleSync: { status: 'completed' },
        } as never),
        readStoredGoogleRefreshToken: () => null,
        prepareGoogleContactsSync: async (firebaseUid, credentials) => {
            prepared.push({
                firebaseUid,
                refreshToken: credentials.refreshToken,
                scopes: credentials.scopes,
                expiryDate: credentials.expiryDate,
            });
        },
        scheduleGoogleContactsSyncInBackground: (firebaseUid) => {
            scheduled.push(firebaseUid);
        },
        recoverStaleGoogleSync: async () => false,
    });

    assert.deepEqual(result, { success: true, message: 'Sync started in background.' });
    assert.deepEqual(prepared, [{
        firebaseUid: 'user-1',
        refreshToken: 'fresh-token',
        scopes: ['scope-a', 'scope-b'],
        expiryDate: 1_234,
    }]);
    assert.deepEqual(scheduled, ['user-1']);
});

test('startGoogleContactsSync rejects duplicate active syncs', async () => {
    const { startGoogleContactsSyncWithDependencies } = await import('@/services/google/start-contacts-sync');
    const result = await startGoogleContactsSyncWithDependencies('oauth-code', {
        getOAuth2Client: () => ({
            getToken: async () => ({ tokens: {} }),
            setCredentials: () => {},
        }) as never,
        getFirebaseUidFromSession: async () => 'user-1',
        findUserByFirebaseUid: async () => ({
            firebaseUid: 'user-1',
            googleSync: { status: 'syncing' },
        } as never),
        readStoredGoogleRefreshToken: () => 'stored-token',
        prepareGoogleContactsSync: async () => {
            throw new Error('should not prepare sync');
        },
        scheduleGoogleContactsSyncInBackground: () => {
            throw new Error('should not schedule sync');
        },
        recoverStaleGoogleSync: async () => false,
    });

    assert.deepEqual(result, {
        success: false,
        error: 'Google Contacts sync is already in progress.',
    });
});

test('startGoogleContactsSync recovers stale syncing state before scheduling a new sync', async () => {
    const { startGoogleContactsSyncWithDependencies } = await import('@/services/google/start-contacts-sync');
    const scheduled: string[] = [];
    const recovered: string[] = [];

    const result = await startGoogleContactsSyncWithDependencies('oauth-code', {
        getOAuth2Client: () => ({
            getToken: async () => ({ tokens: { refresh_token: 'fresh-token' } }),
            setCredentials: () => {},
        }) as never,
        getFirebaseUidFromSession: async () => 'user-1',
        findUserByFirebaseUid: async () => ({
            firebaseUid: 'user-1',
            googleSync: { status: 'syncing' },
        } as never),
        readStoredGoogleRefreshToken: () => 'stored-token',
        prepareGoogleContactsSync: async () => {},
        scheduleGoogleContactsSyncInBackground: (firebaseUid) => {
            scheduled.push(firebaseUid);
        },
        recoverStaleGoogleSync: async (firebaseUid) => {
            recovered.push(firebaseUid);
            return true;
        },
    });

    assert.deepEqual(result, { success: true, message: 'Sync started in background.' });
    assert.deepEqual(recovered, ['user-1']);
    assert.deepEqual(scheduled, ['user-1']);
});

test('disconnectGoogleContacts clears stored Google credentials and keeps the disconnect non-blocking when revoke fails', async () => {
    const { disconnectGoogleContactsWithDependencies } = await import('@/services/google/start-contacts-sync');
    const updates: Array<Record<string, unknown>> = [];
    const unsets: Array<Record<string, unknown>> = [];

    const result = await disconnectGoogleContactsWithDependencies('user-1', {
        findUserByFirebaseUid: async () => ({
            firebaseUid: 'user-1',
            googleSync: {
                status: 'completed',
                lastSyncedAt: new Date('2026-03-20T00:00:00.000Z'),
                lastImportedCount: 12,
            },
        } as never),
        readStoredGoogleRefreshToken: () => 'stored-token',
        getOAuth2Client: () => ({
            revokeToken: async () => {
                throw new Error('revoke failed');
            },
        }) as never,
        updateGoogleSyncState: async (_firebaseUid, patch) => {
            updates.push(patch as Record<string, unknown>);
            return null as never;
        },
        getMongoDb: async () => ({
            collection: () => ({
                updateOne: async (_filter: unknown, update: Record<string, unknown>) => {
                    unsets.push(update);
                },
            }),
        }) as never,
    });

    assert.deepEqual(result, { success: true });
    assert.equal(updates[0].status, 'not_connected');
    assert.equal(updates[0].refreshToken, null);
    assert.equal(updates[0].lastError, null);
    assert.deepEqual(unsets[0], {
        $unset: {
            'googleSync.connectedAt': '',
            'googleSync.lastAttemptAt': '',
            'googleSync.scopes': '',
            'googleSync.tokenExpiresAt': '',
        },
    });
});

test('runGoogleContactsSync updates sync state after a successful import', async () => {
    const { runGoogleContactsSyncWithDependencies } = await import('@/services/google/start-contacts-sync');
    const updates: Array<Record<string, unknown>> = [];
    const fakeClient = {
        credentials: {
            expiry_date: 9_999,
        },
        setCredentials: (credentials: Record<string, unknown>) => {
            updates.push({ credentials });
        },
    };

    await runGoogleContactsSyncWithDependencies('user-1', {
        findUserByFirebaseUid: async () => ({
            firebaseUid: 'user-1',
            googleSync: {
                scopes: ['scope-a'],
                tokenExpiresAt: new Date('2026-03-20T00:00:00.000Z'),
            },
        } as never),
        readStoredGoogleRefreshToken: () => 'stored-token',
        getOAuth2Client: () => fakeClient as never,
        syncContactsBackground: async (firebaseUid, client) => {
            assert.equal(firebaseUid, 'user-1');
            assert.equal(client, fakeClient);
            return {
                importedCount: 42,
                duplicatePhoneIssues: [
                    { phoneNumber: '+919353096358', names: ['Deon M Sebastian', 'Deon Pc Customer'] },
                ],
            };
        },
        updateGoogleSyncState: async (_firebaseUid, patch) => {
            updates.push(patch as Record<string, unknown>);
            return null as never;
        },
    });

    assert.deepEqual(updates[0], {
        credentials: {
            refresh_token: 'stored-token',
        },
    });
    assert.equal(updates[1].status, 'completed');
    assert.equal(updates[1].lastImportedCount, 42);
    assert.equal(updates[1].lastError, null);
    assert.deepEqual(updates[1].scopes, ['scope-a']);
    assert.equal(updates[1].duplicatePhoneIssueCount, 1);
    assert.deepEqual(updates[1].duplicatePhoneIssues, [
        { phoneNumber: '+919353096358', names: ['Deon M Sebastian', 'Deon Pc Customer'] },
    ]);
    assert.ok(updates[1].duplicatePhoneIssueDetectedAt instanceof Date);
    assert.ok(updates[1].lastSyncedAt instanceof Date);
    assert.ok(updates[1].tokenExpiresAt instanceof Date);
});
