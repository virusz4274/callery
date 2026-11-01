// Build from independent source snapshots. Never read deployment .env files or
// write generated files into the checkout used by a running development server.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sourceFileAllowed, isolatedEnvironment } from './ci-acceptance.mjs';

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const requiredNode = (await readFile(path.join(root, '.nvmrc'), 'utf8')).trim();
if (process.versions.node !== requiredNode) throw new Error(`Use host Node ${requiredNode}; found ${process.versions.node}.`);
const safe = isolatedEnvironment(process.env);
safe.PATH = `${path.dirname(process.execPath)}${path.delimiter}${safe.PATH || ''}`;
if (`pnpm@${execFileSync('pnpm', ['--version'], { env: safe, encoding: 'utf8' }).trim()}` !== manifest.packageManager) throw new Error('Use the pinned host pnpm version.');
const selected = process.argv.find(arg => arg.startsWith('--target='))?.slice('--target='.length) || 'all';
const targets = [
  { name: 'next-selfhost', script: 'build', billing: 'false' },
  { name: 'next-managed', script: 'build', billing: 'true' },
  { name: 'vinext', script: 'build:vinext', billing: 'false' },
].filter(target => selected === 'all' || selected === target.name);
if (!targets.length) throw new Error('Use --target=all, next-selfhost, next-managed or vinext.');
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(file => file && sourceFileAllowed(file)))];
const temporary = await mkdtemp(path.join(tmpdir(), 'vosift-runtime-builds-'));
const keep = process.argv.includes('--keep');
try {
  // Snapshot every target before the first build so no generated declarations,
  // PWA output or vinext metadata can contaminate another target's inputs.
  for (const target of targets) {
    const destination = path.join(temporary, target.name);
    await mkdir(destination);
    for (const file of files) {
      const output = path.join(destination, file);
      await mkdir(path.dirname(output), { recursive: true });
      try { await copyFile(path.join(root, file), output); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await symlink(path.join(root, 'node_modules'), path.join(destination, 'node_modules'), 'dir');
    // Dependencies were verified in the source checkout. pnpm must not try to
    // install through the snapshot's read-shared node_modules symlink.
    const workspaceFile = path.join(destination, 'pnpm-workspace.yaml');
    let workspace = '';
    try { workspace = await readFile(workspaceFile, 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    workspace = /^verifyDepsBeforeRun:/m.test(workspace)
      ? workspace.replace(/^verifyDepsBeforeRun:.*$/m, 'verifyDepsBeforeRun: false')
      : `${workspace}\nverifyDepsBeforeRun: false\n`;
    await writeFile(workspaceFile, workspace);
  }
  for (const target of targets) {
    console.log(`Building ${target.name} in ${path.join(temporary, target.name)}`);
    const environment = { ...safe, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:19473', NEXT_PUBLIC_ENABLE_BILLING: target.billing,
      MONGODB_URI: 'mongodb://127.0.0.1:1/isolated_build', MONGODB_CONNECTION_MODE: 'default', EMAIL_PROVIDER: target.billing === 'true' ? 'smtp' : 'none',
      SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', SMTP_SECURE: 'false', EMAIL_FROM: 'fixture@build.invalid',
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), GOOGLE_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      SHARE_LINK_SECRET: randomBytes(32).toString('hex'), SENTRY_SUPPRESS_INSTRUMENTATION_FILE_WARNING: '1' };
    await new Promise((resolve, reject) => {
      const child = spawn('pnpm', ['run', target.script], { cwd: path.join(temporary, target.name), env: environment, stdio: 'inherit' });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${target.name} exited with ${code}.`)));
    });
  }
} finally {
  if (keep) console.log(`Retained isolated build snapshots: ${temporary}`);
  else await rm(temporary, { recursive: true, force: true });
}
