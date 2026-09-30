import { NextRequest, NextResponse } from 'next/server';
import { toNextJsHandler } from 'better-auth/next-js';
import { authProvider } from '@/lib/config';
import { getLocalAuth } from '@/lib/auth/local';

/**
 * better-auth API handler (local auth mode only): /api/auth/sign-in/email,
 * /api/auth/sign-up/email, /api/auth/sign-out, social callbacks, etc.
 * Coexists with the firebase-specific /api/auth/login + /api/auth/logout
 * routes (exact paths win over this catch-all). Returns 404 unless
 * AUTH_PROVIDER=local so Firebase mode never exposes these endpoints.
 */
async function handle(request: NextRequest): Promise<Response> {
    if (authProvider() !== 'local') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const handler = toNextJsHandler(getLocalAuth());
    return request.method === 'GET' ? handler.GET(request) : handler.POST(request);
}

export async function GET(request: NextRequest): Promise<Response> {
    return handle(request);
}

export async function POST(request: NextRequest): Promise<Response> {
    return handle(request);
}
