import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { restrictedPortalConfiguration } from './portal';

function configuration() {
    return { id: 'bpc_restricted', active: true, features: {
        customer_update: { enabled: false }, subscription_update: { enabled: false },
        payment_method_update: { enabled: true }, invoice_history: { enabled: true },
        subscription_cancel: { enabled: true, mode: 'at_period_end', proration_behavior: 'none' },
    } };
}
function stripeFor(value = configuration()) {
    const retrieved: string[] = [];
    return { retrieved, stripe: { billingPortal: { configurations: { retrieve: async (id: string) => { retrieved.push(id); return value; } } } } as unknown as Stripe };
}

test('portal requires the explicitly retrieved restricted configuration instead of Dashboard defaults', async () => {
    const fixture = stripeFor();
    assert.equal(await restrictedPortalConfiguration(fixture.stripe, 'bpc_restricted'), 'bpc_restricted');
    assert.deepEqual(fixture.retrieved, ['bpc_restricted']);
    await assert.rejects(restrictedPortalConfiguration(fixture.stripe, ''), /STRIPE_PORTAL_CONFIGURATION_ID/);
    assert.equal(fixture.retrieved.length, 1, 'Missing configuration cannot silently select the default portal');
});

test('portal rejects external plan changes, immediate cancellation, prorations and customer mutations', async () => {
    for (const change of [
        (value: ReturnType<typeof configuration>) => { value.features.subscription_update.enabled = true; },
        (value: ReturnType<typeof configuration>) => { value.features.customer_update.enabled = true; },
        (value: ReturnType<typeof configuration>) => { value.features.subscription_cancel.mode = 'immediately'; },
        (value: ReturnType<typeof configuration>) => { value.features.subscription_cancel.proration_behavior = 'create_prorations'; },
        (value: ReturnType<typeof configuration>) => { value.features.subscription_cancel.enabled = false; },
        (value: ReturnType<typeof configuration>) => { value.active = false; },
    ]) {
        const value = configuration(); change(value);
        await assert.rejects(restrictedPortalConfiguration(stripeFor(value).stripe, 'bpc_restricted'), /must allow only/);
    }
});
