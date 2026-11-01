import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { ObjectId } from 'mongodb';
import type { User } from '../types';
import { INSTALLATION_PLANS, ONE_TIME_TRIAL } from '@/lib/installation-defaults';

type Fixture = { user?: User; defaultPlan: typeof INSTALLATION_PLANS[number]; creations: number };
const fixtureKey = Symbol.for('vosift.test.one-time-trial');
const shared = globalThis as typeof globalThis & { [fixtureKey]: Fixture };
const stateSource = `const state=()=>globalThis[Symbol.for('vosift.test.one-time-trial')];`;
const stubs: Record<string, string> = {
    './lookup': `export async function findUserByAuthSubject(){return state().user;}
        export async function getRequiredDefaultPlan(){return state().defaultPlan;}
        export async function createUser(input){state().creations++;return state().user={...input,_id:'fixture-user',createdAt:new Date(),updatedAt:new Date()};}
        export async function updateUser(owner,patch){return Object.assign(state().user,patch);}`,
    '@/lib/admin-bootstrap': `export function isBootstrapAdminEmail(){return false;}`,
    '@/lib/team-policy': `export async function getTeamSettings(){return {enabled:false};}`,
    '@/lib/team-invitations': `export async function assertSignupAllowed(){} export async function acceptTeamInvitation(){}`,
};
const hook = registerHooks({ resolve(specifier, context, next) {
    const source = context.parentURL?.endsWith('/db/users/ensure-profile.ts') ? stubs[specifier] : undefined;
    return source ? { url: `data:text/javascript,${encodeURIComponent(stateSource + source)}`, shortCircuit: true } : next(specifier, context);
} });
const { ensureUserProfile } = await import('./ensure-profile');
after(() => hook.deregister());

function setup(key = 'free-trial'): Fixture {
    return shared[fixtureKey] = { defaultPlan: structuredClone(INSTALLATION_PLANS.find(plan => plan.key === key)!), creations: 0 };
}

test('a trial grants ten weighted minutes and 100 MiB once, with a fixed 30-day deadline', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2030-01-01T00:00:00Z') });
    const state = setup();
    const first = await ensureUserProfile('owned-trial', 'trial@example.invalid', 'Trial User', '', true);
    assert.equal(first.wasCreated, true);
    assert.equal(first.user.transcriptionAllocation, ONE_TIME_TRIAL.weightedSeconds);
    assert.equal(first.user.storageAllocation, ONE_TIME_TRIAL.storageBytes);
    assert.equal(first.user.trialEndsAt?.toISOString(), '2030-01-31T00:00:00.000Z');
    assert.equal(first.user.billingEntitlement?.source, 'trial');
    assert.equal(first.user.stripeCustomerId, undefined);
    assert.equal(first.user.lifetimePurchase, undefined);
    const deadline = first.user.trialEndsAt;
    state.user = { ...first.user, _id: new ObjectId(), transcriptionUsed: 555, storageUsed: 1234 };
    t.mock.timers.setTime(Date.parse('2030-03-01T00:00:00Z'));
    for (const emailVerified of [false, true]) {
        const existing = await ensureUserProfile('owned-trial', 'trial@example.invalid', 'Trial User', '', emailVerified);
        assert.equal(existing.wasCreated, false);
        assert.equal(existing.user.trialEndsAt, deadline);
        assert.equal(existing.user.transcriptionUsed, 555);
        assert.equal(existing.user.storageUsed, 1234);
    }
    assert.equal(state.creations, 1);
});

test('login after upgrade or cancellation cannot recreate a trial or its consumed allowance', async () => {
    const state = setup();
    const initial = await ensureUserProfile('owned-return', 'return@example.invalid');
    const deadline = initial.user.trialEndsAt;
    state.user = { ...initial.user, planKey: 'standard', transcriptionUsed: 600,
        billingEntitlement: { source: 'subscription', grantedAt: new Date(), reference: 'sub_fixture' },
        stripeSubscriptionId: 'sub_fixture', stripeSubscriptionStatus: 'canceled' };
    const result = await ensureUserProfile('owned-return', 'return@example.invalid', undefined, undefined, true);
    assert.equal(result.user.planKey, 'standard');
    assert.equal(result.user.stripeSubscriptionStatus, 'canceled');
    assert.equal(result.user.trialEndsAt, deadline);
    assert.equal(result.user.transcriptionUsed, 600);
    assert.equal(result.user.billingEntitlement?.source, 'subscription');
    assert.equal(state.creations, 1);
});

test('a self-hosted Internal default creates an admin entitlement without a trial clock', async () => {
    setup('internal');
    const result = await ensureUserProfile('owned-selfhost', 'selfhost@example.invalid');
    assert.equal(result.user.planKey, 'internal');
    assert.equal(result.user.billingEntitlement?.source, 'admin');
    assert.equal(result.user.trialEndsAt, undefined);
});
