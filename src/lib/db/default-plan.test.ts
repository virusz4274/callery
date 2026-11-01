import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { assertValidDefaultPlan } from './default-plan';
import { INSTALLATION_PLANS, installationCatalogImportTemplate } from '@/lib/installation-defaults';

test('installation defaults and import template share exact starter allowances without financial evidence', () => {
    const template = installationCatalogImportTemplate();
    assert.deepEqual(INSTALLATION_PLANS.filter(plan => ['standard', 'pro', 'lifetime'].includes(plan.key)).map(plan => ({ key: plan.key, price: plan.price, interval: plan.interval, limits: plan.limits })), [
        { key: 'standard', price: 10, interval: 'monthly', limits: { storage: 2147483648, transcription: 3600 } },
        { key: 'pro', price: 20, interval: 'monthly', limits: { storage: 5368709120, transcription: 7200 } },
        { key: 'lifetime', price: 250, interval: 'lifetime', limits: { storage: 0, transcription: 0 } },
    ]);
    assert.equal(INSTALLATION_PLANS.length, 6);
    const trial = INSTALLATION_PLANS.find(plan => plan.key === 'free-trial')!;
    assert.equal(trial.interval, 'trial');
    assert.equal(trial.limits.transcription, 600);
    assert.equal(trial.limits.storage, 104857600);
    assert.equal(INSTALLATION_PLANS.find(plan => plan.key === 'internal')!.limits.transcription, 0,
        'Internal uses a derived unlimited policy, never a disguised numeric cap');
    for (const plan of INSTALLATION_PLANS) {
        assert.equal(plan.stripePriceId, ''); assert.equal(plan.billingCatalogVersion, undefined); assert.equal(plan.usageTariffs, undefined);
    }
    for (const plan of template.plans) assert.deepEqual(plan.limits, INSTALLATION_PLANS.find(defaults => defaults.key === plan.key)!.limits);
    template.plans[0].limits.storage = 1;
    assert.equal(INSTALLATION_PLANS.find(plan => plan.key === 'standard')!.limits.storage, 2147483648);
});

test('managed onboarding only accepts an active Free Trial; self-host keeps active custom defaults', () => {
    const plan = (key: string, isActive = true) => ({ ...INSTALLATION_PLANS.find(plan => plan.key === key)!, _id: new ObjectId(), createdAt: new Date(), updatedAt: new Date(), isActive });
    assert.equal(assertValidDefaultPlan(plan('free-trial'), true).key, 'free-trial');
    assert.equal(assertValidDefaultPlan(plan('custom'), false).key, 'custom');
    for (const managed of [true, false]) {
        assert.throws(() => assertValidDefaultPlan(null, managed), /missing/);
        assert.throws(() => assertValidDefaultPlan(plan('free-trial', false), managed), /active/);
    }
    for (const key of ['standard', 'pro', 'lifetime', 'internal', 'custom']) assert.throws(() => assertValidDefaultPlan(plan(key), true), /Free Trial/);
});
