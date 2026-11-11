import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { expect, test, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test.setTimeout(60_000);
let bundle: Promise<{ script: string; css: string }> | undefined;
function assets() {
    return bundle ??= (async () => {
        const require = createRequire(import.meta.url);
        const esbuild = createRequire(require.resolve('tsx/package.json'))('esbuild') as { build(options: object): Promise<{ outputFiles: { text: string }[] }> };
        type Plugin = { onResolve(options: { filter: RegExp }, callback: ({ path }: { path: string }) => { path: string; namespace: string }): void; onLoad(options: { filter: RegExp; namespace: string }, callback: () => { loader: string; contents: string; resolveDir: string }): void };
        const result = await esbuild.build({
            stdin: { resolveDir: process.cwd(), sourcefile: 'resumable-upload-fixture.tsx', loader: 'tsx', contents: `
                import React,{useState} from 'react';import{createRoot}from'react-dom/client';
                import { Identity } from 'fixture-auth';
                import { BrowserUploadProvider,useBrowserUploads } from './src/components/uploads/browser-upload-provider';
                import { UploadPage } from './src/components/pages/upload-page';
                import { ToastProvider } from './src/components/toast-provider';
                function Content(){const[away,setAway]=useState(false);const queue=useBrowserUploads();return <>
                    <button onClick={()=>setAway(!away)}>{away?'Return to uploads':'Browse elsewhere'}</button>
                    {away?<p role="status">{queue.items.filter(item=>item.status==='uploading'||item.status==='queued').length} uploads continue</p>:<UploadPage/>}
                </>}
                function App(){const[user,setUser]=useState({id:'first-owner'});return <Identity.Provider value={user}><ToastProvider><BrowserUploadProvider>
                    <button onClick={()=>setUser({id:user.id==='first-owner'?'second-owner':'first-owner'})}>Switch account</button><Content/>
                </BrowserUploadProvider></ToastProvider></Identity.Provider>}
                createRoot(document.getElementById('root')).render(<App/>);
            ` },
            bundle: true, write: false, format: 'esm', jsx: 'automatic', logLevel: 'silent', define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' }, alias: { '@': path.resolve('src') },
            plugins: [{ name: 'upload-fixture', setup(plugin: Plugin) {
                plugin.onResolve({ filter: /^(fixture-auth|@\/lib\/auth\/client|next\/navigation)$/ }, ({ path }) => ({ path: path === 'next/navigation' ? 'router' : 'auth', namespace: path === 'next/navigation' ? 'router' : 'auth' }));
                plugin.onLoad({ filter: /.*/, namespace: 'auth' }, () => ({ loader: 'js', resolveDir: process.cwd(), contents: `import React,{createContext,useContext}from'react';export const Identity=createContext(null);export function useUser(){return{user:useContext(Identity),isUserLoading:false}}` }));
                plugin.onLoad({ filter: /.*/, namespace: 'router' }, () => ({ loader: 'js', resolveDir: process.cwd(), contents: `export function useRouter(){return{push(){},replace(){}}}` }));
            } }],
        });
        const css = await postcss([tailwind({ base: path.resolve('src'), optimize: false })]).process(await readFile('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
        return { script: result.outputFiles[0].text, css: css.css };
    })();
}

async function fixture(page: Page) {
    const files = await assets();
    const sessions = new Map<string, { id: string; state: string; fileSize: number; partSize: number; partCount: number; expiresAt: string; recordingId: string | null; transport: string; parts: { partNumber: number; size: number; etag: string }[] }>();
    const keys = new Map<string, string>();
    const transfers: number[] = [];
    let cancelled = 0;
    page.on('pageerror', error => console.warn('Upload fixture:', error.message));
    await page.route('**/*', async route => {
        const request = route.request(), pathname = new URL(request.url()).pathname;
        if (pathname === '/__uploads.js') return route.fulfill({ contentType: 'text/javascript', body: files.script });
        if (pathname === '/__uploads.css') return route.fulfill({ contentType: 'text/css', body: files.css });
        if (pathname === '/api/uploads' && request.method() === 'POST') {
            const input = request.postDataJSON(), key = request.headers()['idempotency-key'];
            let id = keys.get(key);
            if (!id) { id = `upload-${sessions.size}`; keys.set(key, id); sessions.set(id, { id, state: 'uploading', fileSize: input.fileSize, partSize: 4096, partCount: Math.ceil(input.fileSize / 4096), expiresAt: new Date(Date.now() + 86400_000).toISOString(), recordingId: null, transport: 'proxy', parts: [] }); }
            return route.fulfill({ json: { success: true, data: sessions.get(id) } });
        }
        if (pathname.startsWith('/api/uploads/')) {
            const [, , , id, operation, part] = pathname.split('/');
            const session = sessions.get(id)!;
            if (operation === 'parts' && request.method() === 'PUT') {
                const number = Number(part); transfers.push(number);
                session.parts = session.parts.filter(value => value.partNumber !== number);
                session.parts.push({ partNumber: number, size: request.postDataBuffer()?.byteLength || 0, etag: `part-${number}` });
                await new Promise(resolve => setTimeout(resolve, 100));
            } else if (operation === 'complete') { session.state = 'completed'; session.recordingId = 'recording'; }
            else if (request.method() === 'DELETE') { cancelled++; session.state = 'cancelled'; }
            await route.fulfill({ json: { success: true, data: session } }).catch(() => {}); return;
        }
        if (pathname.startsWith('/api/')) return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request.' } });
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__uploads.css"></head><body><main style="padding:16px"><div id="root"></div></main><script type="module" src="/__uploads.js"></script></body></html>' });
    });
    await page.goto('/__resumable-uploads-fixture');
    await expect(page.getByRole('heading', { name: 'Upload recordings', exact: true })).toBeVisible();
    return { sessions, transfers, get cancelled() { return cancelled; } };
}

for (const width of [1280, 390]) {
    test(`upload navigation, reload/reselection and account isolation at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        const server = await fixture(page);
        const file = testInfo.outputPath('Original call.wav'); await writeFile(file, Buffer.alloc(256 * 1024, 1));
        await page.getByLabel('Audio files', { exact: true }).setInputFiles(file);
        const actions = width < 768 ? page.getByTestId('upload-action-bar') : page.locator('main');
        await actions.getByRole('button', { name: 'Upload All', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('upload-queue.png'), fullPage: true });
        await page.getByRole('button', { name: 'Browse elsewhere', exact: true }).click();
        await expect(page.getByText('1 uploads continue', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Return to uploads', exact: true }).click();
        await page.getByRole('button', { name: 'Pause', exact: true }).click();
        const completed = new Set(server.sessions.values().next().value!.parts.map(part => part.partNumber));
        expect(completed.size).toBeGreaterThan(0);
        await page.reload();
        await expect(page.getByText('Select original file', { exact: true }).first()).toBeVisible();
        const before = server.transfers.length;
        await page.getByLabel('Select original file for Original call.wav', { exact: true }).setInputFiles(file);
        await expect(page.getByText('Files uploaded successfully', { exact: true })).toBeVisible({ timeout: 30_000 });
        expect(server.sessions.size).toBe(1);
        expect(server.transfers.slice(before).every(part => !completed.has(part))).toBe(true);
        await page.getByRole('button', { name: 'Switch account', exact: true }).click();
        await expect(page.getByText('Original call.wav', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Choose audio files to add them to the upload queue.')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
}

test('cancel releases a started upload and preserves the completed-state controls', async ({ page }, testInfo) => {
    const server = await fixture(page);
    const file = testInfo.outputPath('Cancel this.wav'); await writeFile(file, Buffer.alloc(256 * 1024, 1));
    await page.getByLabel('Audio files', { exact: true }).setInputFiles(file);
    await page.getByRole('button', { name: 'Upload All', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel Cancel this.wav', exact: true }).click();
    await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
    await expect.poll(() => server.cancelled).toBe(1);
    await page.getByRole('button', { name: 'Remove Cancel this.wav', exact: true }).click();
    await expect(page.getByTestId('upload-queue-item')).toHaveCount(0);
});
