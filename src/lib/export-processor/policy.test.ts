import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId, type Db } from 'mongodb';
import { getExportSourceSnapshot, isReusableExport } from './policy';
import { cleanupExpiredExports } from './cleanup';
import { ARCHIVE_TTL_MS, DOWNLOAD_LINK_TTL_SECONDS, EXPORT_CACHE_MS } from './constants';

test('archive cache requires the exact full revision and expires after 24 hours', () => {
    const now = new Date();
    const job = { status: 'completed', sourceRevision: 'revision', completedAt: new Date(now.getTime() - 1000), archiveExpiresAt: new Date(now.getTime() + ARCHIVE_TTL_MS), cacheEligible: true };
    assert.equal(isReusableExport(job, 'revision', now), true);
    assert.equal(isReusableExport(job, 'changed', now), false);
    assert.equal(isReusableExport({ ...job, completedAt: new Date(now.getTime() - EXPORT_CACHE_MS) }, 'revision', now), false);
    assert.equal(isReusableExport({ ...job, cleanedAt: now }, 'revision', now), false);
    assert.equal(isReusableExport({ ...job, cacheEligible: false }, 'revision', now), false);
    assert.equal(isReusableExport({ ...job, cleanupPending: true }, 'revision', now), false);
    assert.equal(isReusableExport({ ...job, abortedAt: now }, 'revision', now), false);
    assert.equal(DOWNLOAD_LINK_TTL_SECONDS, 15 * 60);
});

test('an older recording edit invalidates the revision even if latest modification/count/bytes stay unchanged', async () => {
    const rows = [
        { _id: new ObjectId('507f1f77bcf86cd799439011'), updatedAt: new Date('2026-01-01'), fileSize: 100, documentBytes: 50 },
        { _id: new ObjectId('507f1f77bcf86cd799439012'), updatedAt: new Date('2026-10-01'), fileSize: 100, documentBytes: 50 },
    ];
    const db = { collection: () => ({ aggregate: () => ({ async *[Symbol.asyncIterator]() { for (const row of rows) yield row; } }) }) } as unknown as Db;
    const before = await getExportSourceSnapshot('owner', db);
    rows[0].updatedAt = new Date('2026-02-01');
    const after = await getExportSourceSnapshot('owner', db);
    assert.notEqual(before.revision, after.revision);
    assert.equal(before.bytes, after.bytes);
    assert.equal(before.count, after.count);
});

test('managed archive admission rejects unknown source byte sizes before any storage read', async t => {
    const previous = process.env.NEXT_PUBLIC_ENABLE_BILLING;
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    t.after(() => { if (previous === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING; else process.env.NEXT_PUBLIC_ENABLE_BILLING = previous; });
    const row = { _id: new ObjectId(), updatedAt: new Date(), fileSize: 0, documentBytes: 50 };
    const db = { collection: () => ({ aggregate: () => ({ async *[Symbol.asyncIterator]() { yield row; } }) }) } as unknown as Db;
    await assert.rejects(getExportSourceSnapshot('owner', db), /sizes must be verified/);
});

test('archive deletion retries actual objects and retains metadata after a storage failure', async () => {
    const job = { _id: new ObjectId(), authSubject: 'owner', status: 'completed', parts: [{ key: 'archive' }], archiveExpiresAt: new Date(0) } as Record<string, unknown>;
    const db = { collection: (name: string) => name === 'export_object_cleanup' ? {
        find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => [] }) }) }), updateMany: async () => ({ modifiedCount: 0 }),
    } : ({
        find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => job.cleanedAt ? [] : [job] }) }) }),
        findOne: async () => job,
        updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => { Object.assign(job, update.$set); return { matchedCount: 1 }; },
    }) } as unknown as Db;
    const prefixes: string[] = [];
    await assert.rejects(cleanupExpiredExports(10, { db, removePrefix: async prefix => { prefixes.push(prefix); throw new Error('Storage unavailable'); } }), /Storage unavailable/);
    assert.equal(job.cleanedAt, undefined);
    assert.equal((job.parts as unknown[]).length, 1);
    assert.equal(job.cleanupPending, true);
    assert.deepEqual(await cleanupExpiredExports(10, { db, removePrefix: async prefix => { prefixes.push(prefix); } }), { checked: 1, cleaned: 1 });
    assert.equal(prefixes[0], `exports/owner/${job._id}/`);
    assert.equal(prefixes[1], prefixes[0]);
    assert.deepEqual(job.parts, []);
    assert.ok((job.cleanedAt as unknown) instanceof Date);
});
