import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { expect, test, type Page } from '@playwright/test';
import type { SearchIndexingScope, SearchIndexingStatus } from '../src/lib/search/types';

test.use({ serviceWorkers: 'block' });
test.setTimeout(60_000);
let assets: Promise<Map<string, string>> | undefined;
const initialScope: SearchIndexingScope = { contactId: '507f1f77bcf86cd799439011', startDate: '2026-01-01', endDate: '2026-03-31' };
const changedScope: SearchIndexingScope = { contactId: '507f1f77bcf86cd799439022', startDate: '2026-04-01', endDate: '2026-06-30' };
const readyStatus = (): SearchIndexingStatus => ({ eligible: 125, queued: 0, running: 0, needsReview: 0, ready: true, message: 'Search is ready.', batchSize: 100 });
type Call = { owner: string; scope: SearchIndexingScope };
type Result = Record<string, unknown>;

async function fixtureAssets() {
    assets ??= (async () => {
        const require = createRequire(import.meta.url);
        const esbuild = createRequire(require.resolve('tsx/package.json'))('esbuild') as { build(options: object): Promise<{ outputFiles: { text: string }[] }> };
        type Plugin = {
            onResolve(options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string }): void;
            onLoad(options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { contents: string; loader: string; resolveDir: string }): void;
        };
        const modules: Record<string, string> = {
            auth: `import{createContext,useContext}from'react';export const Identity=createContext(null);export function useUser(){return{user:useContext(Identity)}}`,
            actions: `async function call(operation,scope){const owner=window.indexingOwner||'guest';const response=await fetch('/__indexing/'+operation,{method:'POST',headers:{'Content-Type':'application/json','X-Fixture-Owner':owner},body:JSON.stringify(scope)});const result=await response.json();
                if(operation==='start'){window.indexingSettledOwners=[...(window.indexingSettledOwners||[]),owner]}if(result.fixtureReject)throw new Error('The previous account request failed.');return result}
                export function getSearchIndexingStatusAction(scope){return call('status',scope)}export function startSearchIndexingAction(scope){return call('start',scope)}`,
        };
        const bundle = await esbuild.build({
            stdin: { resolveDir: process.cwd(), sourcefile: 'indexing-fixture.tsx', loader: 'tsx', contents: `
                import React,{useState}from'react';import{createRoot}from'react-dom/client';import{SWRConfig}from'swr';
                import{Identity}from'fixture-identity';import{SearchIndexingControls}from'./src/components/recordings/search-indexing-controls';
                const cache=new Map();function App(){const[owner,setOwner]=useState('owner-a');const[scope,setScope]=useState(${JSON.stringify(initialScope)});const[updates,setUpdates]=useState(0);
                    window.indexingOwner=owner;return <SWRConfig value={{provider:()=>cache,revalidateOnFocus:false,dedupingInterval:0,shouldRetryOnError:false}}><Identity.Provider value={{id:owner}}>
                        <main className="mx-auto max-w-4xl space-y-4 p-4"><button onClick={()=>setOwner(owner==='owner-a'?'owner-b':'owner-a')}>Switch indexing account</button>
                        <button onClick={()=>setScope(${JSON.stringify(changedScope)})}>Change indexing scope</button>
                        <SearchIndexingControls scope={scope} onUpdated={()=>setUpdates(value=>value+1)}/><output aria-label="Search coverage updates">{updates}</output></main>
                    </Identity.Provider></SWRConfig>}createRoot(document.getElementById('root')).render(<App/>);` },
            bundle: true, write: false, format: 'esm', jsx: 'automatic', logLevel: 'silent', alias: { '@': path.resolve('src') },
            define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' },
            plugins: [{ name: 'search-indexing-fixture', setup(plugin: Plugin) {
                plugin.onResolve({ filter: /^(fixture-identity|@\/lib\/auth\/client|@\/app\/actions\/search-indexing)$/ }, ({ path: module }) => ({
                    path: module.includes('/actions/') ? 'actions' : 'auth', namespace: 'indexing',
                }));
                plugin.onLoad({ filter: /.*/, namespace: 'indexing' }, ({ path: module }) => ({ contents: modules[module], loader: 'js', resolveDir: process.cwd() }));
            } }],
        });
        const css = await postcss([tailwind({ base: path.resolve('src'), optimize: false })]).process(await readFile('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
        return new Map([['fixture.js', bundle.outputFiles[0].text], ['fixture.css', css.css]]);
    })();
    return assets;
}

async function fixture(page: Page, options: {
    status?: (call: Call) => Result | Promise<Result>;
    start?: (call: Call) => Result | Promise<Result>;
} = {}) {
    const files = await fixtureAssets();
    const statusCalls: Call[] = [], startCalls: Call[] = [], unexpected: string[] = [];
    await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.pathname.startsWith('/__indexing-assets/')) {
            const name = url.pathname.slice('/__indexing-assets/'.length);
            return route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'text/javascript', body: files.get(name)! });
        }
        if (url.pathname === '/__indexing/status' || url.pathname === '/__indexing/start') {
            const call = { owner: request.headers()['x-fixture-owner'], scope: request.postDataJSON() as SearchIndexingScope };
            if (url.pathname.endsWith('/status')) {
                statusCalls.push(call);
                return route.fulfill({ json: await options.status?.(call) ?? { success: true, status: readyStatus() } });
            }
            startCalls.push(call);
            return route.fulfill({ json: await options.start?.(call) ?? { success: true, queued: 2, needsReview: 0, alreadyReady: 0 } });
        }
        if (request.isNavigationRequest() && url.pathname === '/__search-indexing-fixture') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__indexing-assets/fixture.css"></head><body><div id="root"></div><script type="module" src="/__indexing-assets/fixture.js"></script></body></html>' });
        unexpected.push(url.pathname);
        return route.abort();
    });
    await page.goto('/__search-indexing-fixture');
    return { statusCalls, startCalls, unexpected };
}

