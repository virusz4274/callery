import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { expect, test, type Page } from '@playwright/test';
import type { ShareLinkResponse } from '../src/lib/recording-share-types';

test.use({ serviceWorkers: 'block' });
test.setTimeout(90_000);
let assets: Promise<Map<string, string>> | undefined;
async function fixtureAssets() {
    assets ??= (async () => {
        const require = createRequire(import.meta.url);
        const esbuild = createRequire(require.resolve('tsx/package.json'))('esbuild') as { build(options: object): Promise<{ outputFiles: { text: string }[] }> };
        type Plugin = {
            onResolve(options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string }): void;
            onLoad(options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { contents: string; loader: string; resolveDir: string }): void;
        };
        const modules: Record<string, string> = {
            auth: `import{createContext,useContext}from'react';export const Owner=createContext({id:'first-owner'});export function useUser(){return{user:useContext(Owner)}}`,
            team: `export function useTeamPolicy(){return location.search.includes('company')?{enabled:true,companyName:'Fixture Company'}:null}`,
            actions: `async function call(method,path,body){const response=await fetch('/__sharing-action'+path,{method,headers:{'Content-Type':'application/json','X-Fixture-Owner':window.sharingOwner},...(body?{body:JSON.stringify(body)}:{})});if(!response.ok)throw new Error('Share operation failed. Try again.');return response.json()}
                export function createShareLink(recordingId,expiresAt){return call('POST','',{recordingId,expiresAt})}
                export function listRecordingShares(recordingId){return call('GET','?recording='+recordingId)}
                export function revokeShareLink(id){return call('DELETE','/'+id)}`,
        };
        const bundle = await esbuild.build({
            stdin: { resolveDir: process.cwd(), sourcefile: 'sharing-fixture.tsx', loader: 'tsx', contents: `
                import React,{useState}from'react';import{createRoot}from'react-dom/client';import{SWRConfig}from'swr';
                import{Owner}from'fixture-owner';import{ShareRecordingForm}from'./src/components/sharing/share-popover';
                window.sharingOwner='first-owner';Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.sharingCopied=value}}});
                function App(){const[owner,setOwner]=useState({id:'first-owner'});window.switchSharingOwner=()=>{window.sharingOwner='second-owner';setOwner({id:'second-owner'})};
                    return <SWRConfig value={{provider:()=>new Map(),revalidateOnFocus:false,shouldRetryOnError:false}}><Owner.Provider value={owner}><main className="mx-auto max-w-md p-4"><ShareRecordingForm recordingId="507f1f77bcf86cd799439011"/></main></Owner.Provider></SWRConfig>}
                createRoot(document.getElementById('root')).render(<App/>);` },
            bundle: true, write: false, format: 'esm', jsx: 'automatic', logLevel: 'silent', alias: { '@': path.resolve('src') },
            define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' },
            plugins: [{ name: 'sharing-fixture', setup(plugin: Plugin) {
                plugin.onResolve({ filter: /^(fixture-owner|@\/lib\/auth\/client|@\/hooks\/use-team-policy|@\/app\/actions\/sharing)$/ }, ({ path: module }) => ({
                    path: module.includes('/actions/') ? 'actions' : module.includes('team-policy') ? 'team' : 'auth', namespace: 'sharing',
                }));
                plugin.onLoad({ filter: /.*/, namespace: 'sharing' }, ({ path: module }) => ({ contents: modules[module], loader: 'js', resolveDir: process.cwd() }));
            } }],
        });
        const css = await postcss([tailwind({ base: path.resolve('src'), optimize: false })]).process(await readFile('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
        return new Map([['fixture.js', bundle.outputFiles[0].text], ['fixture.css', css.css]]);
    })();
    return assets;
}

async function mockSharing(page: Page, options: { company?: boolean; failCreation?: boolean; grants?: ShareLinkResponse[] } = {}) {
    const files = await fixtureAssets();
    const shares = new Map<string, ShareLinkResponse[]>([['first-owner', options.grants || []], ['second-owner', []]]);
    const created: { owner: string; recordingId: string; expiresAt: string }[] = [];
    const revoked: string[] = [];
    const unexpected: string[] = [];
    await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.pathname.startsWith('/__sharing-assets/')) {
            const name = url.pathname.slice('/__sharing-assets/'.length);
            return route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'text/javascript', body: files.get(name)! });
        }
        if (url.pathname.startsWith('/__sharing-action')) {
            const owner = request.headers()['x-fixture-owner'];
            if (request.method() === 'POST') {
                if (options.failCreation) return route.fulfill({ status: 503, json: {} });
                const input = request.postDataJSON();
                created.push({ owner, ...input });
                const share: ShareLinkResponse = { id: `share-${created.length}`, url: `https://share.example.test/s/full-${created.length}`,
                    createdAt: new Date().toISOString(), expiresAt: input.expiresAt, status: 'active' };
                shares.get(owner)!.unshift(share);
                return route.fulfill({ json: share });
            }
            if (request.method() === 'DELETE') {
                const id = url.pathname.split('/').at(-1)!;
                const share = shares.get(owner)!.find(value => value.id === id)!;
                share.status = 'revoked'; share.revokedAt = new Date().toISOString(); revoked.push(id);
                return route.fulfill({ json: {} });
            }
            return route.fulfill({ json: shares.get(owner) || [] });
        }
        if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__sharing-assets/fixture.css"></head><body><div id="root"></div><script type="module" src="/__sharing-assets/fixture.js"></script></body></html>' });
        unexpected.push(url.pathname);
        return route.abort();
    });
    await page.goto(`/__sharing-fixture${options.company ? '?company=1' : ''}`);
    return { created, revoked, unexpected };
}

