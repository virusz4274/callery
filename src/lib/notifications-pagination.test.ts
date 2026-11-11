import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { ObjectId } from 'mongodb';
import type { Notification, NotificationResponse } from './db/types';
import type { NotificationPageOptions } from './notification-pagination';
import { compareNotificationOrder, mergeNotificationHistory } from './notification-pagination';

type Filter = Record<string, unknown>;
type State = { rows: Notification[]; limits: number[]; connections: number };
const key = Symbol.for('vosift.test.notification-pagination');
const shared = globalThis as typeof globalThis & { [key]: State };
const s = `globalThis[Symbol.for('vosift.test.notification-pagination')]`;
function matches(row: Notification, filter: Filter): boolean {
    return Object.entries(filter).every(([field, value]) => {
        if (field === '$or') return (value as Filter[]).some(branch => matches(row, branch));
        const actual = row[field as keyof Notification];
        if (value instanceof ObjectId) return actual instanceof ObjectId && actual.equals(value);
        if (value instanceof Date) return actual instanceof Date && actual.getTime() === value.getTime();
        if (value && typeof value === 'object' && '$lt' in value) {
            const before = (value as { $lt: Date | ObjectId }).$lt;
            return actual instanceof Date && before instanceof Date ? actual.getTime() < before.getTime()
                : actual instanceof ObjectId && before instanceof ObjectId && actual.toHexString() < before.toHexString();
        }
        return actual === value;
    });
}
const stateDb = {
    collection() {
        const state = shared[key];
        return {
            find(filter: Filter) {
                let rows = state.rows.filter(row => matches(row, filter));
                const cursor = {
                    sort(sort: Record<string, number>) {
                        assert.deepEqual(sort, { createdAt: -1, _id: -1 });
                        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b._id.toHexString().localeCompare(a._id.toHexString()));
                        return cursor;
                    },
                    limit(limit: number) { state.limits.push(limit); rows = rows.slice(0, limit); return cursor; },
                    async toArray() { return rows; },
                };
                return cursor;
            },
            async countDocuments(filter: Filter) { return state.rows.filter(row => matches(row, filter)).length; },
            async updateOne(filter: Filter, update: { $set: Partial<Notification> }) {
                const row = state.rows.find(item => matches(item, filter));
                if (row) Object.assign(row, update.$set);
            },
            async updateMany(filter: Filter, update: { $set: Partial<Notification> }) {
                state.rows.filter(row => matches(row, filter)).forEach(row => Object.assign(row, update.$set));
            },
            async deleteMany(filter: Filter) { state.rows = state.rows.filter(row => !matches(row, filter)); },
        };
    },
};
const dbKey = Symbol.for('vosift.test.notification-pagination-db');
(globalThis as typeof globalThis & { [dbKey]: typeof stateDb })[dbKey] = stateDb;
const hooks = registerHooks({ resolve(specifier, context, next) {
    let source: string | undefined;
    if (context.parentURL?.endsWith('/lib/notifications.ts')) {
        if (specifier === '@/lib/mongodb') source = `export const Collections={NOTIFICATIONS:'notifications',USERS:'users'};export async function getMongoDb(){${s}.connections++;return globalThis[Symbol.for('vosift.test.notification-pagination-db')];}`;
        if (specifier === '@/lib/web-push') source = 'export async function sendWebPushNotification(){return {success:true}}';
    }
    return source ? { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true } : next(specifier, context);
} });
const { getNotifications, markAsRead, markAllAsRead, deleteAllNotifications } = await import('./notifications');
hooks.deregister();

const owner = new ObjectId(), other = new ObjectId();
function setup(count = 125) {
    const rows: Notification[] = Array.from({ length: count }, (_, i) => ({
        _id: new ObjectId((i + 1).toString(16).padStart(24, '0')), userId: owner,
        title: `Notification ${i + 1}`, message: 'Saved processing result', type: 'info',
        createdAt: new Date('2026-11-11T12:00:00.000Z'), isRead: i >= 75,
    }));
    rows.push({ ...rows[0], _id: new ObjectId(), userId: other, title: 'Other owner private notification', isRead: false });
    const state: State = { rows, limits: [], connections: 0 };
    shared[key] = state;
    return state;
}

