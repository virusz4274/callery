import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { expect, test, type Page } from '@playwright/test';
import type { NotificationResponse } from '../src/lib/db/types';
import { compareNotificationOrder } from '../src/lib/notification-pagination';

test.use({ serviceWorkers: 'block' });
test.setTimeout(30_000);
let assets: Promise<Map<string, string>> | undefined;
async function fixtureAssets() {
    assets ??= (async () => {
        const require = createRequire(import.meta.url);
        const esbuild = createRequire(require.resolve('tsx/package.json'))('esbuild') as { build(options: object): Promise<{ outputFiles: { text: string }[] }> };
        const modules: Record<string, string> = {
            auth: `import React,{createContext,useContext} from 'react';export const Identity=createContext(null);export function useUser(){return {user:useContext(Identity)}};`,
            actions: `async function invoke(action,input){const response=await fetch('/__notification-action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,input})});if(!response.ok)throw new Error('Fixture notification failure');return response.json()}
                export function fetchNotifications(options){return invoke('fetch',options)};export function readNotification(id){return invoke('read',id)};export function readAllNotifications(){return invoke('read-all')};export function clearAllNotifications(){return invoke('clear-all')};`,
            toast: `const toast=item=>{const row=document.createElement('li');row.textContent=item.title;document.getElementById('notification-toasts').append(row)};export function useToast(){return {toast}};`,
            link: `import React from 'react';export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children)}`,
        };
        type Plugin = {
            onResolve(options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string }): void;
            onLoad(options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { contents: string; loader: string; resolveDir: string }): void;
        };
        const bundle = await esbuild.build({
            stdin: { resolveDir: process.cwd(), sourcefile: 'notification-pagination-fixture.tsx', loader: 'tsx', contents: `
                import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {Identity} from 'fixture-auth';
                import {NotificationCenter} from './src/components/notifications/notification-center';
                function App(){const[user,setUser]=useState({id:'first-owner'});return <Identity.Provider value={user}><main className="flex justify-end gap-4 p-4"><button onClick={async()=>{await fetch('/__notification-switch',{method:'POST'});setUser({id:'second-owner'})}}>Switch account</button><NotificationCenter/></main></Identity.Provider>}
                createRoot(document.getElementById('root')).render(<App/>);` },
            bundle: true, write: false, format: 'esm', jsx: 'automatic', logLevel: 'silent', alias: { '@': path.resolve('src') },
            define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' },
            plugins: [{ name: 'notification-fixture', setup(plugin: Plugin) {
                plugin.onResolve({ filter: /^(fixture-auth|next\/link|@\/lib\/auth\/client|@\/app\/actions\/notifications|@\/components\/toast-provider)$/ }, ({ path: module }) => ({
                    path: module === 'next/link' ? 'link' : module.includes('/actions/') ? 'actions' : module.includes('toast-provider') ? 'toast' : 'auth', namespace: 'notification',
                }));
                plugin.onLoad({ filter: /.*/, namespace: 'notification' }, ({ path: module }) => ({ contents: modules[module], loader: 'js', resolveDir: process.cwd() }));
            } }],
        });
        const css = await postcss([tailwind({ base: path.resolve('src'), optimize: false })]).process(await readFile('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
        return new Map([['fixture.js', bundle.outputFiles[0].text], ['fixture.css', css.css]]);
    })();
    return assets;
}

function notification(id: number, title = `Notice ${id}`): NotificationResponse {
    return { id: id.toString(16).padStart(24, '0'), title, message: 'Saved processing result', type: 'info', isRead: false,
        createdAt: new Date(Date.UTC(2026, 10, 11, 12) + id * 1000).toISOString() };
}

async function dismissNotifications(page: Page) {
    const dialog = page.getByRole('dialog');
    await dialog.focus();
    await dialog.press('Escape');
    await expect(dialog).toHaveCount(0);
}

async function mockNotifications(page: Page, count = 65) {
    const files = await fixtureAssets();
    const histories: Record<string, NotificationResponse[]> = {
        'first-owner': Array.from({ length: count }, (_, i) => notification(i + 1)),
        'second-owner': [notification(1000, 'Second account private notice')],
    };
    let owner = 'first-owner', failAction: string | undefined, gate: Promise<void> | undefined;
    const calls: { action: string; input?: { cursor?: string } | string; owner: string }[] = [];
    const unexpected: string[] = [];
    await page.route('**/*', async route => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/__notification-switch') { owner = 'second-owner'; return route.fulfill({ json: {} }); }
        if (pathname === '/__notification-action') {
            const { action, input } = request.postDataJSON();
            const requestOwner = owner;
            calls.push({ action, input, owner: requestOwner });
            if (action === failAction) return route.fulfill({ status: 503, json: {} });
            if (gate && action === 'fetch' && input?.cursor) await gate;
            const rows = histories[requestOwner];
            if (action === 'read-all') rows.forEach(row => { row.isRead = true; });
            else if (action === 'clear-all') histories[requestOwner] = [];
            else if (action === 'read') rows.forEach(row => { if (row.id === input) row.isRead = true; });
            if (action !== 'fetch') return route.fulfill({ json: {} });
            const sorted = [...rows].sort(compareNotificationOrder);
            const offset = input?.cursor ? sorted.findIndex(row => row.id === input.cursor) + 1 : 0;
            const notifications = sorted.slice(offset, offset + 20);
            return route.fulfill({ json: { notifications, unreadCount: rows.filter(row => !row.isRead).length,
                nextCursor: offset + 20 < sorted.length ? notifications.at(-1)!.id : null } });
        }
        if (pathname.startsWith('/__notification-assets/')) {
            const name = pathname.slice('/__notification-assets/'.length);
            return route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'text/javascript', body: files.get(name)! });
        }
        if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__notification-assets/fixture.css"></head><body><div id="root"></div><ul id="notification-toasts" aria-label="Toasts"></ul><script type="module" src="/__notification-assets/fixture.js"></script></body></html>' });
        unexpected.push(pathname); return route.abort();
    });
    await page.goto('/__notification-fixture');
    await expect(page.getByRole('button', { name: `Notifications, ${count} unread`, exact: true })).toBeVisible();
    return { histories, calls, unexpected, fail: (action?: string) => { failAction = action; }, hold: (value?: Promise<void>) => { gate = value; } };
}