for (const width of [390, 1280]) {
    test(`full share links can be created, copied and revoked at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const fixture = await mockSharing(page);
        await expect(page.getByText('No share links yet.')).toBeVisible();
        await expect(page.getByText('Share a clip', { exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: 'Generate link', exact: true }).click();
        await expect(page.getByLabel('Generated share link', { exact: true })).toHaveValue('https://share.example.test/s/full-1');
        expect(fixture.created).toHaveLength(1);
        expect(Date.parse(fixture.created[0].expiresAt) - Date.now()).toBeGreaterThan(23 * 3600_000);
        expect(Date.parse(fixture.created[0].expiresAt) - Date.now()).toBeLessThanOrEqual(24 * 3600_000);
        await page.getByRole('button', { name: 'Copy link', exact: true }).click();
        expect(await page.evaluate(() => (window as unknown as { sharingCopied: string }).sharingCopied)).toBe('https://share.example.test/s/full-1');
        await page.screenshot({ path: test.info().outputPath(`share-${width}.png`), fullPage: true, animations: 'disabled' });
        await page.getByRole('button', { name: 'Revoke link', exact: true }).click();
        await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
        await expect(page.getByLabel('Generated share link')).toHaveCount(0);
        expect(fixture.revoked).toEqual(['share-1']);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(fixture.unexpected).toEqual([]);
    });
}

test('custom expiry sends the selected local date/time as an absolute expiration', async ({ page }) => {
    const fixture = await mockSharing(page);
    await page.getByRole('button', { name: 'Share link expiration' }).click();
    await page.getByRole('option', { name: 'Choose date and time', exact: true }).click();
    await page.getByLabel('Expiration date and time', { exact: true }).fill('2090-06-15T14:30');
    await page.getByRole('button', { name: 'Generate link', exact: true }).click();
    await expect(page.getByLabel('Generated share link')).toBeVisible();
    const expected = await page.evaluate(() => new Date('2090-06-15T14:30').toISOString());
    expect(fixture.created[0].expiresAt).toBe(expected);
});

test('account changes hide the previous account’s links and company archives disable sharing', async ({ page }) => {
    await mockSharing(page);
    await page.getByRole('button', { name: 'Generate link', exact: true }).click();
    await expect(page.getByLabel('Generated share link')).toBeVisible();
    await page.evaluate(() => (window as unknown as { switchSharingOwner: () => void }).switchSharingOwner());
    await expect(page.getByLabel('Generated share link')).toHaveCount(0);
    await expect(page.getByText('No share links yet.')).toBeVisible();
    await page.goto('/__sharing-fixture?company=1');
    await expect(page.getByText(/Public sharing is disabled for Fixture Company/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate link', exact: true })).toHaveCount(0);
});

test('failed creation shows a retryable error without displaying a link', async ({ page }) => {
    const fixture = await mockSharing(page, { failCreation: true });
    await page.getByRole('button', { name: 'Generate link', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Share operation failed');
    await expect(page.getByRole('button', { name: 'Generate link', exact: true })).toBeEnabled();
    await expect(page.getByLabel('Generated share link')).toHaveCount(0);
    expect(fixture.created).toEqual([]);
});
