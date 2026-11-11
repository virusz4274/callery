import { getConfiguredPublicAppOrigin } from '@/lib/public-url';
import { OAUTH_SCOPES } from '@/lib/integrations/oauth-state';

export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{ resource: string[] }> }) {
    const path = (await context.params).resource.join('/');
    if (path !== 'mcp/v1' && path !== 'api/v1') return new Response(null, { status: 404 });
    const origin = getConfiguredPublicAppOrigin();
    return Response.json({ resource: `${origin}/${path}`, authorization_servers: [`${origin}/api/auth`],
        scopes_supported: [...OAUTH_SCOPES], bearer_methods_supported: ['header'], resource_documentation: `${origin}/developers` },
    { headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } });
}
export function OPTIONS() { return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } }); }