for (const width of [390, 1280]) {
    test(`notification pages show global counts and mutate all history at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const fixture = await mockNotifications(page);
        await page.getByRole('button', { name: 'Notifications, 65 unread', exact: true }).click();
        const list = page.getByRole('list', { name: 'Notifications', exact: true });
        await expect(list.getByRole('listitem')).toHaveCount(20);
        await page.getByRole('button', { name: 'Load older notifications', exact: true }).click();
        await expect(list.getByRole('listitem')).toHaveCount(40);
        await expect(page.locator('#notification-toasts')).toBeEmpty();
        await page.getByRole('button', { name: 'Mark all read', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
        expect(fixture.histories['first-owner'].every(row => row.isRead)).toBe(true);
        await expect(list.getByRole('button', { name: /^Mark as read:/ })).toHaveCount(0);
        await page.getByRole('button', { name: 'Clear list', exact: true }).click();
        await expect(page.getByText('No notifications', { exact: true })).toBeVisible();
        expect(fixture.histories['first-owner']).toHaveLength(0);
        expect(fixture.histories['second-owner']).toHaveLength(1);
        expect(fixture.unexpected).toEqual([]);
    });
}

test('newest polling preserves loaded history and announces only new arrivals once', async ({ page }) => {
    await page.clock.install();
    const fixture = await mockNotifications(page);
    const button = page.getByRole('button', { name: /^Notifications/ });
    await button.click();
    await page.getByRole('button', { name: 'Load older notifications', exact: true }).click();
    const list = page.getByRole('list', { name: 'Notifications', exact: true });
    await expect(list.getByRole('listitem')).toHaveCount(40);
    await dismissNotifications(page);
    fixture.histories['first-owner'].push(notification(200, 'New arrival'));
    await page.clock.fastForward(60_100);
    await expect(page.locator('#notification-toasts')).toHaveText('New arrival');
    await page.clock.fastForward(60_100);
    await expect(page.locator('#notification-toasts li')).toHaveCount(1);
    await button.click();
    await expect(list.getByRole('listitem')).toHaveCount(41);
    await expect(list.locator('p:not([aria-hidden])').filter({ hasText: /^Notice 26$/ })).toBeVisible();
    expect(new Set(await list.getByRole('listitem').allTextContents()).size).toBe(41);
});

test('historical rows loaded by a newest refresh never produce a new-arrival toast', async ({ page }) => {
    await page.clock.install();
    const fixture = await mockNotifications(page, 5);
    fixture.histories['first-owner'].push(notification(0, 'Historical record'));
    await page.clock.fastForward(60_100);
    await expect(page.getByRole('button', { name: 'Notifications, 6 unread', exact: true })).toBeVisible();
    await expect(page.locator('#notification-toasts')).toBeEmpty();
});

test('a complete newest page replaces history cleared in another tab even when a new notice exists', async ({ page }) => {
    await page.clock.install();
    const fixture = await mockNotifications(page);
    const button = page.getByRole('button', { name: /^Notifications/ });
    await button.click();
    await page.getByRole('button', { name: 'Load older notifications', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Notifications', exact: true }).getByRole('listitem')).toHaveCount(40);
    await dismissNotifications(page);
    fixture.histories['first-owner'] = [notification(200, 'Only remaining notification')];
    await page.clock.fastForward(60_100);
    await expect(page.getByRole('button', { name: 'Notifications, 1 unread', exact: true })).toBeVisible();
    await button.click();
    const list = page.getByRole('list', { name: 'Notifications', exact: true });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText('Only remaining notification');
    await expect(list).not.toContainText('Notice 65');
    await expect(page.getByRole('button', { name: 'Load older notifications', exact: true })).toHaveCount(0);
});

test('load and mutation failures keep loaded data and remain retryable', async ({ page }) => {
    const fixture = await mockNotifications(page);
    await page.getByRole('button', { name: /^Notifications/ }).click();
    const list = page.getByRole('list', { name: 'Notifications', exact: true });
    fixture.fail('fetch');
    await page.getByRole('button', { name: 'Load older notifications', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Could not load older');
    await expect(list.getByRole('listitem')).toHaveCount(20);
    fixture.fail();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(list.getByRole('listitem')).toHaveCount(40);
    fixture.fail('clear-all');
    await page.getByRole('button', { name: 'Clear list', exact: true }).click();
    await expect(page.locator('#notification-toasts')).toContainText('Could not update notifications');
    await expect(list.getByRole('listitem')).toHaveCount(40);
    await expect(page.getByRole('button', { name: 'Notifications, 65 unread', exact: true })).toBeVisible();
});

test('switching accounts immediately discards loaded history and ignores late older pages', async ({ page }) => {
    const fixture = await mockNotifications(page);
    await page.getByRole('button', { name: /^Notifications/ }).click();
    let release!: () => void;
    fixture.hold(new Promise<void>(resolve => { release = resolve; }));
    await page.getByRole('button', { name: 'Load older notifications', exact: true }).click();
    await expect.poll(() => fixture.calls.some(call => call.action === 'fetch' && typeof call.input === 'object' && call.input?.cursor)).toBeTruthy();
    await dismissNotifications(page);
    await page.getByRole('button', { name: 'Switch account', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Notifications, 1 unread', exact: true })).toBeVisible();
    release();
    await page.getByRole('button', { name: 'Notifications, 1 unread', exact: true }).click();
    const list = page.getByRole('list', { name: 'Notifications', exact: true });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText('Second account private notice');
    await expect(page.getByText('Notice 65', { exact: true })).toHaveCount(0);
    await expect(page.locator('#notification-toasts')).toBeEmpty();
});
