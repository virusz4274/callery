import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSignature } from 'better-auth/crypto';
import { oauthPageQuery, readOAuthConsentRequest } from './oauth-consent';

const secret = 'consent-test-secret-with-at-least-thirty-two-characters';

async function signedQuery(overrides: Record<string, string> = {}) {
    const params = new URLSearchParams({ client_id: 'client-one', scope: 'recordings:read offline_access', redirect_uri: 'https://client.example/callback', exp: String(Math.floor(Date.now() / 1000) + 300), ...overrides });
    params.append('resource', 'https://app.example.com/mcp/v1');
    params.append('resource', 'https://app.example.com/api/v1');
    for (const name of [...new Set([...params.keys(), 'ba_param'])].sort()) params.append('ba_param', name);
    const canonical = new URLSearchParams([...params.entries()].sort(([keyA, valueA], [keyB, valueB]) => keyA < keyB ? -1 : keyA > keyB ? 1 : valueA < valueB ? -1 : valueA > valueB ? 1 : 0));
    params.set('sig', await makeSignature(canonical.toString(), secret));
    return params;
}

test('consent displays only verified provider requests and preserves repeated resources through Next search params', async () => {
    const signed = await signedQuery({ claims: JSON.stringify({ userinfo: { email: { essential: true } } }) });
    const nextParams: Record<string, string | string[]> = {};
    for (const key of signed.keys()) { const values = signed.getAll(key); nextParams[key] = values.length === 1 ? values[0] : values; }
    const request = await readOAuthConsentRequest(oauthPageQuery(nextParams), secret);
    assert.equal(request?.clientId, 'client-one');
    assert.deepEqual(request?.scopes, ['recordings:read', 'offline_access']);
    assert.deepEqual(request?.resources, ['https://app.example.com/mcp/v1', 'https://app.example.com/api/v1']);
    assert.deepEqual(request?.claims, ['email']);
});

test('consent rejects changed scopes, expired requests, duplicate signatures and malformed claims', async () => {
    const changed = await signedQuery(); changed.set('scope', 'recordings:read recordings:upload');
    assert.equal(await readOAuthConsentRequest(changed.toString(), secret), null);
    const duplicate = await signedQuery(); duplicate.append('sig', duplicate.get('sig')!);
    assert.equal(await readOAuthConsentRequest(duplicate.toString(), secret), null);
    assert.equal(await readOAuthConsentRequest((await signedQuery({ exp: '1' })).toString(), secret), null);
    assert.equal(await readOAuthConsentRequest((await signedQuery({ claims: '{broken' })).toString(), secret), null);
    assert.equal(await readOAuthConsentRequest('client_id=unsigned', secret), null);
    assert.equal(await readOAuthConsentRequest('x'.repeat(16_385), secret), null);
});
