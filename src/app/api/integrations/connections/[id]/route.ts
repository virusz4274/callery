import { NextRequest } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { ApiError } from '@/lib/integrations/contracts';
import { apiHandler, apiResponse } from '@/lib/integrations/http';
import { revokeOAuthConnection } from '@/lib/integrations/oauth';
import { assertBrowserUploadOrigin } from '@/lib/integrations/browser-part';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getConfiguredPublicAppOrigin } from '@/lib/public-url';

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    return apiHandler(async requestId => {
        assertBrowserUploadOrigin(request, getConfiguredPublicAppOrigin());
        const owner = await getUserFromRequest(request);
        if (!owner) throw new ApiError(401, 'unauthorized', 'Sign in to manage connected apps.');
        if (!(await consumeRateLimit({ key: `oauth:connections:${owner}`, limit: 30, windowMs: 60_000 })).allowed) throw new ApiError(429, 'rate_limited', 'Too many connection operations.', 60);
        const id = (await context.params).id;
        if (!id || id.length > 200) throw new ApiError(404, 'not_found', 'Connection not found.');
        await revokeOAuthConnection(owner, id);
        return apiResponse({ disconnected: true }, 200, requestId);
    });
}
