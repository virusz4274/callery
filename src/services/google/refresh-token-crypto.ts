import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

type EnvLike = Record<string, string | undefined>;

type GoogleSyncLike = {
    refreshToken?: string;
    refreshTokenCiphertext?: string;
    refreshTokenKeyVersion?: string;
} | null | undefined;

type EncryptedGoogleRefreshToken = {
    refreshTokenCiphertext: string;
    refreshTokenKeyVersion: string;
};

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_SCHEME = 'gcm-v1';
const GOOGLE_TOKEN_ENCRYPTION_ERROR =
    'GOOGLE_TOKEN_ENCRYPTION_KEY must be set before Google refresh tokens can be stored or used.';

function getKeyMaterial(env: EnvLike = process.env): Buffer {
    const rawSecret = env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
    if (!rawSecret) {
        throw new Error(GOOGLE_TOKEN_ENCRYPTION_ERROR);
    }

    return createHash('sha256').update(rawSecret).digest();
}

function getKeyVersion(env: EnvLike = process.env): string {
    return env.GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION?.trim() || 'v1';
}

function toBase64Url(value: Buffer): string {
    return value.toString('base64url');
}

function fromBase64Url(value: string): Buffer {
    return Buffer.from(value, 'base64url');
}

export function hasStoredGoogleRefreshToken(googleSync?: GoogleSyncLike): boolean {
    return Boolean(googleSync?.refreshTokenCiphertext || googleSync?.refreshToken);
}

export function encryptGoogleRefreshToken(
    refreshToken: string,
    env: EnvLike = process.env
): EncryptedGoogleRefreshToken {
    if (!refreshToken.trim()) {
        throw new Error('Google refresh token cannot be empty');
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, getKeyMaterial(env), iv);
    const encrypted = Buffer.concat([
        cipher.update(refreshToken, 'utf8'),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
        refreshTokenCiphertext: [
            ENCRYPTION_SCHEME,
            toBase64Url(iv),
            toBase64Url(authTag),
            toBase64Url(encrypted),
        ].join(':'),
        refreshTokenKeyVersion: getKeyVersion(env),
    };
}

export function decryptGoogleRefreshToken(
    refreshTokenCiphertext: string,
    env: EnvLike = process.env
): string {
    const [scheme, ivValue, authTagValue, encryptedValue] = refreshTokenCiphertext.split(':');

    if (
        scheme !== ENCRYPTION_SCHEME
        || !ivValue
        || !authTagValue
        || !encryptedValue
    ) {
        throw new Error('Invalid Google refresh token ciphertext format');
    }

    const decipher = createDecipheriv(
        ENCRYPTION_ALGORITHM,
        getKeyMaterial(env),
        fromBase64Url(ivValue)
    );
    decipher.setAuthTag(fromBase64Url(authTagValue));

    return Buffer.concat([
        decipher.update(fromBase64Url(encryptedValue)),
        decipher.final(),
    ]).toString('utf8');
}

export function readStoredGoogleRefreshToken(
    googleSync?: GoogleSyncLike,
    env: EnvLike = process.env
): {
    refreshToken: string | null;
    needsMigration: boolean;
} {
    if (!googleSync) {
        return {
            refreshToken: null,
            needsMigration: false,
        };
    }

    if (googleSync.refreshTokenCiphertext) {
        return {
            refreshToken: decryptGoogleRefreshToken(googleSync.refreshTokenCiphertext, env),
            needsMigration: false,
        };
    }

    if (googleSync.refreshToken) {
        getKeyMaterial(env);
        return {
            refreshToken: googleSync.refreshToken,
            needsMigration: true,
        };
    }

    return {
        refreshToken: null,
        needsMigration: false,
    };
}

export function getGoogleTokenEncryptionErrorMessage(): string {
    return GOOGLE_TOKEN_ENCRYPTION_ERROR;
}
