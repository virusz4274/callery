import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyExternalServiceError } from '@/lib/external-service-incident-classification';

test('classifies Gemini quota errors as degraded quota incidents', () => {
    const error = new Error(
        '{"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED"}}'
    );

    const result = classifyExternalServiceError(error);

    assert.equal(result.errorKind, 'quota');
    assert.equal(result.severity, 'degraded');
    assert.equal(result.httpStatus, 429);
    assert.equal(result.retryable, true);
});

test('classifies auth failures as down incidents', () => {
    const error = Object.assign(new Error('Unauthorized'), { status: 401 });

    const result = classifyExternalServiceError(error);

    assert.equal(result.errorKind, 'auth');
    assert.equal(result.severity, 'down');
    assert.equal(result.httpStatus, 401);
    assert.equal(result.retryable, false);
});

test('classifies upstream 5xx failures as degraded incidents', () => {
    const error = Object.assign(new Error('Provider unavailable'), { status: 503 });

    const result = classifyExternalServiceError(error);

    assert.equal(result.errorKind, 'upstream_5xx');
    assert.equal(result.severity, 'degraded');
    assert.equal(result.httpStatus, 503);
    assert.equal(result.retryable, true);
});

test('classifies network and timeout failures without HTTP status', () => {
    const networkResult = classifyExternalServiceError(new Error('fetch failed: ECONNRESET'));
    const timeoutResult = classifyExternalServiceError(new Error('request timed out'));

    assert.equal(networkResult.errorKind, 'network');
    assert.equal(networkResult.severity, 'degraded');
    assert.equal(timeoutResult.errorKind, 'timeout');
    assert.equal(timeoutResult.severity, 'degraded');
});
