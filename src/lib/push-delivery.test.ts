import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import type { PushSubscriptionEntry } from '@/lib/db/types';
import { PushDatabase, subscriptionFixture } from '@/test/push-database';
import { savePushSubscription } from './push-subscriptions';

type State = { results: Map<string, { success: boolean; statusCode?: number }>; sent: string[]; beforeSend?: (endpoint: string) => Promise<void>; reject?: boolean; warnings: unknown[][] };
const key = Symbol.for('vosift.test.push-delivery');
const shared = globalThis as typeof globalThis & { [key]: State };
const reference = `globalThis[Symbol.for('vosift.test.push-delivery')]`;
const hook = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/lib/push-delivery.ts')) {
        const source = specifier === '@/lib/web-push' ? `export async function sendWebPushNotification(subscription){const state=${reference};state.sent.push(subscription.endpoint);await state.beforeSend?.(subscription.endpoint);if(state.reject)throw new Error('Synthetic network outage');return {endpoint:subscription.endpoint,...state.results.get(subscription.endpoint)};}`
            : specifier === '@/lib/logger' ? `export const logger={warn(...args){${reference}.warnings.push(args);}};` : undefined;
        if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    return next(specifier, context);
} });
const { deliverUserPushNotification } = await import('./push-delivery');
hook.deregister();

function setup(subscriptions: PushSubscriptionEntry[]) {
    const fixture = new PushDatabase(subscriptions);
    const state: State = { results: new Map(subscriptions.map(subscription => [subscription.endpoint, { success: true, statusCode: 201 }])), sent: [], warnings: [] };
    shared[key] = state;
    return { fixture, state };
}

test('delivery prunes only terminal 404/410 endpoints while preserving healthy and transient failures', async () => {
    const subscriptions = ['healthy', 'missing', 'gone', 'busy', 'outage', 'network', 'unconfigured'].map(name => subscriptionFixture(name));
    const { fixture, state } = setup(subscriptions);
    for (const [index, statusCode] of [[1, 404], [2, 410], [3, 429], [4, 503]] as const) {
        state.results.set(subscriptions[index].endpoint, { success: false, statusCode });
    }
    state.results.set(subscriptions[5].endpoint, { success: false });
    state.results.set(subscriptions[6].endpoint, { success: false });
    await deliverUserPushNotification(fixture.user!._id, { title: 'Ready', body: 'Recording processed' }, fixture.asDb());
    assert.equal(state.sent.length, subscriptions.length);
    assert.deepEqual(fixture.user!.pushSubscriptions!.map(subscription => subscription.endpoint), [0, 3, 4, 5, 6].map(index => subscriptions[index].endpoint));
});

test('a subscription refreshed during failed delivery remains registered', async () => {
    const old = subscriptionFixture('phone');
    const { fixture, state } = setup([old]);
    const refreshed = subscriptionFixture('phone', 'refreshed');
    state.beforeSend = async () => { await savePushSubscription('owner', refreshed, fixture.asDb()); };
    state.results.set(old.endpoint, { success: false, statusCode: 410 });
    await deliverUserPushNotification(fixture.user!._id, { title: 'Ready', body: 'Recording processed' }, fixture.asDb());
    assert.deepEqual(fixture.user!.pushSubscriptions, [refreshed]);
});

test('delivery skips disabled, deleted, invited and missing users', async () => {
    for (const flags of [{ disabled: true }, { softDelete: { isDeleted: true } }, { teamInvitationPending: true }]) {
        const { fixture, state } = setup([subscriptionFixture('phone')]);
        Object.assign(fixture.user!, flags);
        await deliverUserPushNotification(fixture.user!._id, { title: 'Ready', body: 'Recording processed' }, fixture.asDb());
        assert.deepEqual(state.sent, []);
    }
    const { fixture, state } = setup([]), id = fixture.user!._id;
    fixture.user = null;
    await deliverUserPushNotification(id, { title: 'Ready', body: 'Recording processed' }, fixture.asDb());
    assert.deepEqual(state.sent, []);
});

test('network exceptions and prune database failures preserve subscriptions without failing notification delivery', async () => {
    {
        const { fixture, state } = setup([subscriptionFixture('phone')]);
        state.reject = true;
        await deliverUserPushNotification(fixture.user!._id, { title: 'Ready', body: 'Recording processed' }, fixture.asDb());
        assert.equal(fixture.user!.pushSubscriptions!.length, 1);
        assert.equal(state.warnings.length, 1);
        assert.equal(JSON.stringify(state.warnings).includes('push.example.test'), false);
    }
    {
        const old = subscriptionFixture('phone');
        const { fixture, state } = setup([old]);
        state.results.set(old.endpoint, { success: false, statusCode: 404 });
        fixture.failUpdates = true;
        await deliverUserPushNotification(fixture.user!._id, { title: 'Ready', body: 'Recording processed' }, fixture.asDb());
        assert.deepEqual(fixture.user!.pushSubscriptions, [old]);
        assert.equal(state.warnings.length, 1);
    }
});
