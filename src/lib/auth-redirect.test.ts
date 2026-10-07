import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthPageHref, getAuthRedirectCopy, resolvePostAuthRedirect, sanitizeRedirectTarget } from './auth-redirect';

test('authentication navigation keeps recording links and other query parameters', () => {
    const target = '/recordings?id=recording-123&contact=contact-456';
    assert.equal(resolvePostAuthRedirect(target), target);
    const href = new URL(buildAuthPageHref('/signup', target), 'https://app.example');
    assert.equal(href.pathname, '/signup');
    assert.equal(href.searchParams.get('redirect'), target);
});

test('authentication redirects reject external destinations', () => {
    for (const target of ['https://example.com', '//example.com', 'javascript:alert(1)']) {
        assert.equal(sanitizeRedirectTarget(target), null);
        assert.equal(resolvePostAuthRedirect(target), '/recordings');
    }
});

test('concise authentication instructions retain the intended destination', () => {
    assert.equal(getAuthRedirectCopy('/contacts?q=alice').loginDescription, 'Sign in to view your contacts.');
    assert.equal(getAuthRedirectCopy('/upload').loginDescription, 'Sign in to upload recordings.');
    assert.equal(getAuthRedirectCopy('/settings?tab=notifications').loginDescription, 'Sign in to manage your settings.');
    assert.equal(getAuthRedirectCopy(null).loginDescription, 'Sign in to continue.');
});