test('default history is bounded while unread count covers older pages and excludes other owners', async () => {
    const state = setup();
    const page = await getNotifications(owner);
    assert.equal(page.notifications.length, 20);
    assert.equal(page.unreadCount, 75);
    assert.equal(page.notifications.every(item => item.isRead), true);
    assert.equal(page.notifications.some(item => item.title.includes('private')), false);
    assert.deepEqual(state.limits, [21]);
    assert.ok(page.nextCursor);
});

test('cursor ordering traverses equal timestamps exactly once despite new inserts', async () => {
    const state = setup();
    let page = await getNotifications(owner);
    const visited = page.notifications.map(item => item.id);
    state.rows.push({ ...state.rows[0], _id: new ObjectId('ffffffffffffffffffffffff'), title: 'New arrival' });
    while (page.nextCursor) {
        page = await getNotifications(owner, { cursor: page.nextCursor });
        visited.push(...page.notifications.map(item => item.id));
    }
    assert.equal(visited.length, 125);
    assert.equal(new Set(visited).size, 125);
    assert.equal(visited.includes('ffffffffffffffffffffffff'), false);
    assert.equal(state.limits.every(limit => limit === 21), true);
});

test('cursor pages move across dates and timestamp ties without gaps', async () => {
    const state = setup(65);
    state.rows.filter(row => row.userId.equals(owner)).forEach((row, i) => { row.createdAt = new Date(row.createdAt.getTime() - Math.floor(i / 10) * 1000); });
    let page = await getNotifications(owner);
    const visited = page.notifications.map(row => row.id);
    while (page.nextCursor) {
        page = await getNotifications(owner, { cursor: page.nextCursor });
        visited.push(...page.notifications.map(row => row.id));
    }
    assert.equal(visited.length, 65);
    assert.equal(new Set(visited).size, 65);
    const expected = state.rows.filter(row => row.userId.equals(owner)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b._id.toHexString().localeCompare(a._id.toHexString()));
    assert.deepEqual(visited, expected.map(row => row._id.toHexString()));
});

test('page size and cursor validation happen before any database access', async () => {
    const state = setup();
    const invalid: unknown[] = [null, [], { limit: 0 }, { limit: -1 }, { limit: 101 }, { limit: 1.5 }, { limit: null }, { limit: NaN }, { limit: Infinity },
        { cursor: '' }, { cursor: null }, { cursor: 'not-a-cursor' }, { cursor: '2026-02-30T12:00:00.000Z_000000000000000000000001' }, { limit: 20, extra: true }];
    for (const options of invalid) await assert.rejects(getNotifications(owner, options as NotificationPageOptions), /Invalid notification/);
    assert.equal(state.connections, 0);
    assert.equal((await getNotifications(owner, { limit: 100 })).notifications.length, 100);
    assert.deepEqual(state.limits, [101]);
});

test('individual reads are owner scoped and whole-history mutations include unloaded pages', async () => {
    const state = setup();
    const privateRow = state.rows.find(row => row.userId.equals(other))!;
    await markAsRead(privateRow._id.toHexString(), owner);
    assert.equal(privateRow.isRead, false);
    await assert.rejects(markAsRead('bad', owner), /Invalid notification ID/);
    await markAllAsRead(owner);
    assert.equal((await getNotifications(owner)).unreadCount, 0);
    assert.equal(privateRow.isRead, false);
    await deleteAllNotifications(owner);
    assert.deepEqual(await getNotifications(owner), { notifications: [], unreadCount: 0, nextCursor: null });
    assert.equal(state.rows.length, 1);
    assert.equal(state.rows[0].title, 'Other owner private notification');
});

test('history merging keeps older rows, updates read state and sorts without duplicates', () => {
    const item = (id: string, isRead = false): NotificationResponse => ({ id, isRead, title: id, message: '', type: 'info', createdAt: '2026-11-11T12:00:00.000Z' });
    const previous = [item('c'), item('b'), item('a')];
    const merged = mergeNotificationHistory(previous, [item('d'), item('c', true)]);
    assert.deepEqual(merged.map(row => row.id), ['d', 'c', 'b', 'a']);
    assert.equal(merged[1].isRead, true);
    assert.equal(previous[0].isRead, false);
    assert.ok(compareNotificationOrder(item('d'), item('c')) < 0);
});
