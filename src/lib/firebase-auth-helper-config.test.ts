import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildContentSecurityPolicy,
    getContentSecurityPolicyHeader,
    getFirebaseAuthHelperOrigin,
    isCspReportOnlyMode,
    shouldWarnAboutMissingFirebaseAuthHelper,
} from '@/lib/firebase-auth-helper-config';

test('prefers explicit Firebase auth helper origin', () => {
    const env = {
        FIREBASE_AUTH_HELPER_ORIGIN: 'https://auth-helper.example.com',
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'project.firebaseapp.com',
    };

    assert.equal(
        getFirebaseAuthHelperOrigin(env),
        'https://auth-helper.example.com'
    );
});

test('falls back to NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN when explicit helper origin is absent', () => {
    const env = {
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'project.firebaseapp.com',
    };

    assert.equal(
        getFirebaseAuthHelperOrigin(env),
        'https://project.firebaseapp.com'
    );
});

test('returns null and warns when Firebase is configured without a helper origin', () => {
    const env = {
        NEXT_PUBLIC_FIREBASE_API_KEY: 'api-key',
    };

    assert.equal(getFirebaseAuthHelperOrigin(env), null);
    assert.equal(shouldWarnAboutMissingFirebaseAuthHelper(env), true);
});

test('builds CSP with the configured Firebase helper origin and without hard-coded project URLs', () => {
    const policy = buildContentSecurityPolicy({
        FIREBASE_AUTH_HELPER_ORIGIN: 'https://auth-helper.example.com',
    });

    assert.match(policy, /connect-src [^;]*https:\/\/auth-helper\.example\.com/);
    assert.match(policy, /frame-src [^;]*https:\/\/auth-helper\.example\.com/);
    assert.doesNotMatch(policy, /studio-2463297382-22017\.firebaseapp\.com/);
});

test('uses report-only CSP mode for preview deployments', () => {
    const env = {
        NODE_ENV: 'production',
        VERCEL_ENV: 'preview',
    };

    assert.equal(isCspReportOnlyMode(env), true);
    assert.deepEqual(getContentSecurityPolicyHeader(env), {
        key: 'Content-Security-Policy-Report-Only',
        value: buildContentSecurityPolicy(env),
    });
});
