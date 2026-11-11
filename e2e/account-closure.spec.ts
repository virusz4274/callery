import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { expect, test, type Page } from '@playwright/test';
import type { AccountClosureInput, AccountClosureResult } from '../src/lib/account-closure';

test.use({ serviceWorkers: 'block' });
test.setTimeout(90_000);

let assets: Promise<Map<string, string>> | undefined;
async function fixtureAssets() {
    assets ??= (async () => {
        const require = createRequire(import.meta.url);
        const esbuild = createRequire(require.resolve('tsx/package.json'))('esbuild') as {
            build(options: object): Promise<{ outputFiles: { text: string }[] }>;
        };
        const modules: Record<string, string> = {
            auth: `export function useUser(){return {user:null}}; export function useAuthActions(){return {async signOut(){const response=await fetch('/__closure-signout',{method:'POST'});if(!response.ok)throw new Error('Signout unavailable')}}};`,
            session: `export const authClient={async getSession(){return (await fetch('/__closure-session')).json()}};`,
            action: `export async function deleteOwnAccount(input){const response=await fetch('/__closure-action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});if(!response.ok)throw new Error('Unavailable');return response.json()}`,
            link: `import React from 'react';export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children)}`,
            image: `import React from 'react';export default function Image({src,alt,className}){return React.createElement('img',{src,alt,className,width:72,height:72})}`,
        };
        type Plugin = {
            onResolve(options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string }): void;
            onLoad(options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { contents: string; loader: string; resolveDir: string }): void;
        };
        const bundle = await esbuild.build({
            stdin: { resolveDir: process.cwd(), sourcefile: 'account-closure-fixture.tsx', loader: 'tsx', contents: `
                import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {SWRConfig} from 'swr';
                import {AccountClosureSettings} from './src/components/settings/account-closure-settings';
                import {AccountClosedPage} from './src/components/pages/account-closed-page';
                const initial={id:'closure-owner',email:'owner@example.test',emailVerified:true,canChangePassword:!location.search.includes('google')};
                function Fixture(){const[user,setUser]=useState(initial);window.switchClosureAccount=()=>setUser({...initial,id:'next-owner',email:'next@example.test'});window.unmountClosureAccount=()=>setUser(null);
                    if(location.pathname==='/account-closed')return <AccountClosedPage status={new URLSearchParams(location.search).get('status')}/>;
                    if(location.pathname==='/login')return <><h1>Sign in again</h1><a href="/settings?tab=profile">Finish sign in</a></>;
                    return <SWRConfig value={{provider:()=>new Map(),revalidateOnFocus:false,shouldRetryOnError:false}}><main className="mx-auto max-w-2xl p-4">{user&&<AccountClosureSettings key={user.id} user={user}/>}</main></SWRConfig>;
                }createRoot(document.getElementById('root')).render(<Fixture/>);` },
            bundle: true, write: false, format: 'esm', jsx: 'automatic', logLevel: 'silent',
            alias: { '@': path.resolve('src') },
            define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' },
            plugins: [{ name: 'closure-fixture', setup(plugin: Plugin) {
                plugin.onResolve({ filter: /^(next\/(?:link|image)|@\/lib\/auth\/(?:client|auth-client)|@\/app\/actions\/delete-account)$/ }, ({ path: module }) => ({
                    path: module === 'next/image' ? 'image' : module === 'next/link' ? 'link' : module.endsWith('auth-client') ? 'session' : module.includes('/actions/') ? 'action' : 'auth', namespace: 'closure',
                }));
                plugin.onLoad({ filter: /.*/, namespace: 'closure' }, ({ path: module }) => ({ contents: modules[module], loader: 'js', resolveDir: process.cwd() }));
            } }],
        });
        const css = await postcss([tailwind({ base: path.resolve('src'), optimize: false })]).process(await readFile('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
        return new Map([['fixture.js', bundle.outputFiles[0].text], ['fixture.css', css.css]]);
    })();
    return assets;
}

async function mockClosure(page: Page, options: {
    company?: boolean;
    google?: boolean;
    signOutFails?: boolean;
    respond?: (input: AccountClosureInput) => Promise<AccountClosureResult> | AccountClosureResult;
} = {}) {
    const files = await fixtureAssets();
    const calls: AccountClosureInput[] = [];
    let signouts = 0;
    let sessionSubject: string | null = 'closure-owner';
    const unexpected: string[] = [];
    await page.route('**/*', async route => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/brand/callery-logo.png') return route.fulfill({ contentType: 'image/png', body: await readFile('public/brand/callery-logo.png') });
        if (pathname === '/api/system-settings/public') return route.fulfill({ json: { ...(options.company ? { team: { enabled: true, companyName: 'Fixture Company' } } : {}) } });
        if (pathname === '/__closure-action') {
            const input = request.postDataJSON() as AccountClosureInput;
            calls.push(input);
            const result = await options.respond?.(input) ?? { status: 'deleted', message: 'Deleted' };
            return route.fulfill({ json: result });
        }
        if (pathname === '/__closure-signout') {
            signouts++;
            return route.fulfill({ status: options.signOutFails ? 503 : 200, json: {} });
        }
        if (pathname === '/__closure-session') return route.fulfill({ json: { data: sessionSubject ? { user: { id: sessionSubject } } : null, error: null } });
        if (pathname.startsWith('/__closure-assets/')) {
            const name = pathname.slice('/__closure-assets/'.length);
            return route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'text/javascript', body: files.get(name)! });
        }
        if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__closure-assets/fixture.css"></head><body><div id="root"></div><script type="module" src="/__closure-assets/fixture.js"></script></body></html>' });
        unexpected.push(pathname);
        return route.abort();
    });
    await page.goto(`/settings?tab=profile${options.google ? '&google=1' : ''}`);
    return { calls, signouts: () => signouts, unexpected, setSubject: (subject: string | null) => { sessionSubject = subject; } };
}

