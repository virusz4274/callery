import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import productionProfile from '../deployment/production.json' with { type: 'json' };

/** Apply only public deployment choices; secrets remain caller/provider-owned. */
export function productionAppEnvironment(environment = process.env) {
  return {
    ...environment,
    CALLERY_DEPLOYMENT: 'production',
    NEXT_PUBLIC_APP_URL: productionProfile.appOrigin,
    NEXT_PUBLIC_MARKETING_URL: productionProfile.websiteOrigin,
    NEXT_PUBLIC_ENABLE_BILLING: 'true',
  };
}

export async function runProductionApp(action) {
  const scripts = { build: 'build:vinext', deploy: 'deploy:vinext' };
  if (!Object.hasOwn(scripts, action)) throw new Error('Use production-app.mjs build or deploy.');
  const directory = fileURLToPath(new URL('../', import.meta.url));
  const files = await readdir(directory);
  if (files.some(name => /^(?:\.env|\.dev\.vars)(?:\..+)?$/.test(name) && !name.endsWith('.example'))) {
    throw new Error('Production app commands require an isolated checkout without .env or .dev.vars files. Supply reviewed production settings explicitly; shared deployment configuration was not read.');
  }
  const environment = productionAppEnvironment();
  console.log(`${action === 'build' ? 'Building' : 'Deploying'} Callery for ${environment.NEXT_PUBLIC_APP_URL}.`);
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['run', scripts[action]], {
      cwd: directory,
      env: environment,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { process.exitCode = await runProductionApp(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
