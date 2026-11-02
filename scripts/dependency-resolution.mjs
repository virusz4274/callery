import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

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
