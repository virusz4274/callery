import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { NextRequest } from 'next/server';

type FixtureRecording = { authSubject: string; recordedAt: Date; duration: number; contactName: string | null; phoneNumber: string };
type FixtureUser = { authSubject: string; email: string; notificationSettings: { activityDigest: 'weekly' | 'monthly' } };
type DigestMatch = { authSubject: string; recordedAt: { $gte: Date; $lt: Date } };
type Fixture = {
    recordings: FixtureRecording[];
    users: FixtureUser[];
    matches: DigestMatch[];
    emails: { to: string; subject: string; html: string }[];
    database: unknown;
};
const key = Symbol.for('vosift.test.digest-boundaries');
const root = globalThis as typeof globalThis & { [key]: Fixture };
const prelude = `const state=()=>globalThis[Symbol.for('vosift.test.digest-boundaries')];`;
const modules: Record<string, string> = {
    '@/lib/mongodb': `export const Collections={RECORDINGS:'recordings',USERS:'users'};export async function getMongoDb(){return state().database;}`,
    '@/lib/email': `export async function sendNotificationEmail(message){state().emails.push(message);return true;}`,
    '@/lib/access-control-common': `export function checkUserAccess(){return {allowed:true};}`,
    '@/lib/logger': `export const logger={info(){},error(){}};`,
};
const hook = registerHooks({
    resolve(specifier, context, next) {
        const source = /(?:\/lib\/email\/notifications|\/api\/cron\/digest\/route)\.ts$/.test(context.parentURL || '') ? modules[specifier] : undefined;
        return source ? { url: `data:text/javascript,${encodeURIComponent(prelude + source)}`, shortCircuit: true } : next(specifier, context);
    },
});
const { collectDigestStats, digestWindow } = await import('./notifications');
const { GET } = await import('@/app/api/cron/digest/route');
after(() => hook.deregister());

function setup() {
    const fixture: Fixture = {
        recordings: [], users: [], matches: [], emails: [],
        database: { collection(name: string) {
            if (name === 'users') return { find: () => ({ toArray: async () => fixture.users }) };
            assert.equal(name, 'recordings');
            return { aggregate(pipeline: { $match?: DigestMatch; $group?: { _id: unknown } }[]) {
                const match = pipeline[0].$match!;
                fixture.matches.push(structuredClone(match));
                const rows = fixture.recordings.filter(row => row.authSubject === match.authSubject
                    && row.recordedAt >= match.recordedAt.$gte && row.recordedAt < match.recordedAt.$lt);
                return { async toArray() {
                    if (pipeline[1].$group?._id === null) return rows.length ? [{ recordings: rows.length, seconds: rows.reduce((sum, row) => sum + row.duration, 0) }] : [];
                    const contacts = new Map<string, number>();
                    for (const row of rows) {
                        const name = row.contactName ?? row.phoneNumber;
                        contacts.set(name, (contacts.get(name) ?? 0) + 1);
                    }
                    return [...contacts].map(([_id, count]) => ({ _id, count })).sort((a, b) => b.count - a.count).slice(0, 3);
                } };
            } };
        } },
    };
    root[key] = fixture;
    return fixture;
}

test('monthly windows cover exactly the previous UTC calendar month across leap and year rollovers', () => {
    for (const [run, since, until, days] of [
        ['2028-03-01T08:00:00.000Z', '2028-02-01T00:00:00.000Z', '2028-03-01T00:00:00.000Z', 29],
        ['2026-03-01T23:59:59.999Z', '2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z', 28],
        ['2027-01-01T08:00:00.000Z', '2026-12-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z', 31],
    ] as const) {
        const now = new Date(run);
        const window = digestWindow('monthly', now)!;
        assert.equal(window.period, 'monthly');
        assert.equal(window.since.toISOString(), since);
        assert.equal(window.until.toISOString(), until);
        assert.equal((window.until.getTime() - window.since.getTime()) / 86_400_000, days);
        assert.equal(now.toISOString(), run);
    }
});

