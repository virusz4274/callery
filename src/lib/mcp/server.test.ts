import test from 'node:test';
import assert from 'node:assert/strict';
import type { ApiActor } from '@/lib/integrations/tokens';
import { ApiError } from '@/lib/integrations/contracts';
import { createCalleryMcpHandler, invokeCalleryTool, MCP_TOOLS, personalMcpActor } from './server';

const actor = { token: { owner: 'owner', scopes: ['recordings:read', 'company:recordings:read'] },
    principal: { kind: 'api-key', owner: 'owner', scopes: ['recordings:read', 'company:recordings:read'] } } as ApiActor;
async function call(method: string, params: unknown, id = 1) {
    const handler = createCalleryMcpHandler(actor);
    const response = await handler.fetch(new Request('https://app.test/mcp/v1', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    }));
    const body = await response.text();
    await handler.close();
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const payload = body.split('\n').find(line => line.startsWith('data: '));
        assert.ok(payload, body); return JSON.parse(payload.slice(6));
    }
    return JSON.parse(body);
}

test('MCP discovery exposes six typed operations with accurate write annotations', async () => {
    const initialized = await call('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(initialized.result.protocolVersion, '2025-11-25');
    const list = await call('tools/list', {});
    assert.deepEqual(list.result.tools.map((tool: { name: string }) => tool.name), MCP_TOOLS.map(tool => tool.name));
    const transcribe = list.result.tools.find((tool: { name: string }) => tool.name === 'request_transcription');
    assert.equal(transcribe.annotations.readOnlyHint, false);
    assert.deepEqual(transcribe.securitySchemes, [{ type: 'oauth2', scopes: ['recordings:transcribe'] }]);
    assert.deepEqual(transcribe._meta.securitySchemes, transcribe.securitySchemes);
    assert.equal(transcribe.annotations.openWorldHint, true);
    assert.equal(list.result.tools.find((tool: { name: string }) => tool.name === 'open_upload').annotations.readOnlyHint, true);
    assert.ok(list.result.tools.every((tool: { inputSchema: unknown }) => tool.inputSchema));
});

test('upload handoff returns only an app link without starting an upload', async () => {
    const response = await call('tools/call', { name: 'open_upload', arguments: {} });
    assert.equal(new URL(response.result.structuredContent.url).pathname, '/upload');
    assert.ok(!JSON.stringify(response).includes('r2Key'));
    assert.equal(response.result.isError, undefined);
});

test('MCP strips company privileges and enforces write/read scopes at invocation', async () => {
    const personal = personalMcpActor(actor);
    assert.deepEqual(personal.token.scopes, ['recordings:read']);
    assert.deepEqual(personal.principal!.scopes, ['recordings:read']);
    assert.equal(actor.token.scopes.length, 2);
    await assert.rejects(invokeCalleryTool(actor, 'request_transcription', { recordingId: '012345678901234567890123' }),
        (error: unknown) => error instanceof ApiError && error.status === 403);
    await assert.rejects(invokeCalleryTool({ token: { owner: 'owner', scopes: ['company:recordings:read'] } } as ApiActor, 'search_recordings', { query: 'delivery' }),
        (error: unknown) => error instanceof ApiError && error.status === 403);
    const response = await call('tools/call', { name: 'request_transcription', arguments: { recordingId: '012345678901234567890123' } });
    assert.equal(response.result.isError, true);
    assert.equal(JSON.parse(response.result.content[0].text).error.code, 'insufficient_scope');
    const challenge = response.result._meta['mcp/www_authenticate'][0];
    assert.match(challenge, /error="insufficient_scope"/);
    assert.match(challenge, /scope="recordings:transcribe"/);
    assert.match(challenge, /error_description=/);
    assert.match(challenge, /resource_metadata=/);
});
