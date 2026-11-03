// Production Docker acceptance in an isolated source copy. Requires Docker,
// installed repository dependencies and the exact host Node/pnpm versions.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function sourceFileAllowed(file) {
  return !file.split('/').some(part => /^(?:(?:\.env|\.dev\.vars)(?:\..*)?|\.git|node_modules|\.next|release-artifacts|test-results|playwright-report)$/.test(part))
    && !/(?:^|\/)service-account[^/]*\.json$|\.(?:pem|key|p12|pfx)$/.test(file);
}

export function isolatedEnvironment(parent) {
  return Object.fromEntries(['PATH', 'HOME', 'USER', 'TMPDIR', 'XDG_CACHE_HOME', 'PNPM_HOME', 'CI', 'PLAYWRIGHT_BROWSERS_PATH', 'GITHUB_ACTIONS'].filter(key => parent[key]).map(key => [key, parent[key]]));
}

async function unusedPort(reserved) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const server = createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    if (!reserved.has(port)) { reserved.add(port); return port; }
  }
  throw new Error('Could not allocate distinct available fixture ports.');
}

export async function waitUntil(probe, label, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { if (await probe()) return; } catch { /* startup is expected to be transient */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for isolated ${label}.`);
}

async function main() {
  const billing = process.argv.find(arg => arg.startsWith('--billing='))?.split('=')[1];
  if (!['false', 'true'].includes(billing)) throw new Error('Use --billing=false or --billing=true.');
  const root = process.cwd();
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const requiredNode = (await readFile(path.join(root, '.nvmrc'), 'utf8')).trim();
  if (process.versions.node !== requiredNode) throw new Error(`Use host Node ${requiredNode}; found ${process.versions.node}.`);
  const safe = isolatedEnvironment(process.env);
  // Keep subprocess scripts on the same verified host Node even when this
  // script was launched by absolute path from another version-manager shell.
  safe.PATH = `${path.dirname(process.execPath)}${path.delimiter}${safe.PATH || ''}`;
  const pnpmVersion = execFileSync('pnpm', ['--version'], { env: safe, encoding: 'utf8' }).trim();
  if (manifest.packageManager !== `pnpm@${pnpmVersion}`) throw new Error('Use the pnpm version pinned by packageManager.');
  try { execFileSync('docker', ['info'], { env: safe, stdio: 'ignore' }); }
  catch { throw new Error('Docker Engine is required for acceptance. No server, configuration or toolchain was changed.'); }
  const temporary = await mkdtemp(path.join(tmpdir(), 'callery-acceptance-'));
  const project = `callery-ci-${randomUUID().slice(0, 8)}`;
  const snapshot = path.join(temporary, 'source'); await mkdir(snapshot);
  const fixtureFile = path.join(temporary, 'fixture.env');
  const composeFile = path.join(temporary, 'compose.json');
  let created = false;
  const command = (binary, args, options = {}) => new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: snapshot, env: safe, stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${binary} failed with exit code ${code}.`)));
  });
  const composeArgs = ['compose', '--project-name', project, '--project-directory', snapshot, '--env-file', fixtureFile, '-f', composeFile];
  const compose = (...args) => command('docker', [...composeArgs, ...args]);
  const capturedCompose = (...args) => execFileSync('docker', [...composeArgs, ...args], { cwd: snapshot, env: safe, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(sourceFileAllowed);
    for (const file of new Set(files)) {
      if (!file) continue;
      const destination = path.join(snapshot, file); await mkdir(path.dirname(destination), { recursive: true });
      try { await copyFile(path.join(root, file), destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await symlink(path.join(root, 'node_modules'), path.join(snapshot, 'node_modules'), 'dir');
    const ports = new Set();
    const appPort = await unusedPort(ports); const storagePort = await unusedPort(ports);
    const base = `http://127.0.0.1:${appPort}`; const storage = `http://127.0.0.1:${storagePort}`;
    const database = `vosift_api_${randomUUID().replaceAll('-', '')}`;
    const fixture = {
      NEXT_PUBLIC_APP_URL: base, NEXT_PUBLIC_ENABLE_BILLING: billing,
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), GOOGLE_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION: 'v1', SHARE_LINK_SECRET: randomBytes(32).toString('hex'),
      ADMIN_EMAILS: 'operator@acceptance.invalid', CRON_SECRET: randomBytes(32).toString('hex'),
      MONGODB_URI: `mongodb://mongo:27017/${database}`, MONGODB_CONNECTION_MODE: 'default',
      R2_ENDPOINT: 'http://minio:9000', S3_PUBLIC_ENDPOINT: storage,
      R2_ACCESS_KEY_ID: 'acceptance-fixture', R2_SECRET_ACCESS_KEY: randomBytes(32).toString('hex'), R2_BUCKET_NAME: 'acceptance',
      S3_REGION: 'us-east-1', S3_FORCE_PATH_STYLE: 'true',
      EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'Callery <noreply@acceptance.invalid>', SMTP_HOST: 'mailpit', SMTP_PORT: '1025', SMTP_SECURE: 'false',
      APP_PORT: String(appPort), MINIO_API_PORT: String(storagePort), MINIO_CONSOLE_PORT: String(await unusedPort(ports)),
      // Blank keys and internal-only runtime networking prevent live provider use.
      STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', SONIOX_API_KEY: '', ELEVENLABS_API_KEY: '', GOOGLE_GENERATIVE_AI_API_KEY: '',
    };
    const envText = Object.entries(fixture).map(([key, value]) => `${key}=${value}`).join('\n');
    await writeFile(fixtureFile, envText, { mode: 0o600 });
    // Only this newly created temporary source copy receives fixture .env values.
    await writeFile(path.join(snapshot, '.env'), envText, { mode: 0o600 });
    const config = JSON.parse(execFileSync('docker', ['compose', '--project-directory', snapshot, '--env-file', fixtureFile, '-f', path.join(snapshot, 'docker-compose.yml'), '--profile', 'selfhost', 'config', '--format', 'json'], { cwd: snapshot, env: safe, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    for (const service of Object.values(config.services)) { delete service.profiles; delete service.container_name; service.restart = 'no'; }
    config.services.mongo.ports = [{ target: 27017, published: '0', host_ip: '127.0.0.1' }];
    config.services.mailpit = {
      image: 'axllent/mailpit:v1.31.6@sha256:23fe39e81bde596a918000b3135c0f85dc8bb4c9ea6be274b051143f3e300387',
      ports: [{ target: 8025, published: '0', host_ip: '127.0.0.1' }, { target: 1025, published: '0', host_ip: '127.0.0.1' }],
    };
    config.services.app.depends_on.mailpit = { condition: 'service_started', required: true };
    // Runtime containers can use only the fixture network. Image/dependency builds
    // retain ordinary build networking; app code cannot reach paid provider APIs.
    config.networks = { default: { internal: true } };
    for (const volume of Object.values(config.volumes || {})) delete volume.name;
    delete config.name;
    await writeFile(composeFile, JSON.stringify(config), { mode: 0o600 });
    created = true;
    await compose('up', '--build', '-d');
    await waitUntil(async () => (await fetch(`${base}/api/health`)).ok, 'application health', 180_000);
    const portOf = (service, port) => Number(capturedCompose('port', service, String(port)).split(':').at(-1));
    const mongoUri = `mongodb://127.0.0.1:${portOf('mongo', 27017)}/${database}`;
    const mailpit = `http://127.0.0.1:${portOf('mailpit', 8025)}`;
    const hostEnv = { ...safe, ...fixture, NODE_ENV: 'test', MONGODB_URI: mongoUri,
      R2_ENDPOINT: storage, SMTP_HOST: '127.0.0.1', SMTP_PORT: String(portOf('mailpit', 1025)),
      VOSIFT_TEST_MONGODB_URI: mongoUri, VOSIFT_TEST_STORAGE_ENDPOINT: storage,
      VOSIFT_TEST_STORAGE_ACCESS_KEY: fixture.R2_ACCESS_KEY_ID, VOSIFT_TEST_STORAGE_SECRET_KEY: fixture.R2_SECRET_ACCESS_KEY,
      VOSIFT_TEST_STORAGE_BUCKET: fixture.R2_BUCKET_NAME, VOSIFT_TEST_API_BASE_URL: base, VOSIFT_TEST_API_MONGODB_URI: mongoUri,
      TEST_BASE_URL: base, TEST_MAILPIT_URL: mailpit,
      VOSIFT_TEST_SHARE_SECRET: fixture.SHARE_LINK_SECRET,
    };
    if (process.argv.includes('--checks')) {
      const checksEnv = { ...hostEnv, NEXT_PUBLIC_ENABLE_BILLING: 'false' };
      await command('pnpm', ['check'], { env: checksEnv });
      await command('pnpm', ['peers', 'check'], { env: checksEnv });
      await command('pnpm', ['audit:prod'], { env: checksEnv });
      await command(process.execPath, ['--test', 'scripts/release-tooling.test.mjs'], { env: checksEnv });
    }
    await command(process.execPath, ['--import', 'tsx', 'scripts/ci-smoke.mjs', 'seed'], { env: hostEnv });
    // Export the manifest from this exact image so action fixtures match its IDs.
    const manifestPath = path.join(temporary, 'server-reference-manifest.json');
    await command('docker', ['cp', `${capturedCompose('ps', '-q', 'app')}:/app/.next/server/server-reference-manifest.json`, manifestPath]);
    await command('pnpm', ['exec', 'playwright', 'test', '--grep-invert', 'authenticated user journey works|email signup, password controls'], { env: { ...hostEnv, TEST_ACTION_MANIFEST_PATH: manifestPath } });
    // A real database-tools dump/restore, with all fixture writes stopped.
    await compose('stop', 'cron', 'app');
    await compose('exec', '-T', 'mongo', 'mongodump', `--db=${database}`, '--archive=/tmp/acceptance.gz', '--gzip', '--quiet');
    await compose('exec', '-T', 'mongo', 'mongorestore', '--archive=/tmp/acceptance.gz', '--gzip', `--nsInclude=${database}.*`, `--nsFrom=${database}.*`, `--nsTo=${database}_restore.*`, '--stopOnError', '--quiet');
    await command(process.execPath, ['--import', 'tsx', 'scripts/ci-smoke.mjs', 'restore'], { env: hostEnv });
    config.services.app.environment.MONGODB_URI = `mongodb://mongo:27017/${database}_restore`;
    config.services.app.environment.R2_BUCKET_NAME = 'acceptance-restore';
    await writeFile(composeFile, JSON.stringify(config), { mode: 0o600 });
    await compose('up', '-d', '--no-deps', 'app');
    await waitUntil(async () => (await fetch(`${base}/api/health`)).ok, 'restored application health');
    await command(process.execPath, ['--import', 'tsx', 'scripts/ci-smoke.mjs', 'verify-restore'], { env: hostEnv });
    console.log(`Acceptance passed: billing=${billing}, Docker startup, isolated integrations, SMTP, upload/playback and dump/bucket restore.`);
  } finally {
    let cleaned = true;
    if (created) {
      // Project name and config are generated by this process; never clean a port
      // or stop any process belonging to the user's deployment or another chat.
      try { await compose('down', '--volumes', '--remove-orphans'); }
      catch { cleaned = false; process.exitCode = 1; console.error(`Cleanup needs attention for generated Compose project ${project}; its temporary configuration is retained at ${temporary}.`); }
    }
    if (cleaned) await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
