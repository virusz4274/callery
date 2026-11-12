import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import productionProfile from '../../deployment/production.json' with { type: 'json' };

export { productionProfile };

/**
 * @param {NodeJS.ProcessEnv} [environment]
 * @returns {NodeJS.ProcessEnv & { SITE_URL: string, PUBLIC_APP_URL: string, SITE_INDEXABLE: string, SITE_LAUNCH_STAGE: string }}
 */
export function productionEnvironment(environment = process.env) {
    return {
        ...environment,
        SITE_URL: productionProfile.websiteOrigin,
        PUBLIC_APP_URL: productionProfile.appOrigin,
        // Public launch pages and reviewed guides can be discovered before signup
        // opens. Cloudflare previews remain noindex in the site configuration.
        SITE_INDEXABLE: environment.SITE_INDEXABLE === 'false' ? 'false' : 'true',
        SITE_LAUNCH_STAGE: environment.SITE_LAUNCH_STAGE ?? 'coming-soon',
    };
}

export function buildProduction() {
    const directory = fileURLToPath(new URL('../', import.meta.url));
    const astroManifest = JSON.parse(readFileSync(new URL('../node_modules/astro/package.json', import.meta.url), 'utf8'));
    const astroCli = fileURLToPath(new URL(`../node_modules/astro/${astroManifest.bin.astro}`, import.meta.url));
    const environment = productionEnvironment();
    console.log(`Building ${environment.SITE_URL} (${environment.SITE_LAUNCH_STAGE}).`);
    for (const arguments_ of [[astroCli, 'build'], [fileURLToPath(new URL('./verify-build.mjs', import.meta.url))]]) {
        const result = spawnSync(process.execPath, arguments_, { cwd: directory, env: environment, stdio: 'inherit' });
        if (result.error) throw result.error;
        if (result.status !== 0) return result.status ?? 1;
    }
    return 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
    process.exitCode = buildProduction();
}
