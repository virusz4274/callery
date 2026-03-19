import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';

import { checkStorageAccess } from '@/lib/access-control-storage';
import type { User } from '@/lib/db/types';

function createUser(overrides: Partial<User> = {}): User {
    return {
        _id: new ObjectId(),
        firebaseUid: 'user-1',
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
        name: 'Test User',
        phoneNumber: '',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        role: 'user',
        plan: 'Pro',
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

test('blocks paid users from exceeding storage allocation when overage is disabled', () => {
    const result = checkStorageAccess(createUser(), 10);

    assert.equal(result.allowed, false);
    assert.match(result.reason || '', /Enable 'Pay Per Usage'/);
});

test('allows paid users to exceed storage allocation when overage is enabled', () => {
    const result = checkStorageAccess(createUser({
        billingSettings: {
            allowOverage: true,
        },
    }), 10);

    assert.deepEqual(result, { allowed: true });
});

test('keeps free-trial storage limits strict even when overage is enabled elsewhere', () => {
    const result = checkStorageAccess(createUser({
        plan: 'Free Trial',
        storageUsed: 100,
        storageAllocation: 100,
    }), 1);

    assert.equal(result.allowed, false);
    assert.match(result.reason || '', /Free Trial/);
});
