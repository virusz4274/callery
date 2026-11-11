import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

type State = { environment: Record<string, string>; calls: number; error?: unknown; logs: unknown[][] };
const key = Symbol.for('vosift.test.web-push-adapter');
const shared = globalThis as typeof globalThis & { [key]: State };
const reference = `globalThis[Symbol.for('vosift.test.web-push-adapter')]`;
const hook = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/lib/web-push.ts')) {
        const source = specifier === 'web-push'
            ? `export default {setVapidDetails(){},async sendNotification(){const state=${reference};state.calls++;if(state.error)throw state.error;return {statusCode:202};}};`
            : specifier === '@/lib/env' ? `export const env=new Proxy({},{get(_target,key){return ${reference}.environment[key];}});`
                : specifier === '@/lib/logger' ? `export const logger={warn(...args){${reference}.logs.push(args);}};` : undefined;
        if (source) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    return next(specifier, context);
} });
const { sendWebPushNotification } = await import('./web-push');
hook.deregister();
const subscription = { endpoint: 'https://push.example.test/private-endpoint', keys: { p256dh: 'private-public-key', auth: 'private-auth-key' } };
const payload = { title: 'Ready', body: 'Recording processed' };

function setup(configured = true) {
    const state: State = { environment: configured ? { NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'configured', VAPID_PRIVATE_KEY: 'configured', VAPID_CONTACT_EMAIL: 'operator@example.test' } : {}, calls: 0, logs: [] };
    shared[key] = state;
    return state;
}

test('unconfigured push skips transport and cannot be mistaken for an expired endpoint', async () => {
    const state = setup(false);
    const result = await sendWebPushNotification(subscription, payload);
    assert.equal(result.success, false);
    assert.equal(result.statusCode, undefined);
    assert.equal(state.calls, 0);
});

test('successful delivery preserves the provider response status', async () => {
    const state = setup();
    assert.deepEqual(await sendWebPushNotification(subscription, payload), { success: true, endpoint: subscription.endpoint, statusCode: 202 });
    assert.equal(state.calls, 1);
});

test('provider failures preserve numeric HTTP statuses without exposing provider error details', async () => {
    for (const statusCode of [404, 410, 429, 503]) {
        const state = setup();
        state.error = Object.assign(new Error('private-endpoint private-auth-key sensitive response body'), { statusCode, body: 'provider-secret' });
        const result = await sendWebPushNotification(subscription, payload);
        assert.equal(result.success, false);
        assert.equal(result.statusCode, statusCode);
        assert.equal(result.error, `Web push provider returned HTTP ${statusCode}.`);
        const logs = JSON.stringify(state.logs);
        for (const secret of ['private-endpoint', 'private-auth-key', 'provider-secret', 'sensitive response body']) assert.equal(logs.includes(secret), false);
    }
});

test('network failures and malformed status values have no terminal HTTP status', async () => {
    for (const statusCode of [undefined, '410', NaN, Infinity, 99, 600]) {
        const state = setup();
        state.error = Object.assign(new Error('Synthetic transport error'), { statusCode });
        const result = await sendWebPushNotification(subscription, payload);
        assert.equal(result.success, false);
        assert.equal(result.statusCode, undefined);
        assert.equal(result.error, 'Web push delivery failed.');
    }
});
