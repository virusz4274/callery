import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { AccountClosurePolicyError, hasRecentAccountClosureLogin, ACCOUNT_CLOSURE_LOGIN_MAX_AGE_MS } from '@/lib/account-closure';
import type { User } from '@/lib/db/types';

type State = {
    session: { user: { id: string; email: string }; session: { createdAt: unknown; updatedAt?: Date } } | null;
    profile: Partial<User> | null;
    deletion: 'deleted' | 'pending' | 'policy' | 'failure';
    deletedSubjects: string[];
    logFailure: boolean;
    logged: unknown[][];
};
const key = Symbol.for('vosift.test.account-closure-action');
const shared = globalThis as typeof globalThis & { [key]: State };
const s = `globalThis[Symbol.for('vosift.test.account-closure-action')]`;
const hooks = registerHooks({ resolve(specifier, context, next) {
    let source: string | undefined;
    if (context.parentURL?.endsWith('/actions/delete-account.ts')) {
        if (specifier === 'next/headers') source = 'export async function headers(){return new Headers();}';
        if (specifier === '@/lib/auth/server') source = `export async function getAuth(){return {api:{getSession:async()=>${s}.session}};}`;
        if (specifier === '@/lib/db/users') source = `export async function findUserByAuthSubject(){return ${s}.profile;}`;
        if (specifier === '@/lib/db/delete-user-data') source = `import {AccountClosurePolicyError} from '${new URL('../../lib/account-closure.ts', import.meta.url).href}';
            export async function deleteUserData(subject){${s}.deletedSubjects.push(subject);
                if(${s}.deletion==='policy')throw new AccountClosurePolicyError('Company accounts must keep their archive.');
                if(${s}.deletion==='failure')throw new Error('Synthetic database failure');
                return {recordingsDeleted:3,r2Failures:[],cleanupPending:${s}.deletion==='pending'};}`;
        if (specifier === '@/lib/db/system-log') source = `export async function logSystemEvent(...args){${s}.logged.push(args);if(${s}.logFailure)throw new Error('Synthetic audit failure');}`;
        if (specifier === '@/lib/logger') source = 'export const logger={error(){}};';
    }
    return source ? { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true } : next(specifier, context);
} });
const { deleteOwnAccount } = await import('./delete-account');
hooks.deregister();

const confirmation = { expectedAuthSubject: 'owner', confirmationEmail: 'owner@example.test' };
function setup() {
    const state: State = {
        session: { user: { id: 'owner', email: 'owner@example.test' }, session: { createdAt: new Date() } },
        profile: { authSubject: 'owner', role: 'user' }, deletion: 'deleted', deletedSubjects: [], logFailure: false, logged: [],
    };
    shared[key] = state;
    return state;
}

test('closure requires a recent original session creation time, including the exact boundary', () => {
    const now = Date.now();
    assert.equal(hasRecentAccountClosureLogin(new Date(now - ACCOUNT_CLOSURE_LOGIN_MAX_AGE_MS), now), true);
    for (const created of [new Date(now - ACCOUNT_CLOSURE_LOGIN_MAX_AGE_MS - 1), new Date(now + 1), new Date('invalid'), 'invalid', undefined, now]) {
        assert.equal(hasRecentAccountClosureLogin(created, now), false);
    }
});

test('absent, stale and invalid logins do not start account deletion', async () => {
    for (const createdAt of [null, new Date(Date.now() - 601_000), 'invalid', new Date(Date.now() + 60_000)]) {
        const state = setup();
        if (createdAt === null) state.session = null;
        else state.session!.session = { createdAt, updatedAt: new Date() };
        assert.equal((await deleteOwnAccount(confirmation)).status, 'reauth_required');
        assert.deepEqual(state.deletedSubjects, []);
    }
});

test('wrong email, malformed input and switching accounts invalidate the confirmation', async () => {
    for (const input of [
        { ...confirmation, expectedAuthSubject: 'other' },
        { ...confirmation, confirmationEmail: 'other@example.test' },
        { ...confirmation, confirmationEmail: 'invalid' },
        { ...confirmation, unexpected: true },
    ]) {
        const state = setup();
        assert.equal((await deleteOwnAccount(input)).status, 'blocked');
        assert.deepEqual(state.deletedSubjects, []);
    }
});

test('inactive and missing profiles cannot request account closure', async () => {
    for (const profile of [null, { disabled: true }, { softDelete: { isDeleted: true } }, { teamInvitationPending: true }]) {
        const state = setup(); state.profile = profile as Partial<User> | null;
        assert.equal((await deleteOwnAccount(confirmation)).status, 'blocked');
        assert.deepEqual(state.deletedSubjects, []);
    }
});

test('password and Google-only accounts share the same provider-neutral closure requirements', async () => {
    for (const provider of ['credential', 'google']) {
        const state = setup(); state.profile!.name = provider;
        const result = await deleteOwnAccount({ ...confirmation, confirmationEmail: ' OWNER@example.test ' });
        assert.equal(result.status, 'deleted');
        assert.deepEqual(state.deletedSubjects, ['owner']);
        assert.equal(JSON.stringify(state.logged).includes('owner@example.test'), false);
    }
});

test('pending cleanup and audit failure remain accepted outcomes', async () => {
    for (const deletion of ['deleted', 'pending'] as const) {
        const state = setup(); state.deletion = deletion; state.logFailure = true;
        assert.equal((await deleteOwnAccount(confirmation)).status, deletion === 'deleted' ? 'deleted' : 'cleanup_pending');
        assert.deepEqual(state.deletedSubjects, ['owner']);
    }
});

test('policy denial is distinguished from a failure before acceptance', async () => {
    const state = setup(); state.deletion = 'policy';
    const blocked = await deleteOwnAccount(confirmation);
    assert.equal(blocked.status, 'blocked'); assert.match(blocked.message, /Company/);
    state.deletion = 'failure';
    assert.equal((await deleteOwnAccount(confirmation)).status, 'error');
    assert.equal(state.logged.length, 0);
    assert.ok(new AccountClosurePolicyError('policy') instanceof Error);
});
