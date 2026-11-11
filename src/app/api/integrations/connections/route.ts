import { NextRequest } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { ApiError } from '@/lib/integrations/contracts';
import { apiHandler, apiResponse } from '@/lib/integrations/http';
import { listOAuthConnections } from '@/lib/integrations/oauth';
import { consumeRateLimit, isOriginAllowed } from '@/lib/rate-limit';
import { getConfiguredPublicAppOrigin } from '@/lib/public-url';

export async function GET(request: NextRequest) {
    return apiHandler(async requestId => {
        if (!isOriginAllowed(request.headers.get('origin'), getConfiguredPublicAppOrigin())) throw new ApiError(403, 'forbidden', 'Invalid request origin.');
        const owner = await getUserFromRequest(request);
        if (!owner) throw new ApiError(401, 'unauthorized', 'Sign in to manage connected apps.');
        if (!(await consumeRateLimit({ key: `oauth:connections:${owner}`, limit: 30, windowMs: 60_000 })).allowed) throw new ApiError(429, 'rate_limited', 'Too many connection operations.', 60);
        return apiResponse(await listOAuthConnections(owner), 200, requestId);
    });
}
