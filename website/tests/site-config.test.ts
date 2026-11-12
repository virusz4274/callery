import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const config = pathToFileURL(fileURLToPath(new URL('../src/lib/site.ts', import.meta.url))).href;
const script = `await import(${JSON.stringify(config)})`;
const printConfig = `const {siteConfig}=await import(${JSON.stringify(config)}); console.log(JSON.stringify(siteConfig))`;

function readConfig(environment: Record<string, string> = {}): { launchStage: string; indexable: boolean } {
    return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', printConfig], {
        env: { PATH: process.env.PATH, ...environment }, encoding: 'utf8', stdio: 'pipe',
    }));
}

test('launch stage defaults safely and accepts only the two supported states', () => {
    assert.equal(readConfig().launchStage, 'coming-soon');
    assert.equal(readConfig().indexable, false);
    assert.equal(readConfig({ SITE_LAUNCH_STAGE: 'open' }).launchStage, 'open');
    for (const stage of ['preview', 'OPEN', 'true', '']) {
        assert.throws(() => readConfig({ SITE_LAUNCH_STAGE: stage }), /Command failed/);
    }
});

test('Pages previews remain non-indexable in either launch state', () => {
    for (const stage of ['coming-soon', 'open']) {
        const environment = {
            SITE_LAUNCH_STAGE: stage, SITE_INDEXABLE: 'true', CF_PAGES: '1', CF_PAGES_BRANCH: 'feature-launch',
            SITE_URL: 'https://www.fixture-callery.com', PUBLIC_APP_URL: 'https://app.fixture-callery.com',
        };
        assert.equal(readConfig(environment).indexable, false);
        assert.equal(readConfig({ ...environment, CF_PAGES_BRANCH: 'main' }).indexable, true);
    }
});

test('indexed website configuration rejects placeholder, private, and malformed origins', () => {
    for (const origin of ['https://callery.example', 'https://www.example.com', 'https://[::1]', 'https://172.16.0.1',
        'https://169.254.1.2', 'http://www.fixture-callery.com', 'https://user:password@www.fixture-callery.com', 'https://www.fixture-callery.com/path']) {
        assert.throws(() => execFileSync(process.execPath, ['--input-type=module', '-e', script], {
            env: { PATH: process.env.PATH, SITE_URL: origin, PUBLIC_APP_URL: 'https://app.fixture-callery.com', SITE_INDEXABLE: 'true' },
            stdio: 'pipe',
        }), /Command failed/);
    }
});
