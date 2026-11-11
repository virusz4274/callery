import { ApiError, PART_BYTES } from './contracts';

export function assertBrowserUploadOrigin(request: Request, publicOrigin: string) {
    if (request.method === 'GET') return;
    if (request.headers.get('origin') !== publicOrigin || request.headers.get('sec-fetch-site') === 'cross-site') {
        throw new ApiError(403, 'forbidden', 'Invalid request origin.');
    }
}

/** Buffer at most one reserved part. A bounded proxy must never restart a whole upload. */
export async function readBrowserUploadPart(request: Request, expected: number): Promise<Buffer> {
    if (!Number.isSafeInteger(expected) || expected < 1 || expected > PART_BYTES) throw new ApiError(400, 'invalid_part', 'Invalid part size.');
    const declared = request.headers.get('content-length');
    if (declared !== null && Number(declared) !== expected) throw new ApiError(400, 'size_mismatch', 'Part length does not match the reserved size.');
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError(400, 'invalid_part', 'Part body required.');
    const abort = () => { void reader.cancel().catch(() => {}); };
    request.signal.addEventListener('abort', abort, { once: true });
    const bytes = Buffer.allocUnsafe(expected);
    let received = 0;
    try {
        for (;;) {
            request.signal.throwIfAborted();
            const { done, value } = await reader.read();
            if (done) break;
            if (received + value.byteLength > expected) throw new ApiError(413, 'size_mismatch', 'Part exceeds the reserved size.');
            bytes.set(value, received);
            received += value.byteLength;
        }
        request.signal.throwIfAborted();
        if (received !== expected) throw new ApiError(400, 'size_mismatch', 'Part is shorter than the reserved size.');
        return bytes;
    } finally {
        request.signal.removeEventListener('abort', abort);
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}
