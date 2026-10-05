import { execFileSync } from 'node:child_process';
import { isVerifiedLocalFix } from './dependency-patch.mjs';

const cli = process.env.npm_execpath;
if (!cli || !cli.includes('pnpm')) {
    throw new Error('Run this check with pnpm run audit or pnpm run audit:prod.');
}
const args = ['audit', '--json'];
if (process.argv.includes('--prod')) args.push('--prod');
const isScript = /\.(?:cjs|mjs|js)$/.test(cli);
let raw;
try {
    raw = execFileSync(isScript ? process.execPath : cli, isScript ? [cli, ...args] : args, {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000,
    });
} catch (error) {
    if (!error.stdout?.trim()) throw error;
    raw = error.stdout;
}
const report = JSON.parse(raw);
if (report.error || !report.metadata?.vulnerabilities || !report.advisories) {
    throw new Error(`The registry audit failed or returned an unknown format: ${raw}`);
}
let unresolved = 0;
const advisories = Object.values(report.advisories);
const reportedCount = Object.values(report.metadata.vulnerabilities).reduce((sum, count) => sum + count, 0);
if (reportedCount !== advisories.length) {
    throw new Error('Audit totals do not match the returned advisories.');
}
for (const advisory of advisories) {
    if (isVerifiedLocalFix(advisory)) {
        console.warn(`Locally patched: ${advisory.github_advisory_id} (braces 3.0.3). All reported installed copies verified. Registry scanners still flag this version; upstream has no release with a fix.`);
    } else {
        unresolved++;
        console.error(`Unresolved: ${advisory.module_name}: ${advisory.severity} (${advisory.github_advisory_id})`);
    }
}
if (unresolved) process.exitCode = 1;
else console.log('Dependency audit passed: no unpatched known findings.');