test('weekly windows preserve Monday eligibility and the rolling seven days ending at the captured run', () => {
    const now = new Date('2026-11-09T08:12:34.567Z');
    const window = digestWindow('weekly', now)!;
    assert.equal(window.period, 'weekly');
    assert.equal(window.since.toISOString(), '2026-11-02T08:12:34.567Z');
    assert.equal(window.until.toISOString(), now.toISOString());
    assert.notEqual(window.until, now);
    assert.equal(digestWindow('weekly', new Date('2026-11-10T08:00:00.000Z')), null);
    assert.equal(digestWindow('monthly', new Date('2026-11-02T08:00:00.000Z')), null);
    assert.equal(digestWindow('monthly', new Date('2026-03-01T00:00:00+05:30')), null);
    assert.equal(digestWindow('off', now), null);
});

test('both digest aggregates include the start and exclude the end, future calls and other owners', async () => {
    const fixture = setup();
    const since = new Date('2026-01-01T00:00:00.000Z');
    const until = new Date('2026-02-01T00:00:00.000Z');
    fixture.recordings = [
        { authSubject: 'owner', recordedAt: new Date(since.getTime() - 1), duration: 900, contactName: 'Too old', phoneNumber: '' },
        { authSubject: 'owner', recordedAt: since, duration: 60, contactName: 'Ada', phoneNumber: '' },
        { authSubject: 'owner', recordedAt: new Date('2026-01-15T10:00:00.000Z'), duration: 61.2, contactName: 'Ada', phoneNumber: '' },
        { authSubject: 'owner', recordedAt: new Date(until.getTime() - 1), duration: 30, contactName: null, phoneNumber: '123' },
        { authSubject: 'owner', recordedAt: until, duration: 900, contactName: 'Next month', phoneNumber: '' },
        { authSubject: 'owner', recordedAt: new Date('2027-01-01T00:00:00.000Z'), duration: 900, contactName: 'Future', phoneNumber: '' },
        { authSubject: 'another-owner', recordedAt: new Date('2026-01-15T10:00:00.000Z'), duration: 900, contactName: 'Private contact', phoneNumber: '' },
    ];
    assert.deepEqual(await collectDigestStats('owner', since, until), {
        recordings: 3, seconds: 151, topContacts: [{ name: 'Ada', count: 2 }, { name: '123', count: 1 }],
    });
    assert.deepEqual(fixture.matches, Array.from({ length: 2 }, () => ({ authSubject: 'owner', recordedAt: { $gte: since, $lt: until } })));
    assert.deepEqual(await collectDigestStats('another-owner', since, until), {
        recordings: 1, seconds: 900, topContacts: [{ name: 'Private contact', count: 1 }],
    });
    assert.deepEqual(await collectDigestStats('empty-owner', since, until), { recordings: 0, seconds: 0, topContacts: [] });
});

test('digest cron passes the closed monthly period through to totals and contact counts', async t => {
    const fixture = setup();
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2028-03-01T08:00:00.000Z') });
    const originalSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'digest-fixture-secret';
    t.after(() => { if (originalSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = originalSecret; });
    fixture.users = [
        { authSubject: 'monthly-owner', email: 'monthly@example.test', notificationSettings: { activityDigest: 'monthly' } },
        { authSubject: 'weekly-owner', email: 'weekly@example.test', notificationSettings: { activityDigest: 'weekly' } },
    ];
    fixture.recordings = [
        { authSubject: 'monthly-owner', recordedAt: new Date('2028-02-01T00:00:00.000Z'), duration: 60, contactName: 'Previous month', phoneNumber: '' },
        { authSubject: 'monthly-owner', recordedAt: new Date('2028-02-29T23:59:59.999Z'), duration: 60, contactName: 'Previous month', phoneNumber: '' },
        { authSubject: 'monthly-owner', recordedAt: new Date('2028-03-01T01:00:00.000Z'), duration: 600, contactName: 'Current month', phoneNumber: '' },
    ];
    const response = await GET(new NextRequest('https://app.example.test/api/cron/digest', { headers: { authorization: 'Bearer digest-fixture-secret' } }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, sent: 1, skipped: 1 });
    assert.equal(fixture.emails.length, 1);
    assert.equal(fixture.emails[0].to, 'monthly@example.test');
    assert.match(fixture.emails[0].html, /<strong>2<\/strong> recordings/);
    assert.doesNotMatch(fixture.emails[0].html, /Current month/);
    assert.deepEqual(fixture.matches, Array.from({ length: 2 }, () => ({
        authSubject: 'monthly-owner', recordedAt: { $gte: new Date('2028-02-01T00:00:00.000Z'), $lt: new Date('2028-03-01T00:00:00.000Z') },
    })));
});
