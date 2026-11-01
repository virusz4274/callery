import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectId, type Db } from 'mongodb';
import { Collections } from '@/lib/mongodb';
import { INSTALLATION_PLANS } from '@/lib/installation-defaults';
import type { Plan } from './types/plan';
import { assertPlanDeletionPreservesOnboarding, assertPlanUpdatePreservesOnboarding } from './default-plan-protection';

function plan(key: string): Plan {
    return { ...structuredClone(INSTALLATION_PLANS.find(plan => plan.key === key)!), _id: new ObjectId(), createdAt: new Date(), updatedAt: new Date() };
}
function database(defaultPlanId?: ObjectId, duplicates = false): Db {
    const settings = defaultPlanId ? [{ _id: new ObjectId(), defaultPlanId }] : [];
    return { collection(name: string) {
        assert.equal(name, Collections.SYSTEM_SETTINGS);
        return { find: () => ({ limit: () => ({ toArray: async () => duplicates ? [...settings, ...settings] : settings }) }) };
    } } as unknown as Db;
}

test('plan edits protect the actual self-host default even when its display flag is false', async () => {
    for (const key of ['custom', 'internal']) {
        const selected = plan(key), db = database(selected._id);
        assert.equal(selected.isDefault, false);
        await assert.rejects(assertPlanUpdatePreservesOnboarding(db, { ...selected, isActive: false }, false), /must be active/);
        await assert.rejects(assertPlanDeletionPreservesOnboarding(db, selected), /default signup plan cannot be deleted/);
        await assert.doesNotReject(assertPlanUpdatePreservesOnboarding(db, { ...selected, name: 'Renamed', limits: { storage: 123, transcription: 456 } }, false));
    }
});

test('managed default cannot be deactivated or renamed to a paid plan', async () => {
    const selected = plan('free-trial'), db = database(selected._id);
    await assert.rejects(assertPlanUpdatePreservesOnboarding(db, { ...selected, isActive: false }, true), /must be active/);
    await assert.rejects(assertPlanUpdatePreservesOnboarding(db, { ...selected, key: 'standard' }, true), /Free Trial/);
    await assert.doesNotReject(assertPlanUpdatePreservesOnboarding(db, { ...selected, description: 'A reviewed trial description' }, true));
});

test('unreferenced plan edits remain independent and duplicate settings fail closed', async () => {
    const selected = plan('custom'), other = plan('pro'), db = database(selected._id);
    await assert.doesNotReject(assertPlanUpdatePreservesOnboarding(db, { ...other, isActive: false }, true));
    await assert.doesNotReject(assertPlanDeletionPreservesOnboarding(db, other));
    await assert.rejects(assertPlanDeletionPreservesOnboarding(database(), plan('free-trial')), /default signup plan cannot be deleted/);
    await assert.rejects(assertPlanUpdatePreservesOnboarding(database(selected._id, true), selected, false), /Multiple system settings/);
    await assert.rejects(assertPlanDeletionPreservesOnboarding(database(selected._id, true), other), /Multiple system settings/);
});
