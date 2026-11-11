import assert from 'node:assert/strict';
import test from 'node:test';
import { finishAccountClosure } from './account-closure-client';

test('accepted closure navigates after logout, including an already revoked session', async () => {
    for (const subject of ['owner', null]) {
        const events: string[] = [];
        assert.equal(await finishAccountClosure('owner', 'cleanup_pending', {
            currentSubject: async () => subject,
            signOut: async () => { events.push('signout'); },
            navigate: href => { events.push(href); },
        }), true);
        assert.deepEqual(events, ['signout', '/account-closed?status=cleanup_pending']);
    }
});

test('a previous account response cannot sign out or redirect the next account', async () => {
    assert.equal(await finishAccountClosure('owner', 'deleted', {
        currentSubject: async () => 'another-owner',
        signOut: async () => { assert.fail('Must not sign out another account'); },
        navigate: () => { assert.fail('Must not redirect another account'); },
    }), false);
});

test('rejected or stalled signout cannot strand an accepted closure', async () => {
    for (const signOut of [async () => { throw new Error('offline'); }, () => new Promise<void>(() => {})]) {
        let target: string | undefined;
        await finishAccountClosure('owner', 'deleted', {
            currentSubject: async () => 'owner', signOut, navigate: href => { target = href; },
        }, 5);
        assert.equal(target, '/account-closed?status=deleted');
    }
});

test('unknown auth state navigates without signing out an unverified account', async () => {
    for (const currentSubject of [async () => { throw new Error('offline'); }, () => new Promise<string | null>(() => {})]) {
        let target: string | undefined;
        await finishAccountClosure('owner', 'cleanup_pending', {
            currentSubject,
            signOut: async () => { assert.fail('Do not change cookies for an unknown account'); },
            navigate: href => { target = href; },
        }, 5);
        assert.equal(target, '/account-closed?status=cleanup_pending');
    }
});
