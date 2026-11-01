import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { getMongoClient, getMongoDb } from '@/lib/mongodb';
import { enqueueUsageEvent, flushUsageEvents, type UsageEvent } from './usage-queue';
import { deleteUserData } from '@/lib/db/delete-user-data';
import { incrementStorageUsed, decrementStorageUsed } from '@/lib/db/users/usage';
import { usageTariffFixture, archiveUsageTariffFixture } from './usage-test-support';

// Opt-in: always uses its own randomly named database, never the application's data.
test('MongoDB usage delivery and account cleanup survive duplicates and external failures', {
    skip: !process.env.VOSIFT_TEST_MONGODB_URI,
}, async t => {
    const originalUri = process.env.MONGODB_URI;
    const uri = new URL(process.env.VOSIFT_TEST_MONGODB_URI!);
    uri.pathname = `/vt_usage_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    process.env.MONGODB_URI = uri.toString();
    const client = await getMongoClient();
    const db = await getMongoDb();
    const events = db.collection<UsageEvent>('usage_events');
    const epoch = Math.floor(Date.now() / 1000);
    const pair = usageTariffFixture();
    const input = { tariff: pair.storage, _id: 'storage-owner-period', authSubject: 'owner', customerId: 'cus_test', type: 'storage' as const, value: 100, timestamp: epoch };
    try {
        await archiveUsageTariffFixture(db, pair);
        await t.test('concurrent uploads retain the peak; deletion frees capacity; a new period starts a new peak', async () => {
            const period = new Date('2026-11-01');
            await db.collection('users').insertOne({ authSubject: 'storage', storageUsed: 0, storagePeakUsed: 0, stripeCurrentPeriodEnd: period });
            await Promise.all(Array.from({ length: 50 }, () => incrementStorageUsed('storage', 10, db)));
            await decrementStorageUsed('storage', 200, db);
            let user = await db.collection('users').findOne({ authSubject: 'storage' });
            assert.equal(user?.storageUsed, 300);
            assert.equal(user?.storagePeakUsed, 500);
            await db.collection('users').updateOne({ authSubject: 'storage' }, { $set: { stripeCurrentPeriodEnd: new Date('2026-12-01') } });
            await incrementStorageUsed('storage', 10, db);
            user = await db.collection('users').findOne({ authSubject: 'storage' });
            assert.equal(user?.storageUsed, 310);
            assert.equal(user?.storagePeakUsed, 310);
            await decrementStorageUsed('storage', 1000, db);
            assert.equal((await db.collection('users').findOne({ authSubject: 'storage' }))?.storageUsed, 0);
        });
        await t.test('concurrent duplicate submissions coalesce and lower peaks cannot overwrite larger ones', async () => {
            await Promise.all(Array.from({ length: 20 }, (_, i) => enqueueUsageEvent({ ...input, value: 100 + i }, db)));
            await enqueueUsageEvent({ ...input, value: 1, timestamp: epoch + 1 }, db);
            const sent: number[] = [];
            assert.deepEqual(await flushUsageEvents(10, { db, send: async event => { sent.push(event.value); } }), { sent: 1, failed: 0 });
            assert.deepEqual(sent, [119]);
            assert.equal((await events.findOne({ _id: input._id }))?.timestamp, epoch);
            assert.equal((await events.findOne({ _id: input._id }))?.pending, false);
        });
        await t.test('a newer peak arriving during delivery remains pending and sends next', async () => {
            await enqueueUsageEvent({ ...input, value: 200, timestamp: epoch + 1 }, db);
            const sent: number[] = [];
            assert.deepEqual(await flushUsageEvents(10, { db, send: async event => {
                sent.push(event.value);
                if (event.value === 200) {
                    await enqueueUsageEvent({ ...input, value: 300, timestamp: epoch + 2 }, db);
                    assert.deepEqual(await flushUsageEvents(10, { db, send: async () => { throw new Error('Lease violated'); } }), { sent: 0, failed: 0 });
                }
            } }), { sent: 2, failed: 0 });
            assert.deepEqual(sent, [200, 300]);
        });
        await t.test('failed delivery retries the same value and timestamp before sending a newer peak', async () => {
            await enqueueUsageEvent({ ...input, value: 400, timestamp: epoch + 3 }, db);
            assert.deepEqual(await flushUsageEvents(10, { db, send: async () => { throw new Error('Stripe offline'); } }), { sent: 0, failed: 1 });
            await enqueueUsageEvent({ ...input, value: 500, timestamp: epoch + 4 }, db);
            await events.updateOne({ _id: input._id }, { $set: { retryAt: new Date(0) } });
            const sent: [number, number][] = [];
            assert.deepEqual(await flushUsageEvents(10, { db, send: async event => { sent.push([event.value, event.timestamp]); } }), { sent: 2, failed: 0 });
            assert.deepEqual(sent, [[400, epoch + 3], [500, epoch + 4]]);
        });
        await t.test('concurrent conflicting storage tariffs cannot overwrite the accepted segment', async () => {
            const replacement = usageTariffFixture('recurring', { catalogVersion: 'replacement', storagePriceId: 'price_replacement_storage' });
            const attempts = [
                { ...input, _id: 'immutable-storage-segment', value: 100 },
                { ...input, _id: 'immutable-storage-segment', tariff: replacement.storage, value: 999 },
            ];
            const outcomes = await Promise.allSettled(attempts.map(value => enqueueUsageEvent(value, db)));
            assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
            assert.equal(outcomes.filter(value => value.status === 'rejected').length, 1);
            const accepted = await events.findOne({ _id: 'immutable-storage-segment' });
            const winner = attempts[outcomes.findIndex(value => value.status === 'fulfilled')];
            assert.deepEqual(accepted?.tariff, winner.tariff);
            assert.equal(accepted?.meterPriceId, winner.tariff.priceId);
            assert.equal(accepted?.value, winner.value);
            assert.equal(accepted?.unitAmountMicros, undefined);
        });
        await t.test('failed object deletion leaves all metadata and disables access until a successful retry', async () => {
            process.env.NEXT_PUBLIC_ENABLE_BILLING = 'false';
            const id = new ObjectId();
            await db.collection('users').insertOne({ _id: id, authSubject: 'cleanup', email: 'cleanup@example.com', disabled: false, softDelete: { isDeleted: false } });
            await db.collection('recordings').insertOne({ authSubject: 'cleanup', r2Key: 'audio' });
            await db.collection('export_jobs').insertOne({ authSubject: 'cleanup', parts: [{ key: 'archive' }] });
            let identitiesRemoved = 0;
            const first = await deleteUserData('cleanup', { db,
                removeObject: async key => { if (key === 'audio') throw new Error('Storage offline'); },
                removeIdentity: async () => { identitiesRemoved++; },
            });
            assert.equal(first.cleanupPending, true);
            assert.deepEqual(first.r2Failures, ['audio']);
            assert.equal(identitiesRemoved, 0);
            assert.equal(await db.collection('recordings').countDocuments({ authSubject: 'cleanup' }), 1);
            const user = await db.collection('users').findOne({ _id: id });
            assert.equal(user?.disabled, true);
            assert.equal(user?.softDelete.isDeleted, true);
            const second = await deleteUserData('cleanup', { db, removeObject: async () => {}, removeIdentity: async () => { identitiesRemoved++; } });
            assert.equal(second.cleanupPending, false);
            assert.equal(identitiesRemoved, 1);
            assert.equal(await db.collection('users').countDocuments({ _id: id }), 0);
            assert.equal(await db.collection('recordings').countDocuments({ authSubject: 'cleanup' }), 0);
            assert.equal(await db.collection('export_jobs').countDocuments({ authSubject: 'cleanup' }), 0);
        });
    } finally {
        await db.dropDatabase();
        await client.close();
        process.env.MONGODB_URI = originalUri;
    }
});
