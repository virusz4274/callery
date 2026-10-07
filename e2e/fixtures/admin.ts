import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';

// Bundle the actual admin components with fixture-only auth, routing and actions.
// The browser still uses the saved HTTPS origin; no fixture route is added to the app.
let bundle: Promise<Map<string, string | Uint8Array>> | undefined;
const actionNames = ['checkSystemHealth', 'clearAllServiceIncidents', 'clearServiceIncident', 'sendAdminTestEmail', 'cleanupOrphanedRecordings', 'deletePlan', 'createPlan', 'updatePlan', 'deleteAnnouncement', 'createAnnouncement', 'updateAnnouncement', 'updateContactPlan', 'deleteUser', 'restoreUser', 'toggleUserStatus', 'updateUserLimits', 'updateUserUsage', 'updateUserRole', 'updateSystemSettings'];
async function assets() {
    bundle ??= (async () => {
        const require = createRequire(import.meta.url);
        const fixtureRequire = createRequire(require.resolve('tsx/package.json'));
        const esbuild = fixtureRequire('esbuild') as { build(options: object): Promise<{ outputFiles: { path: string; text: string }[] }> };
        type BuildPlugin = {
            onResolve(options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string }): void;
            onLoad(options: { filter: RegExp; namespace?: string }, callback: () => { contents: string; loader: string }): void;
        };
        console.info('Bundling isolated admin components');
        const result = await esbuild.build({
            entryPoints: [path.resolve('e2e/fixtures/admin-app.tsx')], bundle: true, write: false, format: 'esm',
            outfile: 'admin.js', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' },
            alias: { 'next/navigation': path.resolve('e2e/fixtures/admin-router.ts'), '@/lib/auth/client': path.resolve('e2e/fixtures/admin-router.ts'), '@/hooks/use-user-profile': path.resolve('e2e/fixtures/admin-router.ts'), '@': path.resolve('src') },
            plugins: [{ name: 'isolated-admin-actions', setup(plugin: BuildPlugin) {
                plugin.onResolve({ filter: /^@\/app\/actions\// }, () => ({ path: 'admin-actions', namespace: 'fixture-actions' }));
                plugin.onLoad({ filter: /.*/, namespace: 'fixture-actions' }, () => ({ loader: 'js', contents: actionNames.map(name => `export async function ${name}(...args) { const response = await fetch('/__admin-fixture-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '${name}', args }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Fixture request failed'); return data.result; }`).join('\n') }));
                plugin.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'css' }));
            } }],
        });
        console.info('Compiling admin fixture theme');
        const css = await postcss([tailwind({ base: path.resolve('src'), optimize: false })]).process(await readFile('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
        const files = new Map<string, string | Uint8Array>();
        for (const file of result.outputFiles) files.set(path.basename(file.path), file.text);
        files.set('admin.css', css.css);
        console.info('Admin fixtures ready');
        return files;
    })();
    return bundle;
}

export async function mockAdmin(page: Page, url = '/admin', action?: (name: string, args: unknown[]) => Promise<unknown> | unknown) {
    page.on('pageerror', error => console.warn('Admin fixture error:', error.message));
    const files = await assets();
    const calls: { name: string; args: unknown[] }[] = [];
    const unexpected: string[] = [];
    await page.route('**/*', async route => {
        const request = route.request();
        const parsed = new URL(request.url());
        if (parsed.pathname.startsWith('/__admin-fixture-assets/')) {
            const file = files.get(parsed.pathname.slice('/__admin-fixture-assets/'.length));
            if (file === undefined) { unexpected.push(parsed.pathname); return route.abort(); }
            return route.fulfill({ contentType: parsed.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body: typeof file === 'string' ? file : Buffer.from(file) });
        }
        if (parsed.pathname === '/__admin-fixture-action') {
            const call = request.postDataJSON() as { name: string; args: unknown[] }; calls.push(call);
            try {
                const result = action ? await action(call.name, call.args) : call.name === 'checkSystemHealth' ? {
                    checkedAt: Date.now(), services: [
                        { name: 'MongoDB', status: 'operational', latency: 20 },
                        { name: 'Text AI', status: 'configured', latency: 0, message: 'Configuration present; live requests are not tested.' },
                    ], incidents: { openCount: 0, recent: [] },
                } : call.name === 'updateContactPlan' ? { success: true } : call.name === 'cleanupOrphanedRecordings' ? { deletedDb: 2, deletedR2: 2 } : undefined;
                return route.fulfill({ json: { result } });
            } catch (error) { return route.fulfill({ status: 500, json: { error: error instanceof Error ? error.message : 'Fixture outage' } }); }
        }
        if (request.isNavigationRequest() && parsed.pathname.startsWith('/admin')) {
            const css = [...files.keys()].filter(name => name.endsWith('.css')).map(name => `<link rel="stylesheet" href="/__admin-fixture-assets/${name}">`).join('');
            return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}</head><body><div id="root"></div><script type="module" src="/__admin-fixture-assets/admin.js"></script></body></html>` });
        }
        unexpected.push(parsed.pathname); await route.abort();
    });
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    return { calls, unexpected };
}
