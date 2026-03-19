import { execFileSync } from 'node:child_process';

const ACCEPTED_LOW_SEVERITY_PACKAGES = new Set([
    'firebase-admin',
    '@google-cloud/firestore',
    '@google-cloud/storage',
    'google-gax',
    'retry-request',
    'teeny-request',
    'http-proxy-agent',
    '@tootallnate/once',
]);

function runAuditJson() {
    try {
        return execFileSync('npm', ['audit', '--omit=dev', '--json'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    } catch (error) {
        if (typeof error?.stdout === 'string' && error.stdout.trim()) {
            return error.stdout;
        }

        throw error;
    }
}

const rawAuditReport = runAuditJson();
const auditReport = JSON.parse(rawAuditReport);
const vulnerabilities = Object.values(auditReport.vulnerabilities ?? {});

const unexpectedVulnerabilities = vulnerabilities.filter((entry) => {
    if (entry.severity !== 'low') {
        return true;
    }

    return !ACCEPTED_LOW_SEVERITY_PACKAGES.has(entry.name);
});

if (unexpectedVulnerabilities.length > 0) {
    console.error('Unexpected production vulnerabilities detected:');
    for (const entry of unexpectedVulnerabilities) {
        console.error(`- ${entry.name}: ${entry.severity}`);
    }
    process.exit(1);
}

if (vulnerabilities.length > 0) {
    console.warn(
        'Accepted low-severity firebase-admin transitive findings remain. Review docs/dependency-review.md before upgrading.'
    );
    for (const entry of vulnerabilities) {
        console.warn(`- ${entry.name}: ${entry.severity}`);
    }
    process.exit(0);
}

console.log('No production vulnerabilities found by npm audit.');
