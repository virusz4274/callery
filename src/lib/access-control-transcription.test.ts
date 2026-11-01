import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';

import type { User } from '@/lib/db/types';

async function getAccessControlTranscriptionModule() {
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    return import('@/lib/access-control-transcription');
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
        billingEntitlement: { source: 'subscription', reference: 'sub_test', grantedAt: new Date('2026-01-01') },
        stripeCustomerId: 'cus_test',
        stripeSubscriptionId: 'sub_test',
        stripeSubscriptionStatus: 'active',
        stripeMetering: { subscriptionId: 'sub_test', storagePriceId: 'price_storage', transcriptionPriceId: 'price_transcription', verifiedAt: new Date() },
        trialEndsAt: new Date('2100-01-01'),
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
        storageUsed: 0,
        storagePeakUsed: 0,
        storageAllocation: 1_000,
        transcriptionUsed: 3500,
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

test('blocks paid users from exceeding transcription allocation when overage is disabled', async () => {
    const { checkTranscriptionAccess } = await getAccessControlTranscriptionModule();
    const result = checkTranscriptionAccess(createUser(), 200);

    assert.equal(result.allowed, false);
    assert.match(result.reason || '', /Transcription limit exceeded/);
});

test('allows paid users to exceed transcription allocation when overage is enabled', async () => {
    const { checkTranscriptionAccess } = await getAccessControlTranscriptionModule();
    const result = checkTranscriptionAccess(createUser({
        billingSettings: {
            allowOverage: true,
        },
    }), 200);

    assert.deepEqual(result, { allowed: true });
});

test('keeps free-tier transcription limits strict', async () => {
    const { checkTranscriptionAccess } = await getAccessControlTranscriptionModule();
    const result = checkTranscriptionAccess(createUser({
        planKey: 'free-trial',
        transcriptionUsed: 3600,
        transcriptionAllocation: 3600,
    }), 1);

    assert.equal(result.allowed, false);
    assert.match(result.reason || '', /Free Trial/);
});

test('does not treat the legacy free alias as a canonical free-trial plan key', async () => {
    const { checkTranscriptionAccess } = await getAccessControlTranscriptionModule();
    const result = checkTranscriptionAccess(createUser({
        planKey: 'free',
        transcriptionUsed: 3600,
        transcriptionAllocation: 3600,
    }), 1);

    assert.equal(result.allowed, false);
    assert.doesNotMatch(result.reason || '', /Free Trial/);
    assert.match(result.reason || '', /Enable 'Pay Per Usage'/);
});
