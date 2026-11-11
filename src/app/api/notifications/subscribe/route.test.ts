import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { NextRequest } from 'next/server';
import { PushDatabase, subscriptionFixture } from '@/test/push-database';

type State = { actor: string | null; fixture: PushDatabase; profileMissing: boolean };
const key = Symbol.for('vosift.test.push-subscription-route');
const shared = globalThis as typeof globalThis & { [key]: State };
const reference = `globalThis[Symbol.for('vosift.test.push-subscription-route')]`;
const hook = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/api/notifications/subscribe/route.ts')) {
        const source = specifier === '@/lib/auth-utils' ? `export async function getAuthSubjectFromSession(){return ${reference}.actor;}`
            : specifier === '@/lib/db/users' ? `export async function findUserByAuthSubject(){return ${reference}.profileMissing?null:${reference}.fixture.user;}`
                : specifier === '@/lib/mongodb' ? `export async function getMongoDb(){return ${reference}.fixture.asDb();}`
                    : specifier === '@/lib/logger' ? 'export const logger={error(){}};' : undefined;
        if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    return next(specifier, context);
} });
const { POST, DELETE } = await import('./route');
hook.deregister();

function setup() {
    const state: State = { actor: 'owner', fixture: new PushDatabase(), profileMissing: false };
    shared[key] = state;
    return state;
}

function request(method: 'POST' | 'DELETE', body: unknown) {
    return new NextRequest('https://app.example.com/api/notifications/subscribe', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('concurrent route registrations retain both devices and refresh endpoint keys without duplicates', async () => {
    const { fixture } = setup();
    const first = subscriptionFixture('phone'), second = subscriptionFixture('desktop');
    const responses = await Promise.all([POST(request('POST', first)), POST(request('POST', second))]);
    assert.deepEqual(responses.map(response => response.status), [200, 200]);
    assert.deepEqual(fixture.user!.pushSubscriptions!.map(subscription => subscription.endpoint), [first.endpoint, second.endpoint]);
    const refreshed = subscriptionFixture('phone', 'new');
    assert.equal((await POST(request('POST', refreshed))).status, 200);
    assert.equal(fixture.user!.pushSubscriptions!.length, 2);
    assert.deepEqual(fixture.user!.pushSubscriptions!.find(subscription => subscription.endpoint === first.endpoint)?.keys, refreshed.keys);
});

test('unsubscribe removes its endpoint atomically while concurrent registration retains another device', async () => {
    const { fixture } = setup();
    const first = subscriptionFixture('phone'), second = subscriptionFixture('desktop');
    fixture.user!.pushSubscriptions = [first];
    const responses = await Promise.all([DELETE(request('DELETE', { endpoint: first.endpoint })), POST(request('POST', second))]);
    assert.deepEqual(responses.map(response => response.status), [200, 200]);
    assert.deepEqual(fixture.user!.pushSubscriptions!.map(subscription => subscription.endpoint), [second.endpoint]);
});

test('subscription routes preserve authentication, missing-profile and payload validation checks', async () => {
    const state = setup();
    state.actor = null;
    assert.equal((await POST(request('POST', subscriptionFixture('phone')))).status, 401);
    assert.equal((await DELETE(request('DELETE', { endpoint: subscriptionFixture('phone').endpoint }))).status, 401);
    state.actor = 'owner'; state.profileMissing = true;
    assert.equal((await POST(request('POST', subscriptionFixture('phone')))).status, 404);
    state.profileMissing = false;
    assert.equal((await POST(request('POST', { endpoint: 'invalid', keys: {} }))).status, 400);
    assert.equal((await DELETE(request('DELETE', { endpoint: 'invalid' }))).status, 400);
    assert.equal(state.fixture.writes.length, 0);
});

test('access removed after authentication prevents both subscription writes', async () => {
    for (const method of ['POST', 'DELETE'] as const) {
        const { fixture } = setup();
        fixture.user!.pushSubscriptions = [subscriptionFixture('phone')];
        fixture.beforeUpdate = () => { fixture.user!.disabled = true; };
        const response = method === 'POST' ? await POST(request(method, subscriptionFixture('desktop')))
            : await DELETE(request(method, { endpoint: subscriptionFixture('phone').endpoint }));
        assert.equal(response.status, 403);
        assert.deepEqual(fixture.user!.pushSubscriptions!.map(subscription => subscription.endpoint), [subscriptionFixture('phone').endpoint]);
    }
});
