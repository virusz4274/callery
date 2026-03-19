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

    assert.deepEqual(
        readStoredGoogleRefreshToken({
            refreshTokenCiphertext: encrypted.refreshTokenCiphertext,
            refreshTokenKeyVersion: encrypted.refreshTokenKeyVersion,
        }, TEST_ENV),
        {
            refreshToken: 'encrypted-token',
            needsMigration: false,
        }
    );
});

test('treats legacy plaintext Google refresh tokens as needing migration', () => {
    assert.deepEqual(
        readStoredGoogleRefreshToken({
            refreshToken: 'legacy-refresh-token',
        }, TEST_ENV),
        {
            refreshToken: 'legacy-refresh-token',
            needsMigration: true,
        }
    );
});

test('rejects plaintext token usage when the encryption key is missing', () => {
    assert.throws(
        () => readStoredGoogleRefreshToken({ refreshToken: 'legacy-refresh-token' }, {}),
        new RegExp(getGoogleTokenEncryptionErrorMessage().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    );
});

test('detects stored refresh tokens in both encrypted and legacy form', () => {
    assert.equal(hasStoredGoogleRefreshToken(undefined), false);
    assert.equal(hasStoredGoogleRefreshToken({ refreshToken: 'legacy' }), true);
    assert.equal(hasStoredGoogleRefreshToken({ refreshTokenCiphertext: 'cipher' }), true);
});
