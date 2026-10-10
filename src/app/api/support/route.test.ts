import test, { beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GITHUB_SUPPORT_URL } from '@/lib/public-site-policy';

let previousBilling: string | undefined;
beforeEach(() => {
    previousBilling = process.env.NEXT_PUBLIC_ENABLE_BILLING;
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
});
afterEach(() => {
    if (previousBilling === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING;
    else process.env.NEXT_PUBLIC_ENABLE_BILLING = previousBilling;
    mock.restoreAll();
});

test('self-host support rejects requests before parsing or downstream work', async () => {
    const { POST } = await import('@/app/api/support/route');
    for (const value of ['false', undefined]) {
        if (value === undefined) delete process.env.NEXT_PUBLIC_ENABLE_BILLING;
        else process.env.NEXT_PUBLIC_ENABLE_BILLING = value;
        const request = new NextRequest('https://app.example.com/api/support', { method: 'POST', body: 'invalid JSON' });
        const parse = mock.method(request, 'json', async () => { throw new Error('Should never parse'); });
        const response = await POST(request);
        assert.equal(response.status, 403);
        const body = await response.json();
        assert.equal(body.supportUrl, GITHUB_SUPPORT_URL);
        assert.match(body.error, /GitHub Issues/);
        assert.equal(parse.mock.callCount(), 0);
    }
});

test('support route rejects mismatched origins', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test-support-route';
    const { POST } = await import('@/app/api/support/route');

    const request = new NextRequest('https://app.example.com/api/support', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            origin: 'https://evil.example.com',
        },
        body: JSON.stringify({
            name: 'Test User',
            email: 'test@example.com',
            subject: 'Need help',
            message: 'This is a sufficiently long support message.',
        }),
    });

    const response = await POST(request);
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.error, 'Origin not allowed');
});

test('support route rejects honeypot submissions before any downstream work', async () => {
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test-support-route';
    const { POST } = await import('@/app/api/support/route');

    const request = new NextRequest('https://app.example.com/api/support', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            origin: 'https://app.example.com',
        },
        body: JSON.stringify({
            name: 'Test User',
            email: 'test@example.com',
            subject: 'Need help',
            message: 'This is a sufficiently long support message.',
            companyWebsite: 'https://spam.example.com',
        }),
    });

    const response = await POST(request);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'Invalid request payload');
});
