import { NextRequest } from 'next/server';
import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/lib/auth/server';

/**
 * Better Auth API handler: /api/auth/sign-in/email,
 * /api/auth/sign-up/email, /api/auth/sign-out, social callbacks, etc.
 */
async function handle(request: NextRequest): Promise<Response> {
    const handler = toNextJsHandler(await getAuth());
    return request.method === 'GET' ? handler.GET(request) : handler.POST(request);
}

export async function GET(request: NextRequest): Promise<Response> {
    return handle(request);
}

export async function POST(request: NextRequest): Promise<Response> {
    return handle(request);
}
