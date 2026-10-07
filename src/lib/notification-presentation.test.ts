import test from 'node:test';
import assert from 'node:assert/strict';
import type { NotificationResponse } from './db/types';
import { getNotificationActionLabel, getNotificationTimestamp, observeNotifications } from './notification-presentation';

const item = (id: string, isRead = false): NotificationResponse => ({
    id, isRead, type: 'info', title: id, message: 'Update', createdAt: '2026-10-06T12:00:00Z',
});

test('initial notification load establishes a baseline without announcing history', () => {
    const observed = observeNotifications([item('old'), item('read', true)]);
    assert.deepEqual(observed.newUnread, []);
    assert.deepEqual([...observed.seen], ['old', 'read']);
});

test('detects new IDs even when the unread count stays the same', () => {
    const first = observeNotifications([item('first')]);
    const second = observeNotifications([item('first', true), item('second')], first.seen);
    assert.deepEqual(second.newUnread.map((notification) => notification.id), ['second']);
});

test('repeated polls and returning read notifications do not announce duplicates', () => {
    const first = observeNotifications([item('first')]);
    const second = observeNotifications([item('second')], first.seen);
    const third = observeNotifications([item('second'), item('first'), item('read', true)], second.seen);
    assert.deepEqual(third.newUnread, []);
    assert.deepEqual([...first.seen], ['first']);
});

test('multiple arrivals are detected once and in response order', () => {
    const first = observeNotifications([]);
    const arrivals = [item('one'), item('two'), item('one'), item('already-read', true)];
    const second = observeNotifications(arrivals, first.seen);
    assert.deepEqual(second.newUnread.map((notification) => notification.id), ['one', 'two']);
    assert.deepEqual(observeNotifications(arrivals, second.seen).newUnread, []);
});

test('destination labels preserve recording and settings deep-link meaning', () => {
    assert.equal(getNotificationActionLabel('/recordings?id=abc&contact=def'), 'Open recording');
    assert.equal(getNotificationActionLabel('/recordings'), 'Open page');
    assert.equal(getNotificationActionLabel('/settings?tab=billing'), 'View billing');
    assert.equal(getNotificationActionLabel('/settings?tab=notifications'), 'View settings');
    assert.equal(getNotificationActionLabel('/admin'), 'Open page');
    assert.equal(getNotificationActionLabel('https://example.com/settings'), 'Open page');
});

test('timestamps handle minute/hour/day boundaries and older dates', () => {
    const now = Date.parse('2026-10-06T12:00:00Z');
    const at = (seconds: number) => getNotificationTimestamp(new Date(now - seconds * 1000).toISOString(), now);
    assert.equal(at(59).relative, 'Just now');
    assert.equal(at(60).relative, '1 min. ago');
    assert.equal(at(3599).relative, '59 min. ago');
    assert.equal(at(3600).relative, '1 hr. ago');
    assert.equal(at(86400).relative, 'yesterday');
    assert.equal(at(604799).relative, '6 days ago');
    assert.match(at(604800).relative, /2026/);
    assert.ok(at(60).absolute.length > at(60).relative.length);
});

test('timestamps safely handle invalid dates and clock skew', () => {
    assert.deepEqual(getNotificationTimestamp('invalid'), { relative: 'Date unavailable', absolute: 'Date unavailable' });
    const now = Date.parse('2026-10-06T12:00:00Z');
    assert.equal(getNotificationTimestamp('2026-10-06T12:01:00Z', now).relative, 'Just now');
});
