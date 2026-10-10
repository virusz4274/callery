import { after, NextRequest } from 'next/server';
import { z } from 'zod';
import { ApiError, MAX_FILE_BYTES, PART_BYTES, SESSION_MS, TranscribeSchema, UploadSchema, URL_SECONDS, idempotencyKey, simpleUploadLimit } from '@/lib/integrations/contracts';
import { authenticateApi, requireScope } from '@/lib/integrations/tokens';
import { apiHandler, apiRateLimit, apiResponse, corsHeaders, jsonBody } from '@/lib/integrations/http';
import { cancelUpload, completeUpload, createUpload, ensureUploading, ownedUpload, uploadResponse } from '@/lib/integrations/uploads';
import { ingestionStorage } from '@/lib/integrations/storage';
import { apiRecording, listRecordings, recordingResponse } from '@/lib/integrations/recordings';
import { getSignedR2Url } from '@/lib/r2';
import { getTeamSettings } from '@/lib/team-policy';
import { simpleUpload } from '@/lib/integrations/simple-upload';
import { processTranscriptionJobs, recordingJobStatus, requestTranscription } from '@/lib/integrations/jobs';
import { openApiDocument } from '@/lib/integrations/openapi';

export const runtime = 'nodejs';
export const maxDuration = 300;
type Context = { params: Promise<{ path: string[] }> };
async function dispatch(request: NextRequest, context: Context) {
    return apiHandler(async requestId => {
        const path = (await context.params).path; const method = request.method;
        if (method === 'GET' && path.join('/') === 'openapi.json') return Response.json(openApiDocument(), { headers: { ...corsHeaders, 'Cache-Control': 'no-store', 'X-Request-Id': requestId } });
        if (method === 'GET' && path.join('/') === 'capabilities') return apiResponse({ apiVersion: 'v1', authentication: 'api-token', uploadModes: ['direct-multipart', 'multipart-form'], maxFileSize: MAX_FILE_BYTES, simpleUploadMaxFileSize: simpleUploadLimit(), partSize: PART_BYTES, uploadSessionSeconds: SESSION_MS / 1000, signedUrlSeconds: URL_SECONDS, formats: ['mp3', 'wav', 'm4a', 'mp4', 'webm'], maxTranscriptionFileSize: 2 * 1024 ** 3, notifications: 'polling' }, 200, requestId);
        const actor = await authenticateApi(request.headers);
        await apiRateLimit(actor, method === 'POST' && (path.join('/') === 'uploads' || path.join('/') === 'recordings'));
        const respond = (data: unknown, status = 200) => apiResponse(data, status, requestId);
        if (path.join('/') === 'me' && method === 'GET') {
            const team = await getTeamSettings();
            return respond({ user: { id: actor.user._id.toString(), name: actor.user.name, role: actor.user.role }, scopes: actor.token.scopes, expiresAt: actor.token.expiresAt?.toISOString() ?? null, storageUsed: actor.user.storageUsed, storageAllocation: actor.user.storageAllocation, processing: team.enabled ? { mode: team.transcriptionMode, provider: team.transcriptionProvider } : { mode: actor.user.transcriptionSettings.autoTranscribe ? 'automatic' : 'manual', provider: actor.user.transcriptionSettings.defaultProvider }, retention: team.enabled ? team.retentionPolicy : actor.user.storageSettings.deletionPolicy });
        }
        if (path[0] === 'uploads') {
            requireScope(actor, 'recordings:upload');
            if (path.length === 1 && method === 'POST') return respond(uploadResponse(await createUpload(actor, await jsonBody(request, UploadSchema), idempotencyKey(request.headers))), 201);
            if (path.length >= 2) {
                const session = await ownedUpload(actor, path[1]);
                if (path.length === 2 && method === 'GET') {
                    const parts = session.state === 'uploading' && session.storageUploadId ? await ingestionStorage.parts(session.stagingKey, session.storageUploadId) : undefined;
                    return respond(uploadResponse(session, parts));
                }
                if (path.length === 2 && method === 'DELETE') return respond(await cancelUpload(session));
                if (path.length === 3 && path[2] === 'parts' && method === 'POST') {
                    ensureUploading(session);
                    if (session.mode !== 'direct' || !session.storageUploadId) throw new ApiError(409, 'invalid_upload_mode', 'This session does not accept direct-upload parts.');
                    const body = await jsonBody(request, z.object({ partNumbers: z.array(z.number().int().min(1).max(Math.ceil(session.input.fileSize / PART_BYTES))).min(1).max(50) }).strict());
                    return respond({ parts: await Promise.all([...new Set(body.partNumbers)].map(async partNumber => ({ partNumber, method: 'PUT', url: await ingestionStorage.sign(session.stagingKey, session.storageUploadId!, partNumber), size: Math.min(PART_BYTES, session.input.fileSize - (partNumber - 1) * PART_BYTES), expiresAt: new Date(Date.now() + URL_SECONDS * 1000).toISOString(), headers: {} }))) });
                }
                if (path.length === 3 && path[2] === 'complete' && method === 'POST') {
                    const result = await completeUpload(session);
                    after(async () => { await processTranscriptionJobs(); });
                    return respond(uploadResponse(result));
                }
            }
        }
        if (path[0] === 'recordings') {
            if (path.length === 1 && method === 'GET') return respond(await listRecordings(actor, request.nextUrl.searchParams));
            if (path.length === 1 && method === 'POST') {
                requireScope(actor, 'recordings:upload');
                const result = await simpleUpload(request, actor, idempotencyKey(request.headers));
                after(async () => { await processTranscriptionJobs(); });
                return respond(uploadResponse(result), 201);
            }
            if (path.length === 2 && method === 'GET') {
                const recording = await apiRecording(actor, path[1], 'read');
                return respond({ ...recordingResponse(recording, true), processing: await recordingJobStatus(recording.authSubject, path[1]) });
            }
            if (path.length === 3 && path[2] === 'download' && method === 'GET') {
                const recording = await apiRecording(actor, path[1], 'download');
                return respond({ url: await getSignedR2Url(recording.r2Key, 300), expiresAt: new Date(Date.now() + 300_000).toISOString() });
            }
            if (path.length === 3 && path[2] === 'transcribe' && method === 'POST') {
                const recording = await apiRecording(actor, path[1], 'transcribe');
                const result = await requestTranscription(actor.token.owner, recording, await jsonBody(request, TranscribeSchema));
                after(async () => { await processTranscriptionJobs(); });
                return respond(result, 202);
            }
        }
        throw new ApiError(404, 'not_found', 'API endpoint not found.');
    });
}
export const GET = dispatch;
export const POST = dispatch;
export const DELETE = dispatch;
export async function OPTIONS() { return new Response(null, { status: 204, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } }); }
