import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthCapabilities, getAuthSecret } from './config';
import { GET } from '@/app/api/auth/capabilities/route';
import { buildGoogleContactsAuthUrl } from '@/services/google/oauth';
import { resolvePostAuthRedirect, buildAuthPageHref } from '@/lib/auth-redirect';

test('public capabilities use configuration only and never disclose credentials', async () => {
    const saved = { ...process.env };
    try {
        process.env.MONGODB_URI = 'deliberately-invalid';
        delete process.env.BETTER_AUTH_SECRET;
        delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        delete process.env.GOOGLE_CLIENT_SECRET;
        process.env.EMAIL_PROVIDER = 'none';
        const response = await GET();
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(await response.json(), {
            googleEnabled: false, emailVerificationRequired: false, passwordResetEnabled: false,
        });
        for (const provider of ['smtp', 'resend']) {
            process.env.EMAIL_PROVIDER = provider;
            assert.deepEqual(getAuthCapabilities(), {
                googleEnabled: false, emailVerificationRequired: true, passwordResetEnabled: true,
            });
        }
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'fixture-client-id';
        const partial = await GET();
        assert.equal(partial.status, 503);
        assert.match((await partial.json()).error, /GOOGLE_CLIENT_SECRET/);
        process.env.GOOGLE_CLIENT_SECRET = 'fixture-client-secret';
        const configured = await GET();
        const body = await configured.text();
        assert.equal(JSON.parse(body).googleEnabled, true);
        assert.equal(body.includes('fixture-client'), false);
        delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        assert.throws(getAuthCapabilities, /NEXT_PUBLIC_GOOGLE_CLIENT_ID/);
    } finally {
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
        Object.assign(process.env, saved);
    }
});

test('authentication requires a secret of at least 32 characters', () => {
    const saved = process.env.BETTER_AUTH_SECRET;
    try {
        delete process.env.BETTER_AUTH_SECRET;
        assert.throws(getAuthSecret, /BETTER_AUTH_SECRET/);
        process.env.BETTER_AUTH_SECRET = 'too-short';
        assert.throws(getAuthSecret, /32 characters/);
        process.env.BETTER_AUTH_SECRET = 'a'.repeat(32);
        assert.equal(getAuthSecret().length, 32);
    } finally {
        process.env.BETTER_AUTH_SECRET = saved;
    }
});

test('Contacts requests its own callback and permission while auth redirects stay local', () => {
    const saved = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI;
    try {
        process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI = '';
        const url = new URL(buildGoogleContactsAuthUrl('fixture-state'));
        assert.equal(url.searchParams.get('client_id'), process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
        assert.equal(url.searchParams.get('redirect_uri'), `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`);
        assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/contacts.readonly');
        assert.equal(url.searchParams.get('state'), 'fixture-state');
        assert.equal(url.searchParams.get('access_type'), 'offline');
        for (const unsafe of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)']) {
            assert.equal(resolvePostAuthRedirect(unsafe), '/recordings');
        }
        assert.equal(resolvePostAuthRedirect('/upload?folder=one#files'), '/upload?folder=one#files');
        assert.equal(buildAuthPageHref('/login', resolvePostAuthRedirect('/contacts')), '/login?redirect=%2Fcontacts');
    } finally {
        process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI = saved;
    }
});
