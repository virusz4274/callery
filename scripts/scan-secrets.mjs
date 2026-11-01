// Never print scanner stdout, source lines, matched values, or raw reports.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function summarizeFinding(finding) {
  return {
    fingerprint: createHash('sha256').update(`${finding.RuleID}\0${finding.Secret}`).digest('hex'),
    rule: finding.RuleID,
    file: finding.File,
    line: finding.StartLine,
    ...(finding.Commit ? { commit: finding.Commit } : {}),
  };
}

export function unreviewedHistory(findings, baseline) {
  const reviewed = new Set(baseline.revokedFingerprints || []);
  return findings.filter(finding => !reviewed.has(finding.fingerprint));
}

export function scanSecrets(root, approvedFingerprints = []) {
  const binary = process.env.GITLEAKS_BIN || 'gitleaks';
  let version;
  try { version = execFileSync(binary, ['version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { throw new Error('Install the pinned Gitleaks 8.30.1 scanner or set GITLEAKS_BIN. No scanner output was printed.'); }
  if (version !== '8.30.1') throw new Error('Secret scanning requires Gitleaks 8.30.1.');
  const temporary = mkdtempSync(path.join(tmpdir(), 'callery-secret-scan-'));
  chmodSync(temporary, 0o700);
  const baselinePath = path.join(root, 'security/revoked-history.json');
  try {
    const tree = path.join(temporary, 'tree'); mkdirSync(tree);
    // Scan only version-controlled files. Never read an ignored deployment .env.
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
    for (const file of files) {
      if (!existsSync(path.join(root, file))) continue;
      const destination = path.join(tree, file);
      mkdirSync(path.dirname(destination), { recursive: true }); copyFileSync(path.join(root, file), destination);
    }
    const scan = (kind, target, name) => {
      const report = path.join(temporary, `${name}.json`);
      // Raw findings stay inside this private temporary directory, then are
      // hashed in memory. Redacting before hashing would merge distinct keys.
      const args = [kind, target, '--no-banner', '--exit-code=0', '--report-format=json', `--report-path=${report}`];
      if (kind === 'git') args.push('--log-opts=--all');
      try { execFileSync(binary, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 }); }
      catch { throw new Error(`Gitleaks ${name} scan failed. Raw output was withheld to protect credentials.`); }
      try {
        const findings = JSON.parse(readFileSync(report, 'utf8'));
        if (!Array.isArray(findings) || findings.some(item => !item || typeof item.RuleID !== 'string' || typeof item.Secret !== 'string' || typeof item.File !== 'string' || !Number.isInteger(item.StartLine))) throw new Error();
        return findings.map(summarizeFinding);
      } catch { throw new Error(`Gitleaks ${name} returned an invalid report. Its contents were withheld.`); }
    };
    const current = scan('dir', tree, 'current');
    const history = scan('git', root, 'history');
    let baseline;
    try {
      baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : { revokedFingerprints: [] };
      if (!Array.isArray(baseline.revokedFingerprints) || baseline.revokedFingerprints.some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) throw new Error();
    } catch { throw new Error('The reviewed-history baseline is invalid. Its contents were withheld.'); }
    if (approvedFingerprints.length) {
      if (process.env.CONFIRM_REVOKED_HISTORY !== 'yes') throw new Error('Recording a history baseline requires CONFIRM_REVOKED_HISTORY=yes after operator confirmation of revocation.');
      if (current.length) throw new Error('Current-tree credentials must be removed before recording revoked history.');
      const found = new Set(history.map(item => item.fingerprint));
      if (approvedFingerprints.some(value => !/^[a-f0-9]{64}$/.test(value) || !found.has(value))) throw new Error('A reviewed fingerprint must exactly match a reported historical finding.');
      mkdirSync(path.dirname(baselinePath), { recursive: true });
      writeFileSync(baselinePath, `${JSON.stringify({
        scanner: 'gitleaks-8.30.1',
        policy: 'Operator-confirmed revoked historical credentials. Never suppress current-tree findings.',
        reviewedAt: new Date().toISOString().slice(0, 10),
        revokedFingerprints: [...new Set([...baseline.revokedFingerprints, ...approvedFingerprints])].sort(),
      }, null, 2)}\n`);
      baseline.revokedFingerprints = [...new Set([...baseline.revokedFingerprints, ...approvedFingerprints])];
    }
    const unknown = unreviewedHistory(history, baseline);
    // Gitleaks reports contain only SHA-256 fingerprints and locations here.
    console.log(JSON.stringify({ current, unreviewedHistory: unknown, reviewedHistoryCount: history.length - unknown.length }, null, 2));
    if (current.length || unknown.length) process.exitCode = 1;
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { scanSecrets(process.cwd(), process.argv.filter(arg => arg.startsWith('--acknowledge-fingerprint=')).map(arg => arg.slice('--acknowledge-fingerprint='.length))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