for (const width of [390, 1280]) {
    test(`indexing requires approval for the current scope and refreshes queue progress at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.clock.install();
        let status = readyStatus();
        const calls = await fixture(page, { status: () => ({ success: true, status }), start: () => {
            status = { ...status, eligible: 123, queued: 2, needsReview: 1 };
            return { success: true, queued: 2, needsReview: 1, alreadyReady: 0 };
        } });
        await expect(page.getByRole('button', { name: 'Index next 100 recordings', exact: true })).toBeEnabled();
        expect(calls.startCalls).toEqual([]);
        await page.getByRole('button', { name: 'Index next 100 recordings', exact: true }).click();
        await expect(page.getByText(/Provider charges may apply/)).toBeVisible();
        expect(calls.startCalls).toEqual([]);
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        expect(calls.startCalls).toEqual([]);
        await page.getByRole('button', { name: 'Index next 100 recordings', exact: true }).click();
        await page.getByRole('button', { name: 'Change indexing scope', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Start indexing', exact: true })).toHaveCount(0);
        await expect.poll(() => calls.statusCalls.at(-1)?.scope).toEqual(changedScope);
        await page.getByRole('button', { name: 'Index next 100 recordings', exact: true }).click();
        await page.getByRole('button', { name: 'Start indexing', exact: true }).click();
        await expect(page.getByText('2 recordings queued for indexing. 1 need administrator review before retrying.', { exact: true })).toBeVisible();
        expect(calls.startCalls).toEqual([{ owner: 'owner-a', scope: changedScope }]);
        await expect(page.getByText(/123 recordings need indexing.*2 waiting, 0 running/)).toBeVisible();
        await expect(page.getByText(/Uncertain provider requests are not repeated automatically/)).toBeVisible();
        status = { ...status, queued: 0, running: 2 };
        await page.clock.fastForward(5100);
        await expect(page.getByText(/0 waiting, 2 running/)).toBeVisible();
        const updates = Number(await page.getByLabel('Search coverage updates', { exact: true }).textContent());
        status = { ...status, eligible: 121, running: 0 };
        await page.clock.fastForward(5100);
        await expect(page.getByText(/121 recordings need indexing.*0 waiting, 0 running/)).toBeVisible();
        await expect.poll(async () => Number(await page.getByLabel('Search coverage updates', { exact: true }).textContent())).toBeGreaterThan(updates);
        expect(calls.startCalls).toHaveLength(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(calls.unexpected).toEqual([]);
    });

    test(`unavailable indexing readiness prevents starting and review remains explicit at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        let status = { ...readyStatus(), ready: false, message: 'The passage vector index is not ready.', needsReview: 3 };
        const calls = await fixture(page, { status: () => ({ success: true, status }) });
        await expect(page.getByText(status.message, { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Index next 100 recordings', exact: true })).toBeDisabled();
        await expect(page.getByText(/3 indexing jobs need administrator review/)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Start indexing', exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: 'Refresh indexing status', exact: true }).click();
        expect(calls.startCalls).toEqual([]);
        status = { ...status, ready: true, message: 'Search is ready.' };
        await page.getByRole('button', { name: 'Refresh indexing status', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Index next 100 recordings', exact: true })).toBeEnabled();
        await expect(page.getByText(/Uncertain provider requests are not repeated automatically/)).toBeVisible();
        expect(calls.startCalls).toEqual([]);
        expect(calls.unexpected).toEqual([]);
    });

    test(`status and explicit start failures can be retried at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        let statusFailed = true, startFailed = true;
        const calls = await fixture(page, {
            status: () => statusFailed ? { success: false, error: 'Could not inspect this indexing queue.' } : { success: true, status: readyStatus() },
            start: () => startFailed ? { success: false, error: 'The embedding provider is temporarily unavailable.' } : { success: true, queued: 2, needsReview: 0, alreadyReady: 0 },
        });
        await expect(page.getByRole('alert')).toHaveText('Could not inspect this indexing queue.');
        expect(calls.startCalls).toEqual([]);
        statusFailed = false;
        await page.getByRole('button', { name: 'Refresh indexing status', exact: true }).click();
        await expect(page.getByRole('alert')).toHaveCount(0);
        await page.getByRole('button', { name: 'Index next 100 recordings', exact: true }).click();
        await page.getByRole('button', { name: 'Start indexing', exact: true }).click();
        await expect(page.getByRole('alert')).toHaveText('The embedding provider is temporarily unavailable.');
        expect(calls.startCalls).toEqual([{ owner: 'owner-a', scope: initialScope }]);
        startFailed = false;
        await page.getByRole('button', { name: 'Start indexing', exact: true }).click();
        await expect(page.getByText('2 recordings queued for indexing.', { exact: true })).toBeVisible();
        await expect(page.getByRole('alert')).toHaveCount(0);
        expect(calls.startCalls).toEqual([{ owner: 'owner-a', scope: initialScope }, { owner: 'owner-a', scope: initialScope }]);
        expect(calls.unexpected).toEqual([]);
    });

    for (const outcome of ['resolved', 'rejected']) test(`switching accounts isolates a ${outcome} prior request while the new account is pending at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        let releaseA!: () => void, releaseB!: () => void;
        const heldA = new Promise<void>(resolve => { releaseA = resolve; });
        const heldB = new Promise<void>(resolve => { releaseB = resolve; });
        const calls = await fixture(page, {
            status: ({ owner }) => ({ success: true, status: { ...readyStatus(), ...(owner === 'owner-a' ? { eligible: 125, queued: 4, needsReview: 3 } : { eligible: 7 }) } }),
            start: async ({ owner }) => {
                if (owner === 'owner-a') { await heldA; if (outcome === 'rejected') return { fixtureReject: true }; }
                else await heldB;
                return { success: true, queued: owner === 'owner-a' ? 99 : 7, needsReview: 0, alreadyReady: 0 };
            },
        });
        await page.getByRole('button', { name: 'Index next 100 recordings', exact: true }).click();
        await page.getByRole('button', { name: 'Switch indexing account', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Index next 7 recordings', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Start indexing', exact: true })).toHaveCount(0);
        expect(calls.startCalls).toEqual([]);
        await expect(page.getByText(/125 recordings need indexing|4 waiting|3 indexing jobs need/)).toHaveCount(0);
        await page.getByRole('button', { name: 'Switch indexing account', exact: true }).click();
        // Request a job for A, then switch before its response arrives.
        await page.getByRole('button', { name: 'Start indexing', exact: true }).click();
        await expect.poll(() => calls.startCalls.length).toBe(1);
        await page.getByRole('button', { name: 'Switch indexing account', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Index next 7 recordings', exact: true })).toBeEnabled();
        await page.getByRole('button', { name: 'Index next 7 recordings', exact: true }).click();
        const start = page.getByRole('button', { name: 'Start indexing', exact: true });
        // Two clicks in one browser turn must still create only one B request.
        await start.evaluate(element => { const button = element as HTMLButtonElement; button.click(); button.click(); });
        await expect.poll(() => calls.startCalls.length).toBe(2);
        await expect(start).toBeDisabled();
        releaseA();
        await expect.poll(() => page.evaluate(() => (window as unknown as { indexingSettledOwners?: string[] }).indexingSettledOwners || [])).toContain('owner-a');
        // Let React commit the stale promise continuation before checking that
        // neither its success nor catch/finally path can clear B's pending state.
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await expect(start).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Refresh indexing status', exact: true })).toBeDisabled();
        await expect(page.getByRole('alert')).toHaveCount(0);
        await expect(page.getByText(/99 recordings queued|125 recordings need indexing|4 waiting|3 indexing jobs need/)).toHaveCount(0);
        await start.evaluate(element => { (element as HTMLButtonElement).click(); });
        expect(calls.startCalls).toHaveLength(2);
        releaseB();
        await expect(page.getByText('7 recordings queued for indexing.', { exact: true })).toBeVisible();
        expect(calls.startCalls).toEqual([{ owner: 'owner-a', scope: initialScope }, { owner: 'owner-b', scope: initialScope }]);
        expect(calls.unexpected).toEqual([]);
    });
}
