export interface SharedAudioSource {
    key: string;
    mimeType: string;
}

export interface SharedAudioMetadata {
    size: number;
    mimeType?: string;
    etag?: string;
}

export interface SharedAudioDependencies {
    resolve(token: string): Promise<SharedAudioSource | null>;
    head(source: SharedAudioSource, signal: AbortSignal): Promise<SharedAudioMetadata>;
    read(source: SharedAudioSource, metadata: SharedAudioMetadata, range: string | undefined,
        signal: AbortSignal): Promise<ReadableStream<Uint8Array>>;
}

/** Only one byte range is supported; audio players do not need multipart ranges. */
export function parseAudioRange(header: string, size: number): { start: number; end: number } | null {
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match || !size || (!match[1] && !match[2])) return null;
    if (!match[1]) {
        const count = Number(match[2]);
        return Number.isSafeInteger(count) && count > 0 ? { start: Math.max(0, size - count), end: size - 1 } : null;
    }
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return null;
    return { start, end: Math.min(end, size - 1) };
}

function privateHeaders() {
    return new Headers({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' });
}

/** Keep authorization in front of storage, including every subsequent range request. */
export function createSharedAudioHandler(deps: SharedAudioDependencies) {
    return async (request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> => {
        const headers = privateHeaders();
        const controller = new AbortController();
        const signal = AbortSignal.any([request.signal, controller.signal]);
        try {
            const { token } = await context.params;
            const source = await deps.resolve(token);
            if (!source) return new Response(null, { status: 404, headers });
            const metadata = await deps.head(source, signal);
            if (!Number.isSafeInteger(metadata.size) || metadata.size < 0) throw new Error('Invalid object length.');
            headers.set('Accept-Ranges', 'bytes');
            headers.set('Content-Type', metadata.mimeType || source.mimeType || 'application/octet-stream');
            headers.set('Content-Disposition', 'inline');
            headers.set('Content-Length', String(metadata.size));

            // Range applies to GET. HEAD reports the complete representation without reading audio.
            if (request.method === 'HEAD') return new Response(null, { headers });
            const rangeHeader = request.headers.get('range');
            const range = rangeHeader ? parseAudioRange(rangeHeader, metadata.size) : undefined;
            if (rangeHeader && !range) {
                headers.set('Content-Range', `bytes */${metadata.size}`);
                headers.set('Content-Length', '0');
                return new Response(null, { status: 416, headers });
            }
            if (range) {
                headers.set('Content-Range', `bytes ${range.start}-${range.end}/${metadata.size}`);
                headers.set('Content-Length', String(range.end - range.start + 1));
            }
            const upstream = await deps.read(source, metadata, range ? `bytes=${range.start}-${range.end}` : undefined, signal);
            const reader = upstream.getReader();
            const body = new ReadableStream<Uint8Array>({
                async pull(output) {
                    try {
                        const chunk = await reader.read();
                        if (chunk.done) { reader.releaseLock(); output.close(); }
                        else output.enqueue(chunk.value);
                    } catch (error) { controller.abort(); output.error(error); }
                },
                async cancel(reason) {
                    controller.abort(reason);
                    await reader.cancel(reason).catch(() => {});
                },
            });
            return new Response(body, { status: range ? 206 : 200, headers });
        } catch (error) {
            controller.abort();
            const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } };
            const missing = failure.name === 'NotFound' || failure.name === 'NoSuchKey' || failure.$metadata?.httpStatusCode === 404;
            return new Response(null, { status: missing ? 404 : request.signal.aborted ? 499 : 503, headers: privateHeaders() });
        }
    };
}
