import test from 'node:test';
import assert from 'node:assert/strict';
import { sendNotificationEmail } from './index';

test('notification emails report delivery, skip disabled providers, and propagate delivery failures', async () => {
    const input = { to: 'recipient@example.com', subject: 'Notification', html: '<p>Hello</p>' };
    let deliveries = 0;
    assert.equal(await sendNotificationEmail(input, {
        provider: 'smtp',
        send: async message => { assert.deepEqual(message, input); deliveries++; },
    }), true);
    assert.equal(deliveries, 1);
    assert.equal(await sendNotificationEmail(input, null), false);
    const error = new Error('Relay unavailable');
    await assert.rejects(sendNotificationEmail(input, { provider: 'resend', send: async () => { throw error; } }), error);
});
