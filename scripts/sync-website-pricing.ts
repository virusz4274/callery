import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { websitePricingSchema } from '../shared/website-pricing';

const defaultOutput = fileURLToPath(new URL('../website/src/data/pricing.json', import.meta.url));

export async function syncWebsitePricing({ from, output = defaultOutput, fetcher = fetch }: {
    from: string; output?: string; fetcher?: typeof fetch;
}) {
    const origin = new URL(from);
    if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
        || !['https:', 'http:'].includes(origin.protocol)) {
        throw new Error('Use --from with the app HTTP(S) origin, without credentials or a path.');
    }
    if (origin.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) {
        throw new Error('Pricing synchronization requires HTTPS except for an isolated loopback test server.');
    }
    const response = await fetcher(new URL('/api/public/pricing', origin), {
        headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Pricing export failed (HTTP ${response.status}); the saved snapshot has not changed.`);
    const content = await response.text();
    if (content.length > 100_000) throw new Error('Pricing export is too large; the saved snapshot has not changed.');
    const snapshot = websitePricingSchema.parse(JSON.parse(content));
    if (new URL(snapshot.sourceAppOrigin).origin !== origin.origin) {
        throw new Error('The pricing export belongs to a different app origin; the saved snapshot has not changed.');
    }
    const outputPath = path.resolve(output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    const temporary = `${outputPath}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' });
        await rename(temporary, outputPath);
    } finally {
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    }
    return snapshot;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    try {
        const args = process.argv.slice(2).filter(arg => arg !== '--');
        if (args.length !== 2 || args[0] !== '--from' || !args[1]) throw new Error('Usage: pnpm website:sync-pricing --from https://your-app-origin');
        const snapshot = await syncWebsitePricing({ from: args[1] });
        console.log(`Saved ${snapshot.pricing.plans.length} published plans from ${snapshot.sourceAppOrigin}. Rebuild and republish the website to apply them.`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : 'Pricing synchronization failed.');
        process.exitCode = 1;
    }
}
