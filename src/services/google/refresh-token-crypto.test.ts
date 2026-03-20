import test from 'node:test';
import assert from 'node:assert/strict';

import {
    decryptGoogleRefreshToken,
    encryptGoogleRefreshToken,
    getGoogleTokenEncryptionErrorMessage,
    hasStoredGoogleRefreshToken,
    readStoredGoogleRefreshToken,
} from '@/services/google/refresh-token-crypto';

const TEST_ENV = {
    GOOGLE_TOKEN_ENCRYPTION_KEY: 'unit-test-google-token-secret',
    GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION: 'test-v1',
};

test('encrypts and decrypts Google refresh tokens with version metadata', () => {
    const encrypted = encryptGoogleRefreshToken('refresh-token-123', TEST_ENV);

    assert.equal(encrypted.refreshTokenKeyVersion, 'test-v1');
    assert.notEqual(encrypted.refreshTokenCiphertext, 'refresh-token-123');
    assert.equal(
        decryptGoogleRefreshToken(encrypted.refreshTokenCiphertext, TEST_ENV),
        'refresh-token-123'
    );
});

test('reads encrypted Google refresh tokens without requiring migration', () => {
    const encrypted = encryptGoogleRefreshToken('encrypted-token', TEST_ENV);

    assert.equal(
        readStoredGoogleRefreshToken({
            refreshTokenCiphertext: encrypted.refreshTokenCiphertext,
            refreshTokenKeyVersion: encrypted.refreshTokenKeyVersion,
        }, TEST_ENV),
        'encrypted-token'
    );
});

test('returns null when no encrypted Google refresh token is stored', () => {
    assert.equal(readStoredGoogleRefreshToken(undefined, TEST_ENV), null);
});

test('rejects encrypted token usage when the encryption key is missing', () => {
    const encrypted = encryptGoogleRefreshToken('refresh-token-123', TEST_ENV);
    assert.throws(
        () => readStoredGoogleRefreshToken({ refreshTokenCiphertext: encrypted.refreshTokenCiphertext }, {}),
        new RegExp(getGoogleTokenEncryptionErrorMessage().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    );
});

test('detects stored refresh tokens only in encrypted form', () => {
    assert.equal(hasStoredGoogleRefreshToken(undefined), false);
    assert.equal(hasStoredGoogleRefreshToken({ refreshTokenCiphertext: 'cipher' }), true);
});
