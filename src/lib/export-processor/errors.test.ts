import test from 'node:test';
import assert from 'node:assert/strict';
import { ExportProcessingError, exportFailureMessage, isRetryableExportFailure, toExportFailure, wrapExportError } from './errors';

test('export diagnostics preserve safe nested transport and HTTP details without provider data', () => {
    const secret = 'private-key/account/audio?credential=secret';
    const cause = Object.assign(new Error(secret), { code: 'UND_ERR_INVALID_ARG', url: `https://${secret}` });
    const original = Object.assign(new TypeError('fetch failed', { cause }), {
        $metadata: { httpStatusCode: 503, requestId: secret }, $response: { body: secret },
    });
    const wrapped = wrapExportError(original, 'archive-upload');
    assert.equal(wrapped.cause, original);
    const failure = toExportFailure(wrapped);
    assert.deepEqual(failure, { stage: 'archive-upload', code: 'storage', retryable: true, transportCode: 'UND_ERR_INVALID_ARG', httpStatus: 503 });
    assert.equal(JSON.stringify(failure).includes(secret), false);
    assert.equal(exportFailureMessage(failure).includes(secret), false);
    assert.equal(toExportFailure(Object.assign(new Error(secret), { code: secret })).transportCode, undefined);
});

test('export diagnostic traversal is bounded and handles cyclic causes', () => {
    const error = Object.assign(new Error('private-provider-message'), { code: 'ECONNRESET', cause: undefined as unknown });
    error.cause = error;
    assert.deepEqual(toExportFailure(error, 'source-download'), {
        stage: 'source-download', code: 'transport', retryable: true, transportCode: 'ECONNRESET',
    });
    assert.equal(toExportFailure({ $metadata: { httpStatusCode: '503' } }).httpStatus, undefined);
    assert.equal(toExportFailure({ $metadata: { httpStatusCode: 999 } }).httpStatus, undefined);
});

test('manual retry accepts transient storage failures and rejects source, access and lifecycle violations', () => {
    for (const status of [408, 429, 500, 503]) {
        assert.equal(isRetryableExportFailure(toExportFailure({ $metadata: { httpStatusCode: status } }, 'archive-upload')), true);
    }
    for (const status of [400, 401, 403, 404]) {
        assert.equal(isRetryableExportFailure(toExportFailure({ $metadata: { httpStatusCode: status } }, 'archive-upload')), false);
    }
    for (const code of ['source-changed', 'source-size', 'permission', 'cancelled', 'budget', 'attempts-exhausted', 'archive', 'internal'] as const) {
        const failure = toExportFailure(new ExportProcessingError('validation', code, Object.assign(new Error('secret'), { code: 'ECONNRESET' })));
        assert.equal(isRetryableExportFailure(failure), false, code);
        assert.equal(isRetryableExportFailure({ ...failure, retryable: true }), false, `defensive ${code}`);
    }
    assert.equal(isRetryableExportFailure(toExportFailure(new DOMException('private timeout reason', 'TimeoutError'))), true);
});

test('legacy retry compatibility is restricted to the known saved fetch failure', () => {
    assert.equal(isRetryableExportFailure(undefined, 'fetch failed'), true);
    assert.equal(isRetryableExportFailure(undefined, 'TypeError: fetch failed'), true);
    for (const message of ['Unknown error', 'Recordings changed', 'private fetch failed object', undefined]) {
        assert.equal(isRetryableExportFailure(undefined, message), false);
    }
    assert.equal(toExportFailure(new Error('An archive source exceeded its verified size and reserved cost budget.'), 'source-download').code, 'source-size');
    assert.equal(wrapExportError(new Error('private filesystem error'), 'archive-build', 'archive').message, 'The archive could not be built.');
});
