import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { productionAppEnvironment, runProductionApp } from './production-app.mjs';

test('production app uses only committed public origins and preserves runtime credentials', async () => {
  const saved = { NEXT_PUBLIC_APP_URL: 'https://test-instance.invalid', STRIPE_SECRET_KEY: 'synthetic-server-fixture', PATH: '/host/tools' };
  const environment = productionAppEnvironment(saved);
  assert.equal(environment.NEXT_PUBLIC_APP_URL, 'https://app.getcallery.com');
  assert.equal(environment.NEXT_PUBLIC_MARKETING_URL, 'https://getcallery.com');
  assert.equal(environment.NEXT_PUBLIC_ENABLE_BILLING, 'true');
  assert.equal(environment.CALLERY_DEPLOYMENT, 'production');
  assert.equal(environment.STRIPE_SECRET_KEY, saved.STRIPE_SECRET_KEY);
  assert.equal(saved.NEXT_PUBLIC_APP_URL, 'https://test-instance.invalid');
  assert.equal(environment.PATH, '/host/tools');
  const profile = JSON.parse(await readFile(new URL('../deployment/production.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(profile).sort(), ['appOrigin', 'websiteOrigin']);
});

test('production wrapper rejects unknown actions without invoking deployment', async () => {
  await assert.rejects(runProductionApp('publish-everything'), /build or deploy/);
});

test('production commands refuse deployment files before starting a child process', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'callery-production-guard-'));
  try {
    await mkdir(path.join(directory, 'scripts'));
    await mkdir(path.join(directory, 'deployment'));
    const script = path.join(directory, 'scripts/production-app.mjs');
    await copyFile(new URL('./production-app.mjs', import.meta.url), script);
    await copyFile(new URL('../deployment/production.json', import.meta.url), path.join(directory, 'deployment/production.json'));
    const isolated = await import(pathToFileURL(script).href);
    for (const name of ['.env', '.env.production.local', '.dev.vars', '.dev.vars.production']) {
      const deploymentFile = path.join(directory, name);
      await writeFile(deploymentFile, 'SYNTHETIC_TEST_SETTING=fixture\n');
      await assert.rejects(isolated.runProductionApp('build'), /isolated checkout without \.env or \.dev\.vars files/);
      await rm(deploymentFile);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
