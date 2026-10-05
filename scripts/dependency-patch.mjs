import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const BRACES_ADVISORY = 'GHSA-vfj7-8cjw-p6xm';

// Verify the actual installed implementation, normalizing Windows line endings.
const patchedHashes = {
    'lib/parse.js': '4c03aa64f94389f3ec37d39dc7428af522710e9a8614209e5375424c7334012e',
    'lib/compile.js': '138368cafdeb1c147acb487145aa7d023ee03badd4f1b7abb74c86fe9f916ab8',
    'lib/expand.js': '8a1c55c4f3c95c53e49b92995817b2600d1455e4b54e5c68fdc8851aa89b04a1',
    'lib/stringify.js': '236891491179e60a090f0190b2770c87d254629e82428b30d3f255fa24769bf3',
    'lib/utils.js': '12e9d02fe7298338f581ff9c711eae217dc606ce19e78b72a81e47dbe6eda25c',
};

export function resolvePackageChain(names) {
    let require = createRequire(path.join(projectRoot, 'package.json'));
    let packageFile;
    for (const name of names) {
        if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name)) {
            throw new Error(`Invalid package name in audit path: ${name}`);
        }
        try {
            packageFile = require.resolve(`${name}/package.json`);
        } catch {
            // Packages such as @vinext/cloudflare expose only subpath exports.
            // Locate their manifest using Node's actual dependency search paths.
            packageFile = undefined;
            for (const directory of require.resolve.paths(name) || []) {
                const candidate = path.join(directory, name, 'package.json');
                try {
                    if (JSON.parse(readFileSync(candidate, 'utf8')).name === name) {
                        packageFile = candidate;
                        break;
                    }
                } catch { /* An intermediate directory may have no package manifest. */ }
            }
            if (!packageFile) throw new Error(`Cannot locate package ${name}`);
        }
        packageFile = realpathSync(packageFile);
        require = createRequire(packageFile);
    }
    if (!packageFile) throw new Error('Audit package path is empty.');
    return path.dirname(packageFile);
}

export function isVerifiedLocalFix(advisory) {
    if (advisory.github_advisory_id !== BRACES_ADVISORY || advisory.module_name !== 'braces') {
        return false;
    }
    if (!advisory.findings?.length) throw new Error('The braces advisory has no installed package paths.');
    const directories = new Set();
    for (const finding of advisory.findings) {
        if (finding.version !== '3.0.3' || !finding.paths?.length) {
            throw new Error('The braces finding does not match the locally patched version.');
        }
        for (const dependencyPath of finding.paths) {
            const names = dependencyPath.split('>');
            if (names.shift() !== '.' || names.at(-1) !== 'braces') {
                throw new Error('Unexpected braces dependency path.');
            }
            directories.add(resolvePackageChain(names));
        }
    }
    for (const directory of directories) {
        if (JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')).version !== '3.0.3') {
            throw new Error('Installed braces version does not match the security patch.');
        }
        for (const [file, expected] of Object.entries(patchedHashes)) {
            const source = readFileSync(path.join(directory, file), 'utf8').replace(/\r\n/g, '\n');
            const actual = createHash('sha256').update(source).digest('hex');
            if (actual !== expected) throw new Error(`Security patch verification failed: ${file}`);
        }
    }
    return true;
}
