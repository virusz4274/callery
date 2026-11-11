import { NextRequest } from 'next/server';
import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/lib/auth/server';
import { consumeRateLimit, getClientIpFromRequest } from '@/lib/rate-limit';

/**
 * Better Auth API handler: /api/auth/sign-in/email,
 * /api/auth/sign-up/email, /api/auth/sign-out, social callbacks, etc.
 */
async function handle(request: NextRequest): Promise<Response> {
    if (request.nextUrl.pathname.endsWith('/oauth2/register')) {
        const limit = await consumeRateLimit({ key: `oauth:register:${getClientIpFromRequest(request)}`, limit: 5, windowMs: 60_000 });
        if (!limit.allowed) return Response.json({ error: 'temporarily_unavailable', error_description: 'Too many client registrations. Try again later.' }, { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
    }
    if (request.method === 'GET' && request.nextUrl.pathname.endsWith('/oauth2/authorize') && !request.nextUrl.searchParams.has('scope')) {
        const url = new URL(request.url);
        url.searchParams.set('scope', 'recordings:read offline_access');
        request = new NextRequest(url, { headers: request.headers });
    }
    const handler = toNextJsHandler(await getAuth());
    return request.method === 'GET' ? handler.GET(request) : handler.POST(request);
}

export async function GET(request: NextRequest): Promise<Response> {
    return handle(request);
}

export async function POST(request: NextRequest): Promise<Response> {
    return handle(request);
}
