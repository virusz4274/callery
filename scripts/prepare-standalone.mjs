import { lstatSync, readdirSync, readlinkSync, realpathSync, statSync, symlinkSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function assertInside(root, target) {
    const relative = path.relative(root, target);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`Standalone link points outside the build output: ${target}`);
    }
}

export function prepareWindowsStandalone(root) {
    if (process.platform !== 'win32') return 0;
    if (lstatSync(root).isSymbolicLink()) throw new Error('Standalone output must be a real directory.');
    root = realpathSync(root);
    let repaired = 0;
    const pending = [root];
    while (pending.length) {
        const directory = pending.pop();
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const entryPath = path.join(directory, entry.name);
            if (entry.isSymbolicLink()) {
                const originalTarget = readlinkSync(entryPath);
                const target = path.resolve(directory, originalTarget);
                assertInside(root, target);
                let targetStats;
                try { targetStats = statSync(target); }
                catch (error) {
                    if (error.code === 'ENOENT') continue; // An unused optional dependency may not be traced.
                    throw error;
                }
                if (!targetStats.isDirectory()) continue;
                const realTarget = realpathSync(target);
                assertInside(root, realTarget);
                try {
                    if (statSync(entryPath).isDirectory()) continue;
                } catch (error) {
                    if (error.code !== 'EPERM') throw error;
                }
                // Next copies relative pnpm directory links without a Windows
                // directory type, creating file links which fail with EPERM.
                // Recreate only the generated link; never remove its target.
                unlinkSync(entryPath);
                symlinkSync(originalTarget, entryPath, 'dir');
                repaired++;
            } else if (entry.isDirectory()) {
                pending.push(entryPath);
            }
        }
    }
    return repaired;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    if (process.platform === 'win32') {
        const root = fileURLToPath(new URL('../.next/standalone/', import.meta.url));
        console.log(`Prepared Windows standalone output: ${prepareWindowsStandalone(root)} directory links.`);
    }
}
