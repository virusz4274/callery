import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { getUserFromRequest } from '@/lib/auth-utils';
import { getConfiguredPublicAppOrigin } from '@/lib/public-url';
import { consumeRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { ApiError, UploadSchema, idempotencyKey } from './contracts';
import { jsonBody } from './http';
import { integrationDb, IntegrationCollections } from './database';
import { assertUploadAccess, cancelUpload, completeUpload, createBrowserUpload, ensureUploading, uploadResponse, type UploadSession } from './uploads';
import { ingestionStorage } from './storage';
import { directUploadLengthsVerified, expectedPartLength } from './upload-policy';
import { assertBrowserUploadOrigin, readBrowserUploadPart } from './browser-part';
import { processIngestion } from './worker';

const inputSchema = z.object({
    fileName: z.string().trim().min(1).max(255), fileSize: z.number().int().positive(), mimeType: z.string().max(127).optional(),
    bulkImportId: z.string().min(1).max(128).optional(),
}).strict();

export async function ownedBrowserUpload(owner: string, id: string) {
    const db = await integrationDb();
    const session = await db.collection<UploadSession>(IntegrationCollections.uploads).findOne({ _id: id, owner, integrationId: 'browser', mode: 'browser' });
    if (!session) throw new ApiError(404, 'not_found', 'Upload not found.');
    await assertUploadAccess(session, db, false);
    return session;
}

async function response(session: UploadSession, includeParts = false) {
    const parts = includeParts && session.state === 'uploading' && session.storageUploadId
        ? await ingestionStorage.parts(session.stagingKey, session.storageUploadId) : undefined;
    return { ...uploadResponse(session, parts), transport: directUploadLengthsVerified() ? 'direct' : 'proxy' };
}

/** Cookie-authenticated adapter over the shared durable ingestion engine. */
export async function browserUploadApi(request: NextRequest, path: string[]) {
    const requestId = randomUUID();
    const headers = { 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId };
    try {
        assertBrowserUploadOrigin(request, getConfiguredPublicAppOrigin());
        const owner = await getUserFromRequest(request);
        if (!owner) throw new ApiError(401, 'unauthorized', 'Sign in to upload recordings.');
        const rate = await consumeRateLimit({ key: `browser-upload:${owner}`, limit: 600, windowMs: 60_000 });
        if (!rate.allowed) throw new ApiError(429, 'rate_limited', 'Too many upload requests. Please wait.', 60);
        let data: unknown;
        if (!path.length && request.method === 'POST') {
            const initRate = await consumeRateLimit({ key: `browser-upload:init:${owner}`, limit: 30, windowMs: 60_000 });
            if (!initRate.allowed) throw new ApiError(429, 'rate_limited', 'Too many new uploads. Please wait.', 60);
            const input = await jsonBody(request, inputSchema);
            const metadata = UploadSchema.parse({ fileName: input.fileName, fileSize: input.fileSize, ...(input.mimeType ? { mimeType: input.mimeType } : {}) });
            data = await response(await createBrowserUpload(owner, metadata, idempotencyKey(request.headers), input.bulkImportId));
        } else {
            const session = await ownedBrowserUpload(owner, path[0] || '');
            if (path.length === 1 && request.method === 'GET') data = await response(session, true);
            else if (path.length === 1 && request.method === 'DELETE') data = { ...await cancelUpload(session), transport: directUploadLengthsVerified() ? 'direct' : 'proxy' };
            else if (path.length === 2 && path[1] === 'complete' && request.method === 'POST') {
                await jsonBody(request, z.object({}).strict());
                data = await response(await completeUpload(session));
                after(async () => { await processIngestion().catch(() => {}); });
            } else if (path.length === 3 && path[1] === 'parts') {
                await assertUploadAccess(session, await integrationDb());
                ensureUploading(session);
                const part = Number(path[2]);
                const length = expectedPartLength(session.input.fileSize, part);
                if (!session.storageUploadId) throw new ApiError(409, 'upload_busy', 'Upload is still being prepared.', 5);
                if (request.method === 'POST') {
                    if (!directUploadLengthsVerified()) throw new ApiError(409, 'use_proxy', 'Use the resumable upload proxy.');
                    await jsonBody(request, z.object({}).strict());
                    data = { url: await ingestionStorage.sign(session.stagingKey, session.storageUploadId, part, length) };
                } else if (request.method === 'PUT') {
                    const bytes = await readBrowserUploadPart(request, length);
                    // Access may have changed while the browser transferred this part.
                    await assertUploadAccess(session, await integrationDb());
                    const result = await ingestionStorage.putPart(session.stagingKey, session.storageUploadId, part, bytes, request.signal);
                    data = { partNumber: part, size: bytes.length, etag: result.ETag };
                } else throw new ApiError(405, 'method_not_allowed', 'Unsupported upload operation.');
            } else throw new ApiError(404, 'not_found', 'Upload endpoint not found.');
        }
        return NextResponse.json({ success: true, data }, { headers });
    } catch (error) {
        const failure = error instanceof ApiError ? error : error instanceof z.ZodError
            ? new ApiError(400, 'invalid_request', 'Invalid upload metadata.') : new ApiError(503, 'upload_unavailable', 'The upload service is unavailable. Retry this upload.', 5);
        if (failure.status >= 500) logger.error(`[browser-upload] ${failure.code}; requestId=${requestId}`);
        return NextResponse.json({ success: false, error: { code: failure.code, message: failure.message } }, {
            status: failure.status, headers: { ...headers, ...(failure.retryAfter ? { 'Retry-After': String(failure.retryAfter) } : {}) },
        });
    }
}
