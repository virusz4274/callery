import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { ObjectId } from 'mongodb';
import { MemoryBillingDatabase, userFixture, planFixture } from '@/lib/stripe/test-support';

const key = Symbol.for('vosift.test.admin-plan-assignment');
type State = { memory: MemoryBillingDatabase; admin: ObjectId; audits: unknown[][]; authorized: boolean; parse: (id: string) => ObjectId };
const shared = globalThis as typeof globalThis & { [key]: State };
const s = `globalThis[Symbol.for('vosift.test.admin-plan-assignment')]`;
const hook = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/actions/update-contact-plan.ts')) {
        const source = specifier === '@/lib/admin-auth' ? `export async function requireCurrentAdmin(){if(!${s}.authorized)throw new Error('Forbidden');return {_id:${s}.admin};} export function parseObjectId(id){return ${s}.parse(id);}`
            : specifier === '@/lib/mongodb' ? `export const Collections={USERS:'users',PLANS:'plans'}; export async function getMongoDb(){return ${s}.memory.asDb();}`
            : specifier === '@/app/actions/audit-log' ? `export async function logAdminAction(...args){${s}.audits.push(args);}`
            : specifier === '@/lib/logger' ? `export const logger={error(){}};`
            : specifier === 'next/cache' ? `export function revalidatePath(){}` : undefined;
        if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    return next(specifier, context);
} });
const { updateContactPlan } = await import('./update-contact-plan');
hook.deregister();

function setup() {
    const memory = new MemoryBillingDatabase(), admin = new ObjectId();
    shared[key] = { memory, admin, audits: [], authorized: true, parse: id => new ObjectId(id) };
    const user = userFixture({ trialEndsAt: new Date(Date.now() + 86400_000), transcriptionUsed: 75, storageUsed: 321 });
    memory.collection('users').values.push(user as unknown as Record<string, unknown>);
    memory.collection('plans').values.push(planFixture({ key: 'internal', limits: { storage: 1024 ** 4, transcription: 99999 * 60 } }) as unknown as Record<string, unknown>);
    memory.collection('plans').values.push(planFixture({ key: 'free-trial', limits: { storage: 100 * 1024 ** 2, transcription: 600 } }) as unknown as Record<string, unknown>);
    return { memory, id: user._id.toString(), state: shared[key] };
}

test('Internal assignment clears an unstarted recovery clock while preserving debt, review, history and usage', async () => {
    const { memory, id, state } = setup(), user = memory.user();
    user.billingReview = { reason: 'historical-payment-review', createdAt: new Date() };
    user.stripePaymentIssues = { in_old: { state: 'failed', subscriptionId: 'sub_old', updatedAt: new Date() } };
    user.billingRecovery = { startedAt: new Date(0), purgeAt: new Date(1), warnings: [] };
    const originalEnd = user.trialEndsAt!.getTime(), originalReview = structuredClone(user.billingReview);
    assert.deepEqual(await updateContactPlan(id, 'internal'), { success: true });
    const updated = memory.user();
    assert.equal(updated.planKey, 'internal');
    assert.equal(updated.billingEntitlement?.source, 'admin');
    assert.equal(updated.billingEntitlement?.reference, state.admin.toString());
    assert.deepEqual(updated.billingReview, originalReview);
    assert.ok(updated.stripePaymentIssues?.in_old);
    assert.equal(updated.stripeCustomerId, 'cus_owner');
    assert.equal(updated.transcriptionUsed, 75);
    assert.equal(updated.storageUsed, 321);
    assert.equal(updated.trialEndsAt!.getTime(), originalEnd);
    assert.equal(updated.billingRecovery, undefined);
    assert.equal(updated.storageAllocation, 1024 ** 4);
    assert.equal(state.audits.length, 1);
});

test('admin plan assignment respects active billing leases and irreversible purge claims', async () => {
    const { memory, id } = setup();
    memory.user().stripeBillingLease = { owner: 'payment-worker', until: new Date(Date.now() + 60_000) };
    assert.equal((await updateContactPlan(id, 'internal')).success, false);
    assert.equal(memory.user().planKey, 'free-trial');
    delete memory.user().stripeBillingLease;
    memory.user().billingRecovery = { startedAt: new Date(), purgeAt: new Date(), purgingAt: new Date(), warnings: [] };
    const result = await updateContactPlan(id, 'internal');
    assert.equal(result.success, false);
    assert.match(result.message!, /cleanup has already started/);
    assert.equal(memory.user().planKey, 'free-trial');
});

test('reselecting an original active Trial preserves its start, deadline and consumed units', async () => {
    const { memory, id } = setup(), original = structuredClone(memory.user().billingEntitlement);
    const end = memory.user().trialEndsAt!.getTime();
    assert.equal((await updateContactPlan(id, 'free-trial')).success, true);
    assert.deepEqual(memory.user().billingEntitlement, original);
    assert.equal(memory.user().trialEndsAt!.getTime(), end);
    assert.equal(memory.user().transcriptionUsed, 75);
    await updateContactPlan(id, 'internal');
    const retry = await updateContactPlan(id, 'free-trial');
    assert.equal(retry.success, false);
    assert.match(retry.message!, /cannot be restarted/);
    assert.equal(memory.user().billingEntitlement?.source, 'admin');
});

test('an expired or unproven Trial cannot become a fresh administrator grant', async () => {
    for (const expiry of [new Date(0), undefined]) {
        const { memory, id } = setup(); memory.user().trialEndsAt = expiry;
        assert.equal((await updateContactPlan(id, 'free-trial')).success, false);
        assert.equal(memory.user().billingEntitlement?.source, 'trial');
    }
});

test('a changed customer identity loses the administrator grant CAS instead of overwriting billing', async () => {
    const { memory, id } = setup(), users = memory.collection('users'), update = users.updateOne.bind(users);
    Object.assign(users, { updateOne: async (filter: Record<string, unknown>, patch: Record<string, unknown>) => {
        if ((patch.$set as Record<string, unknown>)?.billingEntitlement) memory.user().stripeCustomerId = 'cus_changed';
        return update(filter, patch);
    } });
    const result = await updateContactPlan(id, 'internal');
    assert.equal(result.success, false);
    assert.match(result.message!, /Billing changed/);
    assert.equal(memory.user().planKey, 'free-trial');
    assert.equal(memory.user().stripeCustomerId, 'cus_changed');
});

test('plan assignment requires an administrator before looking up the target account', async () => {
    const { id, state } = setup(); state.authorized = false;
    await assert.rejects(updateContactPlan(id, 'internal'), /Forbidden/);
    assert.equal(state.audits.length, 0);
});
