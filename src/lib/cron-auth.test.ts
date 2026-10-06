import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';

test('isAuthorizedCronRequest accepts matching Bearer token', () => {
    assert.equal(isAuthorizedCronRequest('Bearer s3cret', 's3cret'), true);
});

test('isAuthorizedCronRequest rejects bare tokens and other authentication schemes', () => {
    assert.equal(isAuthorizedCronRequest('s3cret', 's3cret'), false);
    assert.equal(isAuthorizedCronRequest('Basic s3cret', 's3cret'), false);
});

test('isAuthorizedCronRequest rejects null header', () => {
    assert.equal(isAuthorizedCronRequest(null, 's3cret'), false);
});

test('isAuthorizedCronRequest rejects empty header', () => {
    assert.equal(isAuthorizedCronRequest('', 's3cret'), false);
});

test('isAuthorizedCronRequest rejects mismatched token', () => {
    assert.equal(isAuthorizedCronRequest('Bearer wrong', 's3cret'), false);
});

test('isAuthorizedCronRequest rejects different-length token', () => {
    assert.equal(isAuthorizedCronRequest('Bearer s3', 's3cret'), false);
});

test('isAuthorizedCronRequest rejects when expected secret is empty', () => {
    assert.equal(isAuthorizedCronRequest('Bearer s3cret', ''), false);
});

test('isAuthorizedCronRequest is case-insensitive on the Bearer prefix', () => {
    assert.equal(isAuthorizedCronRequest('bearer s3cret', 's3cret'), true);
    assert.equal(isAuthorizedCronRequest('BEARER s3cret', 's3cret'), true);
});
