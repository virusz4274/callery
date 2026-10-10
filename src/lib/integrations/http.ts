import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, jsonDepth } from './contracts';
import { consumeRateLimit } from '@/lib/rate-limit';
import type { ApiActor } from './tokens';
import { logger } from '@/lib/logger';

export const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key', 'Access-Control-Expose-Headers': 'X-Request-Id, Retry-After' };
export async function jsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError(400, 'invalid_request', 'JSON body required.');
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read(); if (done) break;
            bytes += value.byteLength;
            if (bytes > 64 * 1024) throw new ApiError(413, 'request_too_large', 'JSON body exceeds 64 KiB.');
            chunks.push(value);
        }
        let body: unknown;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(400, 'invalid_json', 'Invalid JSON body.'); }
        if (jsonDepth(body) > 7) throw new ApiError(400, 'invalid_request', 'Request JSON is nested too deeply.');
        const parsed = schema.safeParse(body);
        if (!parsed.success) throw new ApiError(400, 'invalid_request', parsed.error.issues.map(issue => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; '));
        return parsed.data;
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function apiRateLimit(actor: ApiActor, newUpload = false) {
    const checks = [
        { key: `api:token:${actor.token._id}`, limit: 120, windowMs: 60_000 },
        { key: `api:owner:${actor.token.owner}`, limit: 600, windowMs: 60_000 },
        ...(newUpload ? [{ key: `api:upload:${actor.token._id}`, limit: 10, windowMs: 60_000 }] : []),
    ];
    for (const check of checks) {
        const result = await consumeRateLimit(check);
        if (!result.allowed) throw new ApiError(429, 'rate_limited', 'Too many requests. Retry after the indicated delay.', Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)));
    }
}
export function apiResponse(data: unknown, status = 200, requestId: string = randomUUID()) {
    return NextResponse.json({ success: true, data, requestId }, { status, headers: { ...corsHeaders, 'Cache-Control': 'no-store', 'X-Request-Id': requestId } });
}
export async function apiHandler(work: (requestId: string) => Promise<Response>) {
    const requestId = randomUUID();
    try { return await work(requestId); }
    catch (error) {
        const failure = error instanceof ApiError ? error : new ApiError(500, 'internal_error', 'An unexpected error occurred.');
        // SDK errors may contain signed URLs and private metadata. Log identifiers only.
        if (failure.status >= 500) logger.error(`[integration-api] ${failure.code}; requestId=${requestId}`);
        return NextResponse.json({ success: false, error: { code: failure.code, message: failure.message }, requestId }, { status: failure.status, headers: { ...corsHeaders, 'Cache-Control': 'no-store', 'X-Request-Id': requestId, ...(failure.retryAfter ? { 'Retry-After': String(failure.retryAfter) } : {}), ...(failure.status === 401 ? { 'WWW-Authenticate': 'Bearer realm="Vosift API"' } : {}) } });
    }
}
