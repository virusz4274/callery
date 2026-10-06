import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { NextRequest } from 'next/server';
import { Collections, getMongoClient, getMongoDb } from '@/lib/mongodb';
import { createCoreIndexes } from '@/lib/db/init/indexes';
import { seedPlans, seedSystemSettings } from '@/lib/db/init/seed';
import { findUserByAuthSubject } from '@/lib/db/users';
import { updateSystemSettingsDocument } from '@/lib/db/system-settings';
import { deleteUserData } from '@/lib/db/delete-user-data';
import { getRequestIdentity } from '@/lib/auth-utils';
import type { SendEmailInput } from '@/lib/email';
import { createAuth } from './server';

// Real adapter records on a fresh database, including standalone MongoDB.
test('Better Auth authentication, verification and permanent cleanup', {
    skip: !process.env.VOSIFT_TEST_MONGODB_URI,
}, async t => {
    const saved = { ...process.env };
    const uri = new URL(process.env.VOSIFT_TEST_MONGODB_URI!);
    uri.pathname = `/vosift_auth_tests_${randomUUID().replaceAll('-', '')}`;
    process.env.MONGODB_URI = uri.toString();
    process.env.EMAIL_PROVIDER = 'none';
    process.env.ADMIN_EMAILS = 'bootstrap@example.com,verified-admin@example.com';
    const client = await getMongoClient();
    const db = await getMongoDb();
    const base = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth`;
    const password = 'FixturePassword123!';
    const auth = createAuth(db);
    const call = (instance: ReturnType<typeof createAuth>, path: string, body?: Record<string, unknown>, headers?: HeadersInit) =>
        instance.handler(new Request(`${base}${path}`, {
            method: body ? 'POST' : 'GET',
            headers: { origin: process.env.NEXT_PUBLIC_APP_URL!, ...(body ? { 'content-type': 'application/json' } : {}), ...Object.fromEntries(new Headers(headers)) },
            ...(body ? { body: JSON.stringify(body) } : {}),
        }));
    const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
    let subject: string;
    let token: string;
    try {
        await createCoreIndexes(db, Collections);
        await seedPlans(db, Collections);
        await seedSystemSettings(db, Collections);

        await t.test('signup creates complete profiles, verified admins and cookie/bearer sessions', async () => {
            const response = await call(auth, '/sign-up/email', { name: 'Bootstrap Admin', email: 'bootstrap@example.com', password });
            assert.equal(response.status, 200, await response.clone().text());
            const body = await response.json();
            subject = body.user.id;
            token = body.token;
            assert.ok(token);
            assert.equal(body.user.emailVerified, true);
            const cookie = response.headers.get('set-cookie')!;
            assert.match(cookie, /HttpOnly/i);
            assert.match(cookie, /SameSite=Lax/i);
            const sessionCookie = cookie.split(';')[0];
            const byCookie = await call(auth, '/get-session', undefined, { cookie: sessionCookie });
            const byBearer = await call(auth, '/get-session', undefined, bearer(token));
            assert.equal((await byCookie.json()).user.id, subject);
            assert.equal((await byBearer.json()).user.id, subject);
            assert.equal((await getRequestIdentity(new NextRequest(base, { headers: bearer(token) })))?.subject, subject);
            const profile = await findUserByAuthSubject(subject);
            assert.equal(profile?.role, 'admin');
            assert.deepEqual(profile?.googleSync, { status: 'not_connected', lastError: null });
            assert.deepEqual(profile?.transcriptionSettings, { autoTranscribe: true });
            assert.equal(profile?.storagePeakUsed, 0);
            assert.equal('authProvider' in profile!, false);
            assert.equal((await db.collection('account').findOne({ userId: new ObjectId(subject) }))?.providerId, 'credential');
            const accounts = await call(auth, '/list-accounts', undefined, bearer(token));
            assert.equal((await accounts.json()).some((account: { providerId: string }) => account.providerId === 'credential'), true);
        });

        await t.test('disabled and deleted accounts reject existing sessions and new logins', async () => {
            for (const patch of [{ disabled: true }, { disabled: false, softDelete: { isDeleted: true } }]) {
                await db.collection(Collections.USERS).updateOne({ authSubject: subject }, { $set: patch });
                assert.equal(await getRequestIdentity(new NextRequest(base, { headers: bearer(token) })), null);
                const login = await call(auth, '/sign-in/email', { email: 'bootstrap@example.com', password });
                assert.equal(login.status, 403);
            }
            await db.collection(Collections.USERS).updateOne({ authSubject: subject }, { $set: { disabled: false }, $unset: { softDelete: '' } });
        });

        await t.test('signup restrictions allow existing users to log in', async () => {
            await updateSystemSettingsDocument({ allowSignups: false });
            const signup = await call(auth, '/sign-up/email', { name: 'Blocked', email: 'blocked@example.com', password });
            assert.equal(signup.status, 403);
            assert.equal(await db.collection('user').countDocuments({ email: 'blocked@example.com' }), 0);
            const login = await call(auth, '/sign-in/email', { email: 'bootstrap@example.com', password });
            assert.equal(login.status, 200);
            await updateSystemSettingsDocument({ allowSignups: true });
        });

        await t.test('login repairs missing profiles idempotently', async () => {
            await db.collection(Collections.USERS).deleteOne({ authSubject: subject });
            for (let attempt = 0; attempt < 2; attempt++) {
                const response = await call(auth, '/sign-in/email', { email: 'bootstrap@example.com', password });
                assert.equal(response.status, 200);
            }
            assert.equal(await db.collection(Collections.USERS).countDocuments({ authSubject: subject }), 1);
            assert.equal((await findUserByAuthSubject(subject))?.role, 'admin');
        });

        await t.test('session expiry, logout and disabled recovery invalidate access', async () => {
            let response = await call(auth, '/sign-in/email', { email: 'bootstrap@example.com', password });
            const expiring = (await response.json()).token;
            await db.collection('session').updateOne({ token: expiring }, { $set: { expiresAt: new Date(0) } });
            assert.equal(await (await call(auth, '/get-session', undefined, bearer(expiring))).json(), null);
            response = await call(auth, '/sign-out', {}, bearer(token));
            assert.equal(response.status, 200);
            assert.match(response.headers.get('set-cookie')!, /Max-Age=0/i);
            assert.equal(await (await call(auth, '/get-session', undefined, bearer(token))).json(), null);
            assert.equal(await (await call(auth, '/get-session', undefined, bearer('invalid-token'))).json(), null);
            for (const path of ['/request-password-reset', '/reset-password', '/send-verification-email']) {
                assert.equal((await call(auth, path, { email: 'bootstrap@example.com', newPassword: password, token: 'none' })).status, 404);
            }
        });

        await t.test('Google uses identity-only scopes and a distinct callback, with safe destinations', async () => {
            const response = await call(auth, '/sign-in/social', { provider: 'google', callbackURL: '/upload', disableRedirect: true });
            assert.equal(response.status, 200);
            const url = new URL((await response.json()).url);
            assert.equal(url.searchParams.get('client_id'), process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
            assert.equal(url.searchParams.get('redirect_uri'), `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`);
            assert.equal(url.searchParams.get('scope')?.includes('contacts'), false);
            assert.match(url.searchParams.get('scope')!, /openid/);
            const unsafe = await call(auth, '/sign-in/social', { provider: 'google', callbackURL: 'https://evil.example/escape' });
            assert.equal(unsafe.status, 403);
        });

        process.env.EMAIL_PROVIDER = 'smtp';
        const emails: SendEmailInput[] = [];
        const mailAuth = createAuth(db, async email => { emails.push(email); });
        let verifiedSubject: string;
        let verifiedToken: string;
        await t.test('verification-required and duplicate signup are generic; verification bootstraps admin', async () => {
            const signup = { name: 'Verified Admin', email: 'verified-admin@example.com', password, callbackURL: '/login?redirect=%2Fcontacts' };
            const response = await call(mailAuth, '/sign-up/email', signup);
            assert.equal(response.status, 200);
            const body = await response.json();
            verifiedSubject = body.user.id;
            assert.equal(body.token, null);
            assert.equal(response.headers.get('set-cookie'), null);
            assert.equal((await findUserByAuthSubject(verifiedSubject))?.role, 'user');
            assert.equal((await call(mailAuth, '/sign-in/email', { email: signup.email, password })).status, 403);
            const duplicate = await call(mailAuth, '/sign-up/email', signup);
            assert.equal(duplicate.status, 200);
            assert.equal((await duplicate.json()).token, null);
            assert.equal(duplicate.headers.get('set-cookie'), null);
            const url = new URL(emails[0].html.match(/href="([^"]+)"/)![1]);
            assert.equal(url.searchParams.get('callbackURL'), signup.callbackURL);
            const verified = await call(mailAuth, `${url.pathname.replace('/api/auth', '')}${url.search}`);
            assert.equal(verified.status, 302);
            assert.match(verified.headers.get('location')!, /login\?redirect=%2Fcontacts$/);
            assert.equal((await findUserByAuthSubject(verifiedSubject))?.role, 'admin');
            const login = await call(mailAuth, '/sign-in/email', { email: signup.email, password });
            assert.equal(login.status, 200);
            verifiedToken = (await login.json()).token;
        });

        await t.test('credential password changes revoke other sessions and reset revokes all sessions', async () => {
            const other = await call(mailAuth, '/sign-in/email', { email: 'verified-admin@example.com', password });
            const otherToken = (await other.json()).token;
            const changed = await call(mailAuth, '/change-password', { currentPassword: password, newPassword: 'ChangedPassword123!', revokeOtherSessions: true }, bearer(verifiedToken));
            assert.equal(changed.status, 200, await changed.clone().text());
            assert.equal(await (await call(mailAuth, '/get-session', undefined, bearer(otherToken))).json(), null);
            assert.equal((await call(mailAuth, '/sign-in/email', { email: 'verified-admin@example.com', password })).status, 401);
            assert.equal((await call(mailAuth, '/request-password-reset', { email: 'verified-admin@example.com', redirectTo: '/reset-password' })).status, 200);
            const resetUrl = new URL(emails.at(-1)!.html.match(/href="([^"]+)"/)![1]);
            const redirect = await call(mailAuth, `${resetUrl.pathname.replace('/api/auth', '')}${resetUrl.search}`);
            const resetToken = new URL(redirect.headers.get('location')!, process.env.NEXT_PUBLIC_APP_URL).searchParams.get('token');
            assert.ok(resetToken);
            const reset = await call(mailAuth, '/reset-password', { token: resetToken, newPassword: 'RecoveredPassword123!' });
            assert.equal(reset.status, 200);
            assert.equal(await (await call(mailAuth, '/get-session', undefined, bearer(verifiedToken))).json(), null);
            assert.equal((await call(mailAuth, '/reset-password', { token: resetToken, newPassword: password })).status, 400);
            assert.equal((await call(mailAuth, '/sign-in/email', { email: 'verified-admin@example.com', password: 'RecoveredPassword123!' })).status, 200);
            const before = emails.length;
            assert.equal((await call(mailAuth, '/request-password-reset', { email: 'unknown@example.com', redirectTo: '/reset-password' })).status, 200);
            assert.equal(emails.length, before);
        });

        await t.test('Google-only users have no credential account or password to change', async () => {
            const context = await mailAuth.$context;
            const user = await context.internalAdapter.createUser({ email: 'google@example.com', name: 'Google Fixture', emailVerified: true }, { method: 'oauth', oauth: { providerId: 'google' } });
            await context.internalAdapter.createAccount({ userId: user.id, providerId: 'google', accountId: 'google-fixture-subject' });
            const session = await context.internalAdapter.createSession(user.id);
            assert.ok(session);
            const accounts = await call(mailAuth, '/list-accounts', undefined, bearer(session.token));
            const linked = await accounts.json();
            assert.equal(linked.some((account: { providerId: string }) => account.providerId === 'credential'), false);
            assert.equal((await call(mailAuth, '/change-password', { currentPassword: password, newPassword: 'OtherPassword123!' }, bearer(session.token))).status, 400);
            assert.equal((await findUserByAuthSubject(user.id))?.googleSync?.status, 'not_connected');
        });

        await t.test('cleanup retries external failures and deletes actual ObjectId references idempotently', async () => {
            const context = await mailAuth.$context;
            await context.internalAdapter.createSession(subject);
            assert.equal((await call(mailAuth, '/request-password-reset', { email: 'bootstrap@example.com' })).status, 200);
            assert.ok(await db.collection('verification').findOne({ value: subject }));
            await db.collection(Collections.RECORDINGS).insertOne({ authSubject: subject, r2Key: 'fixture/audio.wav' });
            await db.collection(Collections.USERS).updateOne({ authSubject: subject }, { $set: { stripeSubscriptionId: 'fixture-subscription' } });
            process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
            const failedBilling = await deleteUserData(subject, { db, cancelSubscription: async () => { throw new Error('Retry billing'); } });
            assert.equal(failedBilling.cleanupPending, true);
            assert.ok(await db.collection('user').findOne({ _id: new ObjectId(subject) }));
            const failedStorage = await deleteUserData(subject, { db, cancelSubscription: async () => {}, removeObject: async () => { throw new Error('Retry storage'); } });
            assert.equal(failedStorage.cleanupPending, true);
            assert.deepEqual(failedStorage.r2Failures, ['fixture/audio.wav']);
            assert.ok(await db.collection('account').findOne({ userId: new ObjectId(subject) }));
            // Simulate an interrupted identity cleanup: removing sessions twice is harmless.
            await db.collection('session').deleteMany({ userId: new ObjectId(subject) });
            const complete = await deleteUserData(subject, { db, cancelSubscription: async () => {}, removeObject: async () => {} });
            assert.equal(complete.cleanupPending, false);
            assert.equal(await db.collection('user').countDocuments({ _id: new ObjectId(subject) }), 0);
            assert.equal(await db.collection('account').countDocuments({ userId: new ObjectId(subject) }), 0);
            assert.equal(await db.collection('session').countDocuments({ userId: new ObjectId(subject) }), 0);
            assert.equal(await db.collection('verification').countDocuments({ value: subject }), 0);
            assert.equal(await findUserByAuthSubject(subject), null);
            assert.ok(await findUserByAuthSubject(verifiedSubject));
        });
    } finally {
        await db.dropDatabase();
        await client.close();
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
        Object.assign(process.env, saved);
    }
});
