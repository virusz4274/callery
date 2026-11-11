import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { expect, test, type Page } from '@playwright/test';
import type { UpdateProfileBody } from '../src/lib/schemas';

test.use({ serviceWorkers: 'block' });
test.setTimeout(90_000);

let assets: Promise<Map<string, string>> | undefined;
async function fixtureAssets() {
    assets ??= (async () => {
        const require = createRequire(import.meta.url);
        const esbuild = createRequire(require.resolve('tsx/package.json'))('esbuild') as {
            build(options: object): Promise<{ outputFiles: { text: string }[] }>;
        };
        type Plugin = {
            onResolve(options: { filter: RegExp }, callback: () => { path: string; namespace: string }): void;
            onLoad(options: { filter: RegExp; namespace: string }, callback: () => { contents: string; loader: string; resolveDir: string }): void;
        };
        const bundle = await esbuild.build({
            stdin: { resolveDir: process.cwd(), sourcefile: 'notification-settings-fixture.tsx', loader: 'tsx', contents: `
                import React from 'react';import {createRoot} from 'react-dom/client';import {SWRConfig} from 'swr';
                import {NotificationsSettings} from './src/components/settings/notifications-settings';
                import {ToastProvider} from './src/components/toast-provider';
                import {useNotificationSettings} from './src/hooks/settings/use-notification-settings';
                import {useUserProfile} from './src/hooks/use-user-profile';
                const user={id:'digest-owner',email:'owner@example.test',emailVerified:true,canChangePassword:true};
                function Fixture(){const {userProfile,isProfileLoading}=useUserProfile(user);const state=useNotificationSettings(user,userProfile);
                    if(isProfileLoading||!userProfile)return <p role="status">Loading settings</p>;
                    return <main className="mx-auto max-w-2xl p-4"><NotificationsSettings settings={state.notificationsState}
                        onSettingsChange={state.setNotificationsState} onSave={state.handleSaveNotifications} isSaving={state.isSavingNotifications}/></main>;
                }createRoot(document.getElementById('root')).render(<SWRConfig value={{provider:()=>new Map(),revalidateOnFocus:false,shouldRetryOnError:false}}><ToastProvider><Fixture/></ToastProvider></SWRConfig>);` },
            bundle: true, write: false, format: 'esm', jsx: 'automatic', logLevel: 'silent',
            alias: { '@': path.resolve('src') },
            define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' },
            plugins: [{ name: 'notification-fixture', setup(plugin: Plugin) {
                plugin.onResolve({ filter: /^\.\/push\/use-push-status$/ }, () => ({ path: 'push-status', namespace: 'notification-fixture' }));
                plugin.onLoad({ filter: /.*/, namespace: 'notification-fixture' }, () => ({
                    contents: `import {useState} from 'react';export function usePushStatus(){const[isEnabled,setIsEnabled]=useState(false);const[permission,setPermission]=useState('default');return {isSupported:true,isEnabled,isLoading:false,permission,error:false,refresh:async()=>{},setIsEnabled,setPermission}}`,
                    loader: 'js', resolveDir: process.cwd(),
                }));
            } }],
        });
        const css = await postcss([tailwind({ base: path.resolve('src'), optimize: false })]).process(await readFile('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
        return new Map([['fixture.js', bundle.outputFiles[0].text], ['fixture.css', css.css]]);
    })();
    return assets;
}

async function mockNotifications(page: Page) {
    const files = await fixtureAssets();
    const profile = {
        id: 'digest-owner', notificationSettings: { activityDigest: 'off' }, googleSync: { status: 'not_connected' },
        transcriptionSettings: { autoTranscribe: true, defaultProvider: 'gemini' }, storageSettings: { deletionPolicy: 'never' },
    };
    const patches: UpdateProfileBody[] = [];
    const unexpected: string[] = [];
    await page.route('**/*', async route => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/api/user/profile') {
            if (request.method() === 'PATCH') {
                const patch = request.postDataJSON() as UpdateProfileBody;
                patches.push(patch);
                Object.assign(profile.notificationSettings, patch.notificationSettings);
                return route.fulfill({ json: { success: true } });
            }
            return route.fulfill({ json: { profile } });
        }
        if (pathname.startsWith('/__notification-assets/')) {
            const name = pathname.slice('/__notification-assets/'.length);
            return route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'text/javascript', body: files.get(name)! });
        }
        if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__notification-assets/fixture.css"></head><body><div id="root"></div><script type="module" src="/__notification-assets/fixture.js"></script></body></html>' });
        unexpected.push(pathname);
        return route.abort();
    });
    await page.goto('/__notification-settings-fixture');
    return { patches, profile, unexpected };
}

for (const width of [390, 1280]) {
    test(`notification emails are digest-only and save each frequency at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const fixture = await mockNotifications(page);
        await expect(page.getByRole('radiogroup', { name: 'Activity digest' })).toBeVisible();
        await expect(page.getByRole('radio')).toHaveCount(3);
        await expect(page.getByRole('switch', { name: 'Browser push notifications' })).toBeVisible();
        await expect(page.getByRole('switch', { name: /Email when data/ })).toHaveCount(0);
        await expect(page.getByText('Individual recordings do not send processing emails.', { exact: false })).toBeVisible();
        for (const [activityDigest, label] of [['off', 'Off'], ['weekly', 'Weekly'], ['monthly', 'Monthly']] as const) {
            await page.getByRole('radio', { name: label, exact: true }).press('Space');
            await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
            await expect.poll(() => fixture.profile.notificationSettings.activityDigest).toBe(activityDigest);
            await expect(page.getByRole('button', { name: 'Save preferences', exact: true })).toBeEnabled();
            expect(fixture.patches.at(-1)).toEqual({ notificationSettings: { activityDigest } });
        }
        expect(fixture.patches).toHaveLength(3);
        expect(fixture.profile.transcriptionSettings).toEqual({ autoTranscribe: true, defaultProvider: 'gemini' });
        expect(fixture.profile.storageSettings).toEqual({ deletionPolicy: 'never' });
        expect(fixture.unexpected).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
}
