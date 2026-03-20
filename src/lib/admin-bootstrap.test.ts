import test from 'node:test';
import assert from 'node:assert/strict';

import { isBootstrapAdminEmail } from '@/lib/admin-bootstrap';

test('matches configured bootstrap admin emails case-insensitively', () => {
    assert.equal(
        isBootstrapAdminEmail(
            'founder@example.com',
            { ADMIN_BOOTSTRAP_EMAILS: 'ops@example.com, Founder@Example.com ' } as unknown as NodeJS.ProcessEnv
        ),
        true
    );
});

test('returns false when the email is not in the bootstrap allowlist', () => {
    assert.equal(
        isBootstrapAdminEmail(
            'user@example.com',
            { ADMIN_BOOTSTRAP_EMAILS: 'ops@example.com,founder@example.com' } as unknown as NodeJS.ProcessEnv
        ),
        false
    );
});
