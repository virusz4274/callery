import busboy from 'busboy';
import { randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ApiError, PART_BYTES, UploadSchema, simpleUploadLimit, type UploadInput } from './contracts';
import type { ApiActor } from './tokens';
import { IntegrationCollections, integrationDb } from './database';
import { createUpload, completeUpload, ensureUploading, type UploadSession } from './uploads';
import { ingestionStorage } from './storage';

/** Streaming multipart form. Metadata must precede the file so authorization,
 * validation and quota reservation happen before any bytes reach storage. */
export async function simpleUpload(request: Request, actor: ApiActor, key: string) {
    if (!request.body || !request.headers.get('content-type')?.startsWith('multipart/form-data')) throw new ApiError(415, 'unsupported_media_type', 'Send multipart/form-data with metadata followed by file.');
    const limit = simpleUploadLimit();
    if (Number(request.headers.get('content-length') || 0) > limit + 64 * 1024) throw new ApiError(413, 'request_too_large', 'Use resumable uploads for larger recordings.');
    let parser: ReturnType<typeof busboy>;
    try { parser = busboy({ headers: { 'content-type': request.headers.get('content-type')! }, limits: { files: 1, fields: 1, parts: 3, fileSize: limit + 1, fieldSize: 64 * 1024 } }); }
    catch { throw new ApiError(400, 'invalid_request', 'Invalid multipart boundary.'); }
    let metadata: UploadInput | undefined; let session: UploadSession | undefined; let task: Promise<void> | undefined; let failure: unknown;
    const abort = (error: unknown) => { failure = error; parser.destroy(error instanceof Error ? error : new Error('Upload failed')); };
    parser.on('field', (name, value, info) => {
        if (name !== 'metadata' || metadata || info.valueTruncated) { abort(new ApiError(400, 'invalid_request', 'Supply one metadata JSON field before the file.')); return; }
        try {
            const parsed = UploadSchema.safeParse(JSON.parse(value));
            if (!parsed.success) throw new ApiError(400, 'invalid_request', 'Invalid upload metadata.');
            if (parsed.data.fileSize > limit) throw new ApiError(413, 'request_too_large', 'Use resumable uploads for larger recordings.');
            metadata = parsed.data;
        } catch (error) { abort(error instanceof ApiError ? error : new ApiError(400, 'invalid_json', 'Invalid metadata JSON.')); }
    });
    parser.on('file', (name, stream) => {
        // Busboy destroys its current file stream on parser failure. Attach an
        // error listener even when this file is rejected before async iteration.
        stream.on('error', () => {});
        if (name !== 'file' || !metadata || task) { stream.resume(); failure = new ApiError(400, 'invalid_request', 'Supply metadata before the single file field.'); return; }
        stream.on('limit', () => abort(new ApiError(413, 'request_too_large', 'File exceeds the simple upload limit.')));
        task = (async () => {
            const currentSession = await createUpload(actor, metadata!, key, 'simple');
            session = currentSession;
            if (currentSession.state === 'completed') { stream.resume(); return; }
            ensureUploading(currentSession);
            const db = await integrationDb(); const uploads = db.collection<UploadSession>(IntegrationCollections.uploads); const lease = randomUUID();
            const claimed = await uploads.findOneAndUpdate({ _id: currentSession._id, state: 'uploading', leaseUntil: { $lte: new Date() } }, { $set: { leaseOwner: lease, leaseUntil: new Date(Date.now() + 5 * 60_000) } });
            if (!claimed) throw new ApiError(409, 'upload_busy', 'Another request is streaming this upload.', 5);
            const heartbeat = setInterval(() => { void uploads.updateOne({ _id: session!._id, leaseOwner: lease }, { $set: { leaseUntil: new Date(Date.now() + 5 * 60_000) } }).catch(() => {}); }, 30_000); heartbeat.unref();
            try {
                // Simple retries restart their byte transfer but retain the same
                // session and recording identity.
                if (currentSession.storageUploadId) await ingestionStorage.abort(currentSession.stagingKey, currentSession.storageUploadId);
                const uploadId = await ingestionStorage.create(currentSession.stagingKey, currentSession.prepared.mimeType);
                await uploads.updateOne({ _id: currentSession._id, leaseOwner: lease }, { $set: { storageUploadId: uploadId } });
                currentSession.storageUploadId = uploadId;
                let buffer = Buffer.alloc(0); let bytes = 0; let part = 1;
                for await (const chunk of stream) {
                    bytes += chunk.length;
                    if (bytes > metadata!.fileSize || bytes > limit) throw new ApiError(413, 'size_mismatch', 'File exceeds the declared size.');
                    buffer = Buffer.concat([buffer, chunk]);
                    while (buffer.length >= PART_BYTES) { await ingestionStorage.putPart(currentSession.stagingKey, uploadId, part++, buffer.subarray(0, PART_BYTES)); buffer = Buffer.from(buffer.subarray(PART_BYTES)); }
                }
                if (bytes !== metadata!.fileSize) throw new ApiError(400, 'size_mismatch', 'File size does not match metadata.');
                if (buffer.length) await ingestionStorage.putPart(currentSession.stagingKey, uploadId, part, buffer);
            } finally {
                clearInterval(heartbeat);
                await uploads.updateOne({ _id: currentSession._id, leaseOwner: lease }, { $set: { leaseUntil: new Date(0) }, $unset: { leaseOwner: '' } });
            }
        })();
        // Attach rejection handling immediately; the body pipeline may still be
        // consuming later multipart fields when storage reports a failure.
        void task.catch(abort);
    });
    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit'] as const) parser.on(event, () => abort(new ApiError(400, 'invalid_request', 'Only metadata and one file are accepted.')));
    let total = 0;
    const counter = new Transform({ transform(chunk, _encoding, callback) { total += chunk.length; callback(total > limit + 64 * 1024 ? new ApiError(413, 'request_too_large', 'Request exceeds the simple upload limit.') : null, chunk); } });
    try {
        await pipeline(Readable.fromWeb(request.body as import('node:stream/web').ReadableStream<Uint8Array>), counter, parser);
        await task;
        if (!session || !task || failure) throw failure || new ApiError(400, 'invalid_request', 'One metadata field and one file are required.');
        return completeUpload(session);
    } catch (error) {
        await task?.catch(() => {});
        if (failure instanceof ApiError) throw failure;
        if (error instanceof ApiError) throw error;
        throw new ApiError(400, 'upload_interrupted', 'Upload interrupted. Retry with the same Idempotency-Key.');
    }
}
