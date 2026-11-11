import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import { getAuth } from '@/lib/auth/server';

export const runtime = 'nodejs';
export async function GET(request: Request) { return oauthProviderAuthServerMetadata(await getAuth())(request); }
export function OPTIONS() { return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } }); }
