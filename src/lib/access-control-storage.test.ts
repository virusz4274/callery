import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';

import type { User } from '@/lib/db/types';

async function getAccessControlStorageModule() {
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    return import('@/lib/access-control-storage');
}

function createUser(overrides: Partial<User> = {}): User {
    return {
        _id: new ObjectId(),
        authSubject: 'user-1',
        googleSync: { status: 'not_connected' },
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
        name: 'Test User',
        phoneNumber: '',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        role: 'user',
        planKey: 'pro',
        timezone: 'UTC',
        notificationSettings: {
            activityDigest: 'weekly',
            ingestSuccess: true,
            ingestFail: true,
        },
        transcriptionSettings: {
            autoTranscribe: true,
        },
        storageSettings: {
            deletionPolicy: 'never',
        },
        storageUsed: 95,
        storagePeakUsed: 95,
        storageAllocation: 100,
        transcriptionUsed: 0,
        transcriptionAllocation: 3600,
        totalContacts: 0,
        totalRecordings: 0,
        totalDuration: 0,
        billingSettings: {
            allowOverage: false,
        },
        ...overrides,
    };
}

test('blocks paid users from exceeding storage allocation when overage is disabled', async () => {
    const { checkStorageAccess } = await getAccessControlStorageModule();
    const result = checkStorageAccess(createUser(), 10);

    assert.equal(result.allowed, false);
    assert.match(result.reason || '', /Enable 'Pay Per Usage'/);
});

test('allows paid users to exceed storage allocation when overage is enabled', async () => {
    const { checkStorageAccess } = await getAccessControlStorageModule();
    const result = checkStorageAccess(createUser({
        billingSettings: {
            allowOverage: true,
        },
    }), 10);

    assert.deepEqual(result, { allowed: true });
});

test('keeps free-trial storage limits strict even when overage is enabled elsewhere', async () => {
    const { checkStorageAccess } = await getAccessControlStorageModule();
    const result = checkStorageAccess(createUser({
        planKey: 'free-trial',
        storageUsed: 100,
        storageAllocation: 100,
    }), 1);

    assert.equal(result.allowed, false);
    assert.match(result.reason || '', /Free Trial/);
});

test('does not treat the legacy free alias as a canonical free-trial plan key', async () => {
    const { checkStorageAccess } = await getAccessControlStorageModule();
    const result = checkStorageAccess(createUser({
        planKey: 'free',
        storageUsed: 100,
        storageAllocation: 100,
    }), 1);

    assert.equal(result.allowed, false);
    assert.doesNotMatch(result.reason || '', /Free Trial/);
    assert.match(result.reason || '', /Pay Per Usage/);
});
