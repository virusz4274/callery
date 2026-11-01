import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Db } from 'mongodb';
import { ApiError, PART_BYTES } from './contracts';
import { IntegrationCollections } from './database';
import { ingestionStorage } from './storage';
import { assertUploadAccess, ensureUploading, type UploadSession } from './uploads';

/** Bounded fallback for storage backends without verified signed lengths.
 * At most one part plus one incoming chunk is buffered; no unbounded PUT URL
 * or storage credential is exposed to the caller. */
export async function streamBoundedUpload(request: Request, session: UploadSession, db: Db): Promise<void> {
    ensureUploading(session);
    if (!request.body) throw new ApiError(400, 'empty_upload', 'Upload body required.');
    const length = request.headers.get('content-length');
    if (length && Number(length) !== session.input.fileSize) throw new ApiError(413, 'size_mismatch', 'Upload length does not match the reservation.');
    const uploads = db.collection<UploadSession>(IntegrationCollections.uploads);
    const owner = randomUUID();
    const claimed = await uploads.findOneAndUpdate({ _id: session._id, state: 'uploading', leaseUntil: { $lte: new Date() } }, { $set: { leaseOwner: owner, leaseUntil: new Date(Date.now() + 5 * 60_000) } }, { returnDocument: 'after' });
    if (!claimed) throw new ApiError(409, 'upload_busy', 'Another request is streaming this upload.');
    let uploadId: string | undefined;
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]);
    const source = Readable.fromWeb(request.body as import('node:stream/web').ReadableStream<Uint8Array>);
    source.on('error', () => {});
    const abort = () => source.destroy(new ApiError(408, 'upload_timeout', 'Upload timed out. Retry this upload.'));
    signal.addEventListener('abort', abort, { once: true });
    const heartbeat = setInterval(() => { void uploads.updateOne({ _id: session._id, leaseOwner: owner }, { $set: { leaseUntil: new Date(Date.now() + 5 * 60_000) } }).catch(() => {}); }, 30_000);
    heartbeat.unref();
    try {
        await assertUploadAccess(claimed, db);
        if (claimed.storageUploadId) await ingestionStorage.abort(claimed.stagingKey, claimed.storageUploadId);
        uploadId = await ingestionStorage.create(claimed.stagingKey, claimed.prepared.mimeType, signal);
        await uploads.updateOne({ _id: session._id, leaseOwner: owner }, { $set: { storageUploadId: uploadId } });
        let buffer = Buffer.alloc(0); let bytes = 0; let part = 1;
        for await (const value of source) {
            const chunk = Buffer.from(value);
            bytes += chunk.length;
            if (bytes > session.input.fileSize) throw new ApiError(413, 'size_mismatch', 'Upload exceeds the reserved size.');
            // The stream's chunk size is controlled by the transport; split it
            // before concatenation so even synthetic large chunks are bounded.
            let offset = 0;
            while (offset < chunk.length) {
                const take = Math.min(PART_BYTES - buffer.length, chunk.length - offset);
                buffer = Buffer.concat([buffer, chunk.subarray(offset, offset + take)]); offset += take;
                if (buffer.length === PART_BYTES) { await ingestionStorage.putPart(session.stagingKey, uploadId, part++, buffer, signal); buffer = Buffer.alloc(0); }
            }
        }
        if (bytes !== session.input.fileSize) throw new ApiError(400, 'size_mismatch', 'Upload is shorter than the reserved size.');
        if (buffer.length) await ingestionStorage.putPart(session.stagingKey, uploadId, part, buffer, signal);
        await ingestionStorage.complete(session.stagingKey, uploadId, bytes, signal);
    } catch (error) {
        if (uploadId) await ingestionStorage.abort(session.stagingKey, uploadId).catch(() => {});
        throw error;
    } finally {
        clearInterval(heartbeat);
        signal.removeEventListener('abort', abort); source.destroy();
        await uploads.updateOne({ _id: session._id, leaseOwner: owner }, { $set: { leaseUntil: new Date(0) }, $unset: { leaseOwner: '' } });
    }
}
