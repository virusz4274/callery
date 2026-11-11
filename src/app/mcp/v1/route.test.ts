import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import type { ApiActor } from '@/lib/integrations/tokens';

const state = { audience: '', calls: 0, limited: false, actor: { token: { owner: 'owner', scopes: ['recordings:read'] } } as ApiActor };
(globalThis as Record<symbol, unknown>)[Symbol.for('callery.test.mcp-route')] = state;
registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/app/mcp/v1/route.ts')) {
        if (specifier === '@/lib/integrations/tokens') return { url: 'data:text/javascript,' + encodeURIComponent(`import { ApiError } from '${new URL('../../../lib/integrations/contracts.ts', import.meta.url).href}';export async function authenticateApi(headers,db,audience){const s=globalThis[Symbol.for('callery.test.mcp-route')];s.audience=audience;s.calls++;if(headers.get('authorization')!=='Bearer valid')throw new ApiError(401,'unauthorized','Invalid credentials.');return s.actor;}`), shortCircuit: true };
        if (specifier === '@/lib/integrations/http') return { url: 'data:text/javascript,' + encodeURIComponent(`import { ApiError } from '${new URL('../../../lib/integrations/contracts.ts', import.meta.url).href}';export async function apiRateLimit(){if(globalThis[Symbol.for('callery.test.mcp-route')].limited)throw new ApiError(429,'rate_limited','Retry later',3);}`), shortCircuit: true };
    }
    return next(specifier, context);
} });
const { POST, GET, OPTIONS } = await import('./route');
const request = (headers: Record<string, string> = {}, body?: string) => new Request('https://app.example.com/mcp/v1', { method: 'POST', headers: {
    'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25', ...headers },
    body: body ?? JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
});

test('MCP route challenges missing credentials, validates MCP audience, and does not accept cookies', async () => {
    for (const headers of [{}, { Cookie: 'better-auth.session_token=browser-session' }] as Record<string, string>[]) {
        const response = await POST(request(headers));
        assert.equal(response.status, 401);
        assert.equal(state.audience, 'mcp');
        assert.match(response.headers.get('WWW-Authenticate')!, /oauth-protected-resource\/mcp\/v1/);
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
});

test('MCP route returns scope metadata, bounded requests, and rate-limit guidance', async () => {
    const response = await POST(request({ Authorization: 'Bearer valid' }));
    assert.equal(response.status, 200);
    const data = await response.text();
    assert.match(data, /securitySchemes/); assert.match(data, /recordings:transcribe/);
    const huge = await POST(request({ Authorization: 'Bearer valid' }, 'x'.repeat(65537)));
    assert.equal(huge.status, 413);
    state.limited = true;
    const limited = await POST(request({ Authorization: 'Bearer valid' }));
    state.limited = false;
    assert.equal(limited.status, 429); assert.equal(limited.headers.get('Retry-After'), '3');
});

test('MCP route validates browser origins and exposes stateless method/CORS behavior', async () => {
    const calls = state.calls;
    const foreign = await POST(request({ Authorization: 'Bearer valid', Origin: 'https://untrusted.example' }));
    assert.equal(foreign.status, 403); assert.equal(state.calls, calls);
    assert.equal((await GET()).status, 405);
    const options = await OPTIONS();
    assert.equal(options.status, 204);
    assert.match(options.headers.get('Access-Control-Allow-Headers')!, /Authorization/);
});
