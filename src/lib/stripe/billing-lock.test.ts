import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import type { User } from '@/lib/db/types';
import { billingFence, withBillingLease } from './billing-lock';
import { MemoryBillingDatabase, clone, userFixture } from './test-support';

test('an owned billing lease cannot write after customer generation or account revocation changes', async () => {
    for (const change of [
        { stripeCustomerGeneration: 2 }, { disabled: true }, { 'softDelete.isDeleted': true },
    ]) {
        const memory = new MemoryBillingDatabase(), db = memory.asDb();
        memory.collection('users').values.push(clone(userFixture({ stripeCustomerGeneration: 1 })) as never);
        await withBillingLease(db, 'owner', async (user, owner) => {
            const accounts = db.collection<User>('users');
            assert.equal((await accounts.updateOne(billingFence(user, owner), { $set: { unchangedProof: true } })).matchedCount, 1);
            await accounts.updateOne({ _id: user._id }, { $set: change });
            assert.equal((await accounts.updateOne(billingFence(user, owner), { $set: { staleWrite: true } })).matchedCount, 0);
        });
        assert.equal(memory.user().stripeBillingLease, undefined);
        assert.equal((memory.user() as unknown as Record<string, unknown>).staleWrite, undefined);
    }
});

test('a delayed worker cannot write after another worker replaces its expired billing lease', async () => {
    const memory = new MemoryBillingDatabase(), db = memory.asDb();
    memory.collection('users').values.push(clone(userFixture()) as never);
    await withBillingLease(db, 'owner', async (first, firstOwner) => {
        await db.collection('users').updateOne({ _id: first._id }, { $set: { 'stripeBillingLease.until': new Date(0) } });
        await withBillingLease(db, 'owner', async (current, currentOwner) => {
            assert.notEqual(firstOwner, currentOwner);
            assert.equal((await db.collection<User>('users').updateOne(billingFence(first, firstOwner), { $set: { stripeSyncedAt: new Date(0) } })).matchedCount, 0);
            assert.equal((await db.collection<User>('users').updateOne(billingFence(current, currentOwner), { $set: { stripeSyncedAt: new Date(1) } })).matchedCount, 1);
        });
    });
    assert.equal(memory.user().stripeSyncedAt?.getTime(), 1);
});

test('standalone Mongo fences expired billing workers and customer-generation changes', { skip: !process.env.VOSIFT_TEST_MONGODB_URI }, async () => {
    const client = new MongoClient(process.env.VOSIFT_TEST_MONGODB_URI!, { serverSelectionTimeoutMS: 15_000 });
    const db = client.db(`vt_billing_fence_${randomUUID().replaceAll('-', '').slice(0, 18)}`);
    try {
        await client.connect();
        const accounts = db.collection<User>('users');
        await accounts.insertOne(userFixture({ stripeCustomerGeneration: 1 }));
        await withBillingLease(db, 'owner', async (first, firstOwner) => {
            await accounts.updateOne({ _id: first._id }, { $set: { 'stripeBillingLease.until': new Date(0) } });
            await withBillingLease(db, 'owner', async (current, currentOwner) => {
                assert.equal((await accounts.updateOne(billingFence(first, firstOwner), { $set: { stripeSyncedAt: new Date(0) } })).matchedCount, 0);
                assert.equal((await accounts.updateOne(billingFence(current, currentOwner), { $set: { stripeSyncedAt: new Date(1) } })).matchedCount, 1);
                await accounts.updateOne({ _id: current._id }, { $inc: { stripeCustomerGeneration: 1 } });
                assert.equal((await accounts.updateOne(billingFence(current, currentOwner), { $set: { stripeSyncedAt: new Date(2) } })).matchedCount, 0);
            });
        });
        assert.equal((await accounts.findOne({ authSubject: 'owner' }))?.stripeSyncedAt?.getTime(), 1);
    } finally {
        await db.dropDatabase();
        await client.close();
    }
});
