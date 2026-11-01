import { Readable, Transform } from 'node:stream';

/** Content-Length is optional on object responses; count actual streamed bytes too. */
export function boundedExportStream(source: Readable, maximumBytes: number): Readable {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) throw new Error('A verified source size is required for this archive.');
    let received = 0;
    const bounded = new Transform({ transform(chunk: Buffer, _encoding, callback) {
        received += chunk.byteLength;
        if (received > maximumBytes) callback(new Error('An archive source exceeded its verified size and reserved cost budget.'));
        else callback(null, chunk);
    } });
    source.on('error', error => bounded.destroy(error));
    bounded.on('error', () => source.destroy());
    return source.pipe(bounded);
}
