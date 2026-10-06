import test from 'node:test';
import assert from 'node:assert/strict';
import { emailFrom, geminiApiKey, storageConfig } from './config';
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
