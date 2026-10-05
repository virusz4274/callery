import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

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
