import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildContentSecurityPolicy,
    getContentSecurityPolicyHeader,
    isCspReportOnlyMode,
} from '@/lib/security-headers';

test('CSP includes configured storage and preserves security directives', () => {
    const policy = buildContentSecurityPolicy({ S3_PUBLIC_ENDPOINT: 'https://storage.example.com/path' });
    assert.match(policy, /connect-src [^;]*https:\/\/storage\.example\.com/);
    assert.match(policy, /media-src [^;]*https:\/\/storage\.example\.com/);
    assert.match(policy, /frame-ancestors 'none'/);
    assert.doesNotMatch(policy, /identitytoolkit|securetoken/);
});

test('uses report-only CSP mode for preview deployments', () => {
    const env = {
        NODE_ENV: 'production' as const,
        VERCEL_ENV: 'preview',
    };

    assert.equal(isCspReportOnlyMode(env), true);
    assert.deepEqual(getContentSecurityPolicyHeader(env), {
        key: 'Content-Security-Policy-Report-Only',
        value: buildContentSecurityPolicy(env),
    });
});
