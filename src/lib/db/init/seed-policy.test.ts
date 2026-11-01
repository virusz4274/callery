import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectId, type Db } from 'mongodb';
import { Collections } from '@/lib/mongodb';
import { INSTALLATION_PLANS } from '@/lib/installation-defaults';
import { seedSystemSettings } from './seed';

test('settings seeding honors explicit managed mode independently of process defaults', async () => {
    const previous = process.env.NEXT_PUBLIC_ENABLE_BILLING;
    const plan = { ...INSTALLATION_PLANS.find(plan => plan.key === 'custom')!, _id: new ObjectId(), createdAt: new Date(), updatedAt: new Date() };
    const settings = { _id: new ObjectId(), defaultPlanId: plan._id, allowSignups: true, maintenanceMode: false, updatedAt: new Date() };
    let writes = 0;
    const db = { collection(name: string) {
        return {
            find: () => ({ limit: () => ({ toArray: async () => name === Collections.SYSTEM_SETTINGS ? [settings] : [] }) }),
            findOne: async () => name === Collections.PLANS ? plan : null,
            updateOne: async () => { writes++; throw new Error('Existing settings must be preserved.'); },
        };
    } } as unknown as Db;
    try {
        process.env.NEXT_PUBLIC_ENABLE_BILLING = 'false';
        await assert.rejects(seedSystemSettings(db, Collections, true), /Free Trial/);
        assert.equal(await seedSystemSettings(db, Collections), 'preserved');
        process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
        assert.equal(await seedSystemSettings(db, Collections, false), 'preserved');
        await assert.rejects(seedSystemSettings(db, Collections), /Free Trial/);
        assert.equal(writes, 0);
    } finally {
        if (previous === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING;
        else process.env.NEXT_PUBLIC_ENABLE_BILLING = previous;
    }
});
