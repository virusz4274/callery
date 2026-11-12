import test from 'node:test';
import assert from 'node:assert/strict';
import { emailFrom, geminiApiKey, storageConfig, transcriptionMultiplier, transcriptionPricing } from './config';
import { isBootstrapAdminEmail } from './admin-bootstrap';

test('only canonical configuration names activate the corresponding options', () => {
    const values: Record<string, string | undefined> = {
        GOOGLE_GENERATIVE_AI_API_KEY: undefined, GEMINI_API_KEY: 'removed-key',
        EMAIL_FROM: undefined, SMTP_FROM: 'removed@example.com',
        S3_REGION: undefined, R2_REGION: 'removed-region',
        S3_FORCE_PATH_STYLE: undefined, R2_FORCE_PATH_STYLE: 'true',
    };
    const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
    try {
        for (const [key, value] of Object.entries(values)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        assert.equal(geminiApiKey(), undefined);
        assert.throws(emailFrom, /Missing EMAIL_FROM/);
        assert.equal(storageConfig().region, 'auto');
        assert.equal(storageConfig().forcePathStyle, false);
        assert.equal(isBootstrapAdminEmail('admin@example.com', { NODE_ENV: 'test', ADMIN_BOOTSTRAP_EMAILS: 'admin@example.com' }), false);

        process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'canonical-key';
        process.env.EMAIL_FROM = 'canonical@example.com';
        process.env.S3_REGION = 'us-east-1';
        process.env.S3_FORCE_PATH_STYLE = 'true';
        assert.equal(geminiApiKey(), 'canonical-key');
        assert.equal(emailFrom(), 'canonical@example.com');
        assert.equal(storageConfig().region, 'us-east-1');
        assert.equal(storageConfig().forcePathStyle, true);
        assert.equal(isBootstrapAdminEmail('admin@example.com', { NODE_ENV: 'test', ADMIN_EMAILS: 'admin@example.com' }), true);
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});

test('transcription pricing accepts JSON with env-escaped quotes without changing multipliers', () => {
    const previous = process.env.TRANSCRIPTION_PRICING_JSON;
    try {
        delete process.env.TRANSCRIPTION_PRICING_JSON;
        assert.deepEqual(transcriptionPricing(), { soniox: 1, elevenlabs: 5, gemini: 0.5, openai_compat: 0.1 });

        const configured = { soniox: 2, gemini: 0.25, custom: 3 };
        const json = JSON.stringify(configured);
        for (const raw of [json, json.replace(/"/g, '\\"')]) {
            process.env.TRANSCRIPTION_PRICING_JSON = raw;
            assert.deepEqual(transcriptionPricing(), { ...configured, elevenlabs: 5, openai_compat: 0.1 });
            assert.equal(transcriptionMultiplier('gemini'), 0.25);
            assert.equal(transcriptionMultiplier('unknown'), 1);
        }

        // Already-valid JSON must keep escaped characters in provider names.
        process.env.TRANSCRIPTION_PRICING_JSON = JSON.stringify({ 'custom"provider': 2 });
        assert.equal(transcriptionMultiplier('custom"provider'), 2);
    } finally {
        if (previous === undefined) delete process.env.TRANSCRIPTION_PRICING_JSON;
        else process.env.TRANSCRIPTION_PRICING_JSON = previous;
    }
});

test('transcription pricing still rejects malformed JSON and invalid multipliers', () => {
    const previous = process.env.TRANSCRIPTION_PRICING_JSON;
    try {
        for (const raw of [
            '{soniox:1}', '{"soniox":}', 'null', '[]', '1', '"value"',
            '{"soniox":0}', '{"soniox":-1}', '{"soniox":"2"}', '{"soniox":1e309}',
            String.raw`{\"soniox\":0}`, String.raw`{\"soniox\":}`,
        ]) {
            process.env.TRANSCRIPTION_PRICING_JSON = raw;
            assert.throws(transcriptionPricing, /Invalid TRANSCRIPTION_PRICING_JSON:/);
        }
    } finally {
        if (previous === undefined) delete process.env.TRANSCRIPTION_PRICING_JSON;
        else process.env.TRANSCRIPTION_PRICING_JSON = previous;
    }
});

async function withConfiguration(values: Record<string, string | undefined>, work: () => void | Promise<void>) {
    const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
    try {
        for (const [key, value] of Object.entries(values)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        await work();
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
}

test('legacy env is the canonical lazy configuration and needs no unrelated integration', async () => {
    await withConfiguration({
        MONGODB_URI: undefined, SMTP_HOST: undefined, SMTP_PORT: 'invalid',
        R2_ENDPOINT: undefined, STRIPE_SECRET_KEY: undefined,
        NEXT_PUBLIC_APP_URL: 'https://configured.invalid', NEXT_PUBLIC_ENABLE_BILLING: 'false',
        NEXT_PUBLIC_MARKETING_URL: 'https://website.invalid',
    }, async () => {
        const { serverEnv, billingEnabled, smtpConfig, mongoUri } = await import('./config');
        const { env } = await import('./env');
        assert.equal(env, serverEnv, 'Compatibility imports must share one set of defaults and validation.');
        assert.equal(env.NEXT_PUBLIC_APP_URL, 'https://configured.invalid');
        assert.equal(env.NEXT_PUBLIC_MARKETING_URL, 'https://website.invalid');
        assert.equal(billingEnabled(), false);
        assert.equal(env.STRIPE_SECRET_KEY, '');
        assert.throws(mongoUri, /Missing MONGODB_URI/);
        assert.throws(smtpConfig, /Missing SMTP_HOST/);
        assert.throws(() => env.SMTP_PORT, /Invalid SMTP_PORT/);
    });
});

test('server configuration preserves defaults and remains lazy after an override changes', async () => {
    await withConfiguration({
        NODE_ENV: undefined, NEXT_PUBLIC_APP_URL: undefined, NEXT_PUBLIC_ENABLE_BILLING: undefined,
        NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU: undefined, EXPORT_JOB_STALE_MINUTES: undefined,
        SOFT_DELETE_RESTORE_DAYS: undefined, SONIOX_API_BASE_URL: undefined, SONIOX_MODEL_ID: undefined,
        ELEVENLABS_API_BASE_URL: undefined, ELEVENLABS_MODEL_ID: undefined,
    }, async () => {
        const { env } = await import('./env');
        const { publicEnv } = await import('./public-env');
        assert.equal(env.NODE_ENV, 'development');
        assert.equal(env.NEXT_PUBLIC_APP_URL, 'http://localhost:9000');
        assert.equal(publicEnv.NEXT_PUBLIC_APP_URL, '', 'Browser configuration preserves its explicit-origin default.');
        assert.equal(env.NEXT_PUBLIC_ENABLE_BILLING, false);
        assert.equal(env.NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU, true);
        assert.equal(env.EXPORT_JOB_STALE_MINUTES, 30);
        assert.equal(env.SOFT_DELETE_RESTORE_DAYS, 30);
        assert.equal(env.SONIOX_API_BASE_URL, 'https://api.soniox.com/v1');
        assert.equal(env.SONIOX_MODEL_ID, 'stt-async-v4');
        assert.equal(env.ELEVENLABS_API_BASE_URL, 'https://api.elevenlabs.io/v1');
        assert.equal(env.ELEVENLABS_MODEL_ID, 'scribe_v2');
        process.env.NEXT_PUBLIC_APP_URL = 'https://preserved-origin.invalid';
        process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
        process.env.EXPORT_JOB_STALE_MINUTES = '45';
        assert.equal(env.NEXT_PUBLIC_APP_URL, 'https://preserved-origin.invalid');
        assert.equal(publicEnv.NEXT_PUBLIC_APP_URL, env.NEXT_PUBLIC_APP_URL);
        assert.equal(env.NEXT_PUBLIC_ENABLE_BILLING, true);
        assert.equal(env.EXPORT_JOB_STALE_MINUTES, 45);
    });
});

test('SMTP accessors use one validation and secure-port policy', async () => {
    await withConfiguration({ SMTP_HOST: 'relay.invalid', SMTP_PORT: undefined, SMTP_SECURE: undefined }, async () => {
        const { serverEnv, smtpConfig } = await import('./config');
        assert.equal(serverEnv.SMTP_PORT, 587);
        assert.equal(smtpConfig().port, serverEnv.SMTP_PORT);
        assert.equal(smtpConfig().secure, false);
        process.env.SMTP_PORT = '465';
        assert.equal(serverEnv.SMTP_SECURE, true);
        assert.equal(smtpConfig().secure, true);
        process.env.SMTP_SECURE = 'false';
        assert.equal(smtpConfig().secure, false);
        assert.equal(serverEnv.SMTP_SECURE, false);
        process.env.SMTP_PORT = '2.5';
        assert.throws(smtpConfig, /Invalid SMTP_PORT/);
        assert.throws(() => serverEnv.SMTP_PORT, /Invalid SMTP_PORT/);
    });
});
