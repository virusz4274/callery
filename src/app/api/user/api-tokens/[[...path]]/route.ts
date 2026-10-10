import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getUserFromRequest } from '@/lib/auth-utils';
import { ApiError, TokenSchema } from '@/lib/integrations/contracts';
import { apiHandler, apiResponse, jsonBody } from '@/lib/integrations/http';
import { changeApiToken, createApiToken, listApiTokens } from '@/lib/integrations/tokens';
import { consumeRateLimit } from '@/lib/rate-limit';
import { isOriginAllowed } from '@/lib/rate-limit';

type Context = { params: Promise<{ path?: string[] }> };
async function dispatch(request: NextRequest, context: Context) {
    return apiHandler(async requestId => {
        // Credential management uses instance sessions only. Cross-origin browser
        // requests must never create credentials with ambient session cookies.
        if (!isOriginAllowed(request.headers.get('origin'), new URL(process.env.NEXT_PUBLIC_APP_URL!).origin)) throw new ApiError(403, 'forbidden', 'Invalid request origin.');
        const owner = await getUserFromRequest(request);
        if (!owner) throw new ApiError(401, 'unauthorized', 'Sign in to manage integration tokens.');
        const rate = await consumeRateLimit({ key: `api:credentials:${owner}`, limit: 30, windowMs: 60_000 });
        if (!rate.allowed) throw new ApiError(429, 'rate_limited', 'Too many credential operations.', 60);
        const path = (await context.params).path || [];
        if (!path.length && request.method === 'GET') return apiResponse(await listApiTokens(owner), 200, requestId);
        if (!path.length && request.method === 'POST') return apiResponse(await createApiToken(owner, await jsonBody(request, TokenSchema)), 201, requestId);
        if (path.length === 1 && request.method === 'DELETE') return apiResponse(await changeApiToken(owner, path[0], false), 200, requestId);
        if (path.length === 2 && path[1] === 'rotate' && request.method === 'POST') {
            await jsonBody(request, z.object({}).strict());
            return apiResponse(await changeApiToken(owner, path[0], true), 200, requestId);
        }
        throw new ApiError(404, 'not_found', 'Token endpoint not found.');
    });
}
export const GET = dispatch;
export const POST = dispatch;
export const DELETE = dispatch;
