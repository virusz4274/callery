export class TranscriptionResponseTooLargeError extends Error {
    constructor() { super('The provider transcript exceeds its supported response size.'); this.name = 'TranscriptionResponseTooLargeError'; }
}

/** Read at most the verified response envelope; neither JSON nor error bodies are unbounded. */
export async function readBoundedTranscriptionText(response: Response, maximumBytes: number): Promise<string> {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) throw new Error('Invalid transcription response limit.');
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maximumBytes) {
        await response.body?.cancel();
        throw new TranscriptionResponseTooLargeError();
    }
    if (!response.body) return '';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > maximumBytes) throw new TranscriptionResponseTooLargeError();
            chunks.push(value);
        }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    return Buffer.concat(chunks).toString('utf8');
}
