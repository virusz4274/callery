import test from 'node:test';
import assert from 'node:assert/strict';

import {
    PROFILE_SETUP_ERROR_MESSAGE,
    resolveProfileEnsureFailurePolicy,
} from '@/app/api/auth/login/profile-ensure-policy';

test('rejects new-user login when profile provisioning fails', () => {
    const result = resolveProfileEnsureFailurePolicy({
        hasExistingUser: false,
        errorMessage: 'database unavailable',
    });

    assert.deepEqual(result, {
        kind: 'reject',
        status: 503,
        error: PROFILE_SETUP_ERROR_MESSAGE,
    });
});

test('rejects sign-in when new signups are disabled', () => {
    const result = resolveProfileEnsureFailurePolicy({
        hasExistingUser: false,
        errorMessage: 'New signups are currently disabled.',
    });

    assert.deepEqual(result, {
        kind: 'reject',
        status: 403,
        error: 'New signups are currently disabled.',
    });
});

test('allows existing-user login when profile refresh fails', () => {
    const result = resolveProfileEnsureFailurePolicy({
        hasExistingUser: true,
        errorMessage: 'stripe unavailable',
    });

    assert.deepEqual(result, {
        kind: 'allow',
        profileEnsureFailed: true,
    });
});
