import { after } from 'next/server';
import { authenticateApi } from '@/lib/integrations/tokens';
import { apiRateLimit } from '@/lib/integrations/http';
import { ApiError } from '@/lib/integrations/contracts';
import { integrationOAuthChallenge } from '@/lib/integrations/oauth';
import { processTranscriptionJobs } from '@/lib/integrations/jobs';
import { createCalleryMcpHandler } from '@/lib/mcp/server';
import { getConfiguredPublicAppOrigin } from '@/lib/public-url';

export const runtime = 'nodejs';
export const maxDuration = 300;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id',
    'Access-Control-Expose-Headers': 'WWW-Authenticate, Retry-After, MCP-Protocol-Version' };

export async function POST(request: Request) {
    try {
        // Browser credential requests are bearer-only, never authenticated by cookies.
        const origin = request.headers.get('origin');
        if (origin && origin !== getConfiguredPublicAppOrigin()) {
            const allowed = ['https://chatgpt.com', 'https://claude.ai', 'https://gemini.google.com'];
            let url: URL;
            try { url = new URL(origin); } catch { throw new ApiError(403, 'forbidden_origin', 'Invalid MCP client origin.'); }
            if (!allowed.includes(url.origin) && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new ApiError(403, 'forbidden_origin', 'This browser origin is not an allowed MCP client.');
        }
        const actor = await authenticateApi(request.headers, undefined, 'mcp');
        await apiRateLimit(actor);
        const handler = createCalleryMcpHandler(actor, () => after(async () => { await processTranscriptionJobs(); }));
        const response = await handler.fetch(request);
        for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
        response.headers.set('Cache-Control', 'no-store');
        return response;
    } catch (error) {
        const failure = error instanceof ApiError ? error : new ApiError(500, 'internal_error', 'Callery could not complete this request.');
        return Response.json({ error: { code: failure.code, message: failure.message } }, { status: failure.status,
            headers: { ...cors, 'Cache-Control': 'no-store', ...(failure.status === 401 ? { 'WWW-Authenticate': integrationOAuthChallenge('mcp') } : {}),
                ...(failure.retryAfter ? { 'Retry-After': String(failure.retryAfter) } : {}) } });
    }
}
export async function GET() { return new Response('This stateless MCP endpoint accepts POST requests.', { status: 405, headers: { ...cors, Allow: 'POST, OPTIONS', 'Cache-Control': 'no-store' } }); }
export const DELETE = GET;
export async function OPTIONS() { return new Response(null, { status: 204, headers: cors }); }
