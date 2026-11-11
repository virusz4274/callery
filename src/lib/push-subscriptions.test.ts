import test from 'node:test';
import assert from 'node:assert/strict';
import { PushDatabase, subscriptionFixture } from '@/test/push-database';
import { prunePushSubscription, removePushSubscription, savePushSubscription } from './push-subscriptions';

test('concurrent registrations retain both devices without reading a stale subscription list', async () => {
    const fixture = new PushDatabase();
    delete fixture.user!.pushSubscriptions;
    const first = subscriptionFixture('phone'), second = subscriptionFixture('desktop');
    const results = await Promise.all([savePushSubscription('owner', first, fixture.asDb()), savePushSubscription('owner', second, fixture.asDb())]);
    assert.deepEqual(results, [true, true]);
    assert.deepEqual(fixture.user!.pushSubscriptions, [first, second]);
    assert.equal(fixture.reads, 0);
    assert.ok(fixture.writes.every(write => Array.isArray(write.update)));
});

test('registration replaces every old copy of its endpoint while preserving other devices and literal metadata', async () => {
    const old = subscriptionFixture('phone'), other = subscriptionFixture('desktop');
    const fixture = new PushDatabase([old, other, old]);
    const refreshed = { ...subscriptionFixture('phone', 'new'), userAgent: '$untrusted.userAgent' };
    await savePushSubscription('owner', refreshed, fixture.asDb());
    assert.deepEqual(fixture.user!.pushSubscriptions, [other, refreshed]);
});

test('concurrent subscribe and unsubscribe preserve unrelated device updates', async () => {
    const old = subscriptionFixture('phone'), other = subscriptionFixture('desktop'), added = subscriptionFixture('tablet');
    const fixture = new PushDatabase([old, other]);
    await Promise.all([savePushSubscription('owner', added, fixture.asDb()), removePushSubscription('owner', old.endpoint, fixture.asDb())]);
    assert.deepEqual(fixture.user!.pushSubscriptions, [other, added]);
    assert.equal(fixture.reads, 0);
});

test('expired delivery only removes its original endpoint and key generation', async () => {
    const old = subscriptionFixture('phone'), other = subscriptionFixture('desktop');
    const fixture = new PushDatabase([old, other]);
    const refreshed = subscriptionFixture('phone', 'new');
    await savePushSubscription('owner', refreshed, fixture.asDb());
    await prunePushSubscription(fixture.user!._id, old, fixture.asDb());
    assert.deepEqual(fixture.user!.pushSubscriptions, [other, refreshed]);
    await prunePushSubscription(fixture.user!._id, refreshed, fixture.asDb());
    assert.deepEqual(fixture.user!.pushSubscriptions, [other]);
});

test('subscription writes cannot target another owner or an account whose access was removed', async () => {
    for (const flags of [{ disabled: true }, { softDelete: { isDeleted: true } }, { teamInvitationPending: true }]) {
        const fixture = new PushDatabase([subscriptionFixture('phone')]);
        Object.assign(fixture.user!, flags);
        assert.equal(await savePushSubscription('owner', subscriptionFixture('desktop'), fixture.asDb()), false);
        assert.equal(await removePushSubscription('owner', subscriptionFixture('phone').endpoint, fixture.asDb()), false);
        assert.equal(fixture.user!.pushSubscriptions!.length, 1);
    }
    const fixture = new PushDatabase([subscriptionFixture('phone')]);
    assert.equal(await savePushSubscription('other-owner', subscriptionFixture('desktop'), fixture.asDb()), false);
    assert.equal(await removePushSubscription('other-owner', subscriptionFixture('phone').endpoint, fixture.asDb()), false);
    assert.equal(fixture.user!.pushSubscriptions!.length, 1);
});