for (const width of [390, 1280]) {
    test(`permanent closure requires confirmation and shows the receipt at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const fixture = await mockClosure(page, { google: width === 390 });
        await page.getByRole('button', { name: 'Delete account', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Permanently delete account?' });
        const submit = dialog.getByRole('button', { name: 'Permanently delete account', exact: true });
        await expect(dialog.getByRole('link', { name: 'Export your recordings first' })).toHaveAttribute('href', '/settings?tab=export');
        await expect(submit).toBeDisabled();
        await dialog.getByLabel('Type your email to confirm').fill('wrong@example.test');
        await expect(submit).toBeDisabled();
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        expect(fixture.calls).toHaveLength(0);
        await page.getByRole('button', { name: 'Delete account', exact: true }).click();
        await expect(dialog.getByLabel('Type your email to confirm')).toHaveValue('');
        await dialog.getByLabel('Type your email to confirm').fill('owner@example.test');
        await page.screenshot({ path: test.info().outputPath('confirmation.png'), fullPage: true, animations: 'disabled' });
        await submit.click();
        await expect(page).toHaveURL(/\/account-closed\?status=deleted$/);
        await expect(page.getByRole('heading', { name: 'Account deleted', exact: true })).toBeVisible();
        expect(fixture.calls).toEqual([{ expectedAuthSubject: 'closure-owner', confirmationEmail: 'owner@example.test' }]);
        expect(fixture.signouts()).toBe(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(fixture.unexpected).toEqual([]);
    });

    test(`company accounts show retained-archive guidance at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const fixture = await mockClosure(page, { company: true });
        await expect(page.getByText(/Contact your administrator to remove your access/)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Delete account', exact: true })).toHaveCount(0);
        expect(fixture.calls).toHaveLength(0);
    });
}

test('pending cleanup navigates even when logout fails and Settings has unmounted', async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const fixture = await mockClosure(page, { signOutFails: true, respond: async () => { await held; return { status: 'cleanup_pending', message: 'Accepted' }; } });
    await page.getByRole('button', { name: 'Delete account', exact: true }).click();
    await page.getByLabel('Type your email to confirm').fill('owner@example.test');
    await page.getByRole('button', { name: 'Permanently delete account', exact: true }).click();
    await expect.poll(() => fixture.calls.length).toBe(1);
    fixture.setSubject(null);
    await page.evaluate(() => (window as unknown as { unmountClosureAccount: () => void }).unmountClosureAccount());
    release();
    await expect(page).toHaveURL(/status=cleanup_pending$/);
    await expect(page.getByText(/remaining cleanup will retry automatically/)).toBeVisible();
    expect(fixture.signouts()).toBe(1);
});

test('stale login explicitly signs out and requires confirmation again after sign-in', async ({ page }) => {
    const fixture = await mockClosure(page, { respond: () => ({ status: 'reauth_required', message: 'Sign in again before deleting your account.' }) });
    await page.getByRole('button', { name: 'Delete account', exact: true }).click();
    await page.getByLabel('Type your email to confirm').fill('owner@example.test');
    await page.getByRole('button', { name: 'Permanently delete account', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Sign in again before deleting');
    expect(fixture.signouts()).toBe(0);
    await page.getByRole('button', { name: 'Sign in again', exact: true }).click();
    await expect(page).toHaveURL(/\/login\?redirect=/);
    expect(new URL(page.url()).searchParams.get('redirect')).toBe('/settings?tab=profile');
    await page.getByRole('link', { name: 'Finish sign in' }).click();
    await expect(page.getByRole('button', { name: 'Delete account', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(fixture.calls).toHaveLength(1);
    expect(fixture.signouts()).toBe(1);
});

test('account changes reset confirmation and ignore the previous accepted response', async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const fixture = await mockClosure(page, { respond: async () => { await held; return { status: 'deleted', message: 'Deleted' }; } });
    await page.getByRole('button', { name: 'Delete account', exact: true }).click();
    await page.getByLabel('Type your email to confirm').fill('owner@example.test');
    const submit = page.getByRole('button', { name: 'Permanently delete account', exact: true });
    await submit.click();
    await expect(submit).toBeDisabled();
    await expect.poll(() => fixture.calls.length).toBe(1);
    fixture.setSubject('next-owner');
    await page.evaluate(() => (window as unknown as { switchClosureAccount: () => void }).switchClosureAccount());
    await expect(page.getByRole('dialog')).toHaveCount(0);
    release();
    await page.getByRole('button', { name: 'Delete account', exact: true }).click();
    await expect(page.getByLabel('Type your email to confirm')).toHaveValue('');
    await expect(page.getByText('Enter next@example.test.')).toBeVisible();
    expect(fixture.signouts()).toBe(0);
    expect(fixture.calls).toHaveLength(1);
    expect(new URL(page.url()).pathname).toBe('/settings');
});

test('a blocked closure keeps the confirmation open without signing out', async ({ page }) => {
    const fixture = await mockClosure(page, { respond: () => ({ status: 'blocked', message: 'Make another user an administrator before closing this account.' }) });
    await page.getByRole('button', { name: 'Delete account', exact: true }).click();
    await page.getByLabel('Type your email to confirm').fill('owner@example.test');
    await page.getByRole('button', { name: 'Permanently delete account', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Make another user an administrator');
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(fixture.signouts()).toBe(0);
    expect(fixture.calls).toHaveLength(1);
    expect(new URL(page.url()).pathname).toBe('/settings');
});
