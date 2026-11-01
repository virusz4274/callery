import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFinding, unreviewedHistory, scanSecrets } from './scan-secrets.mjs';
import { sourceFileAllowed, isolatedEnvironment } from './ci-acceptance.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('secret findings expose locations and stable fingerprints, never matched bytes', () => {
  const finding = { RuleID: 'fixture-rule', Secret: 'private-fixture-value', Match: 'do not report this', File: 'old.ts', StartLine: 4, Commit: 'abc' };
  const safe = summarizeFinding(finding);
  assert.equal(JSON.stringify(safe).includes('private-fixture-value'), false);
  assert.equal(JSON.stringify(safe).includes('do not report this'), false);
  assert.match(safe.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(summarizeFinding({ ...finding, File: 'moved.ts', StartLine: 9 }).fingerprint, safe.fingerprint);
  assert.deepEqual(unreviewedHistory([safe], { revokedFingerprints: [safe.fingerprint] }), []);
  assert.equal(unreviewedHistory([safe], { revokedFingerprints: [] }).length, 1);
});

test('acceptance snapshots exclude deployment configuration and generated state', () => {
  for (const file of ['.env', '.env.local', 'nested/.env.production', 'service-account.json', 'tls.key', '.next/server.js', 'node_modules/a.js', '.git/config']) assert.equal(sourceFileAllowed(file), false, file);
  for (const file of ['package.json', 'Dockerfile', 'src/app/page.tsx', 'scripts/ci-smoke.mjs']) assert.equal(sourceFileAllowed(file), true, file);
  const safe = isolatedEnvironment({ PATH: '/usr/bin', HOME: '/fixture', STRIPE_SECRET_KEY: 'private-value', MONGODB_URI: 'private-uri', NEXT_PUBLIC_APP_URL: 'https://shared.invalid' });
  assert.equal(safe.PATH, '/usr/bin');
  assert.equal('STRIPE_SECRET_KEY' in safe, false);
  assert.equal('MONGODB_URI' in safe, false);
  assert.equal('NEXT_PUBLIC_APP_URL' in safe, false);
});

test('scanner requires explicit historical review, never suppresses current findings, and hides raw scanner output', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'callery-scanner-test-'));
  const saved = { binary: process.env.GITLEAKS_BIN, confirmed: process.env.CONFIRM_REVOKED_HISTORY, exitCode: process.exitCode, log: console.log };
  const logs = [];
  try {
    execFileSync('git', ['init', '-q', root]);
    writeFileSync(path.join(root, '.gitignore'), '.env\n');
    writeFileSync(path.join(root, '.env'), 'ignored-deployment-fixture');
    writeFileSync(path.join(root, 'plain.ts'), 'export const example = true;');
    execFileSync('git', ['add', '.gitignore', 'plain.ts'], { cwd: root });
    const binary = path.join(root, 'fixture-scanner');
    const finding = { RuleID: 'fixture-rule', Secret: 'private-fixture-value', File: 'old.ts', StartLine: 4, Commit: 'abc' };
    writeFileSync(binary, `#!/usr/bin/env node\nconst fs=require('node:fs'),path=require('node:path');\nif(process.argv[2]==='version'){console.log('8.30.1');process.exit(0);}\nconst target=process.argv[3];if(process.argv[2]==='dir'&&fs.existsSync(path.join(target,'.env')))process.exit(2);\nconst found=process.argv[2]==='git'||fs.existsSync(path.join(target,'leak.ts'));\nfs.writeFileSync(process.argv.find(x=>x.startsWith('--report-path=')).slice(14),JSON.stringify(found?[${JSON.stringify(finding)}]:[]));\nconsole.log('raw private-fixture-value');\n`, { mode: 0o700 });
    process.env.GITLEAKS_BIN = binary; delete process.env.CONFIRM_REVOKED_HISTORY;
    console.log = value => logs.push(value);
    scanSecrets(root);
    assert.equal(process.exitCode, 1, 'Unknown history must fail the release gate.'); process.exitCode = saved.exitCode;
    const fingerprint = summarizeFinding(finding).fingerprint;
    assert.throws(() => scanSecrets(root, [fingerprint]), /CONFIRM_REVOKED_HISTORY/);
    process.env.CONFIRM_REVOKED_HISTORY = 'yes';
    scanSecrets(root, [fingerprint]);
    assert.ok(existsSync(path.join(root, 'security/revoked-history.json')));
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'security/revoked-history.json'))).revokedFingerprints, [fingerprint]);
    writeFileSync(path.join(root, 'leak.ts'), 'synthetic-current-finding');
    execFileSync('git', ['add', 'leak.ts'], { cwd: root });
    scanSecrets(root);
    assert.equal(process.exitCode, 1, 'Reviewed history must never exempt a current-tree finding.');
    const scannerSource = readFileSync(binary, 'utf8');
    writeFileSync(binary, scannerSource.replace('JSON.stringify(found?', "'malformed private-fixture-value' || JSON.stringify(found?"));
    assert.throws(() => scanSecrets(root), error => {
      assert.equal(error.message.includes('private-fixture-value'), false);
      return error.message.includes('invalid report');
    });
    assert.equal(logs.join('\n').includes('private-fixture-value'), false, 'Raw reports/stdout must remain private.');
  } finally {
    console.log = saved.log; process.exitCode = saved.exitCode;
    if (saved.binary === undefined) delete process.env.GITLEAKS_BIN; else process.env.GITLEAKS_BIN = saved.binary;
    if (saved.confirmed === undefined) delete process.env.CONFIRM_REVOKED_HISTORY; else process.env.CONFIRM_REVOKED_HISTORY = saved.confirmed;
    rmSync(root, { recursive: true, force: true });
  }
});
