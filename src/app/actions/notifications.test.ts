import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { ObjectId } from 'mongodb';
import type { NotificationPage } from '@/lib/notification-pagination';

type State = { actor: string | null; found: boolean; userId: ObjectId; calls: unknown[][]; page: NotificationPage };
const key = Symbol.for('vosift.test.notification-actions');
const shared = globalThis as typeof globalThis & { [key]: State };
const s = `globalThis[Symbol.for('vosift.test.notification-actions')]`;
const hooks = registerHooks({ resolve(specifier, context, next) {
    let source: string | undefined;
    if (context.parentURL?.endsWith('/actions/notifications.ts')) {
        if (specifier === '@/lib/auth-utils') source = `export async function getAuthSubjectFromSession(){return ${s}.actor;}`;
        if (specifier === '@/lib/db/users') source = `export async function findUserByAuthSubject(subject){${s}.calls.push(['owner',subject]);return ${s}.found?{_id:${s}.userId}:null;}`;
        if (specifier === '@/lib/notifications') source = `export async function getNotifications(...args){${s}.calls.push(['page',...args]);return ${s}.page;}
            export async function markAsRead(...args){${s}.calls.push(['read',...args]);}
            export async function markAllAsRead(...args){${s}.calls.push(['read-all',...args]);}
            export async function deleteAllNotifications(...args){${s}.calls.push(['clear-all',...args]);}
            export async function createNotification(){}`;
    }
    return source ? { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true } : next(specifier, context);
} });
const { fetchNotifications, readNotification, readAllNotifications, clearAllNotifications } = await import('./notifications');
hooks.deregister();
function setup() {
    const state: State = { actor: 'current-owner', found: true, userId: new ObjectId(), calls: [], page: { notifications: [], unreadCount: 55, nextCursor: 'next' } };
    shared[key] = state;
    return state;
}

test('signed-out or missing-profile sessions get an empty notification page and cannot mutate history', async () => {
    for (const mode of ['signed-out', 'missing-profile']) {
        const state = setup();
        if (mode === 'signed-out') state.actor = null;
        else state.found = false;
        assert.deepEqual(await fetchNotifications(), { notifications: [], unreadCount: 0, nextCursor: null });
        await readNotification(new ObjectId().toHexString());
        await readAllNotifications(); await clearAllNotifications();
        assert.equal(state.calls.some(call => call[0] !== 'owner'), false);
    }
});

test('page and history mutations derive the owner from the session, never from pagination input', async () => {
    const state = setup();
    const options = { limit: 20, cursor: 'cursor-validated-in-data-layer' };
    assert.deepEqual(await fetchNotifications(options), state.page);
    const id = new ObjectId().toHexString();
    await readNotification(id); await readAllNotifications(); await clearAllNotifications();
    assert.deepEqual(state.calls.filter(call => call[0] !== 'owner'), [
        ['page', state.userId, options], ['read', id, state.userId], ['read-all', state.userId], ['clear-all', state.userId],
    ]);
    assert.equal(state.calls.filter(call => call[0] === 'owner').every(call => call[1] === state.actor), true);
});
