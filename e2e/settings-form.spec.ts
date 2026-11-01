import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';

async function bundleFixture(contents: string) {
    const require = createRequire(import.meta.url);
    const esbuild = createRequire(require.resolve('tsx/package.json'))('esbuild') as {
        build(options: object): Promise<{ outputFiles: { text: string }[] }>;
    };
    const result = await esbuild.build({
        stdin: { resolveDir: process.cwd(), sourcefile: 'settings-form-fixture.tsx', loader: 'tsx', contents },
        bundle: true, write: false, format: 'esm', jsx: 'automatic', logLevel: 'silent',
        define: { 'process.env.NODE_ENV': '"development"' },
        plugins: [{ name: 'fixture-toast', setup(plugin: {
            onResolve(options: { filter: RegExp }, callback: () => { path: string; namespace: string }): void;
            onLoad(options: { filter: RegExp; namespace: string }, callback: () => { contents: string; loader: string }): void;
        }) {
            plugin.onResolve({ filter: /^@\/components\/toast-provider$/ }, () => ({ path: 'toast', namespace: 'fixture' }));
            plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export function useToast(){return {toast(){}}}', loader: 'js' }));
        } }],
    });
    return `<div id="root"></div><script type="module">${result.outputFiles[0].text}</script>`;
}

// Exercise the actual form hook with React in a browser, without an app server,
// deployment credentials, API requests, or a separate DOM implementation.
test('settings drafts survive refresh, clear after saving, and reset on account changes', async ({ page }) => {
    const body = await bundleFixture(`
            import React, { useState } from 'react';
            import { createRoot } from 'react-dom/client';
            import { useSettingsForm } from './src/hooks/settings/use-settings-form';
            function Fixture() {
                const [subject, setSubject] = useState('first-owner');
                const [server, setServer] = useState({ firstName: 'Original', lastName: 'Surname' });
                const { form, state, setState } = useSettingsForm(subject, server);
                const { form: passwordForm } = useSettingsForm(subject, { currentPassword: '', newPassword: '', confirmPassword: '' });
                return <>
                    <input aria-label="First name" value={state.firstName} onChange={event => setState({ ...state, firstName: event.target.value })} />
                    <input aria-label="Last name" value={state.lastName} onChange={event => setState({ ...state, lastName: event.target.value })} />
                    <input aria-label="Current password" type="password" {...passwordForm.register('currentPassword')} />
                    <input aria-label="New password" type="password" {...passwordForm.register('newPassword')} />
                    <button onClick={() => setServer({ firstName: 'Remote name', lastName: 'Updated surname' })}>Refresh</button>
                    <button onClick={() => form.reset(form.getValues(), { keepDirtyValues: false })}>Save</button>
                    <button onClick={() => setServer({ firstName: 'Another update', lastName: 'Another surname' })}>Later refresh</button>
                    <button onClick={() => { setSubject('second-owner'); setServer({ firstName: 'Other', lastName: 'Account' }); }}>Switch account</button>
                </>;
            }
            createRoot(document.getElementById('root')).render(<Fixture />);
        `);
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body }));
    await page.goto('/__settings-form-fixture');
    await page.getByLabel('First name').fill('Unsaved name');
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByLabel('First name')).toHaveValue('Unsaved name');
    await expect(page.getByLabel('Last name')).toHaveValue('Updated surname');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Later refresh', exact: true }).click();
    await expect(page.getByLabel('First name')).toHaveValue('Another update');
    await page.getByLabel('First name').fill('First owner private draft');
    await page.getByLabel('Current password').fill('first-owner-secret');
    await page.getByLabel('New password').fill('first-owner-new-secret');
    await page.getByRole('button', { name: 'Switch account', exact: true }).click();
    await expect(page.getByLabel('First name')).toHaveValue('Other');
    await expect(page.getByLabel('Last name')).toHaveValue('Account');
    await expect(page.getByLabel('Current password')).toHaveValue('');
    await expect(page.getByLabel('New password')).toHaveValue('');
});

test('a pending settings save cannot revalidate or overwrite another signed-in user cache', async ({ page }) => {
    const body = await bundleFixture(`
        import React, { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import useSWR, { SWRConfig } from 'swr';
        import { useProfileSave } from './src/hooks/settings/use-profile-save';
        import { userProfileKey } from './src/lib/profile-client';
        function Fixture() {
            const [subject, setSubject] = useState('first-owner');
            const [result, setResult] = useState('idle');
            const save = useProfileSave(subject);
            const { data } = useSWR(userProfileKey(subject), async () => (await fetch('/fixture-profile?owner=' + subject)).json());
            return <>
                <output aria-label="Cached profile">{data?.name || 'loading'}</output>
                <output aria-label="Save result">{result}</output>
                <button onClick={async () => { setResult('saving'); setResult(await save({ timezone: 'Europe/London' }) ? 'saved' : 'account changed'); }}>Save</button>
                <button onClick={() => setSubject('second-owner')}>Switch account</button>
            </>;
        }
        createRoot(document.getElementById('root')).render(<SWRConfig value={{ provider: () => new Map(), revalidateOnFocus: false }}><Fixture /></SWRConfig>);
    `);
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const reads: string[] = [];
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/user/profile') {
            await hold;
            return route.fulfill({ json: { success: true } });
        }
        if (url.pathname === '/fixture-profile') {
            const owner = url.searchParams.get('owner')!;
            reads.push(owner);
            return route.fulfill({ json: { name: owner === 'first-owner' ? 'First private profile' : 'Second private profile' } });
        }
        return route.fulfill({ contentType: 'text/html', body });
    });
    await page.goto('/__settings-account-fixture');
    await expect(page.getByLabel('Cached profile')).toHaveText('First private profile');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByLabel('Save result')).toHaveText('saving');
    await page.getByRole('button', { name: 'Switch account', exact: true }).click();
    await expect(page.getByLabel('Cached profile')).toHaveText('Second private profile');
    release();
    await expect(page.getByLabel('Save result')).toHaveText('account changed');
    await expect(page.getByLabel('Cached profile')).toHaveText('Second private profile');
    expect(reads).toEqual(['first-owner', 'second-owner']);
});

test('saving processing does not save or reset a dirty retention section', async ({ page }) => {
    const body = await bundleFixture(`
        import React from 'react'; import { createRoot } from 'react-dom/client'; import useSWR, { SWRConfig } from 'swr';
        import { usePreferenceSettings } from './src/hooks/settings/use-preference-settings';
        import { userProfileKey } from './src/lib/profile-client';
        function Fixture(){
            const {data}=useSWR(userProfileKey('owner'),async()=>(await fetch('/api/user/profile')).json());
            const state=usePreferenceSettings({id:'owner'},data?.profile || null);
            return <><output aria-label="Retention draft">{state.dataState.deletionPolicy}</output>
                <button onClick={()=>state.setDataState({...state.dataState,deletionPolicy:'6m'})}>Edit retention</button>
                <button onClick={()=>state.setDataState({...state.dataState,transcriptionSettings:{...state.dataState.transcriptionSettings,autoTranscribe:false}})}>Edit processing</button>
                <button onClick={()=>state.handleSaveData('processing')}>Save processing</button>
                <button onClick={()=>state.handleSaveData('retention')}>Save retention</button></>;
        }
        createRoot(document.getElementById('root')).render(<SWRConfig value={{provider:()=>new Map(),revalidateOnFocus:false}}><Fixture/></SWRConfig>);
    `);
    const patches: unknown[] = [];
    let profile = { timezone: 'UTC', storageSettings: { deletionPolicy: '3m' }, transcriptionSettings: { autoTranscribe: true, defaultProvider: 'gemini' } };
    await page.route('**/*', async route => {
        if (new URL(route.request().url()).pathname === '/api/user/profile') {
            if (route.request().method() === 'PATCH') {
                const patch = route.request().postDataJSON(); patches.push(patch);
                profile = { ...profile, storageSettings: { ...profile.storageSettings, ...patch.storageSettings },
                    transcriptionSettings: { ...profile.transcriptionSettings, ...patch.transcriptionSettings } };
                return route.fulfill({ json: { success: true } });
            }
            return route.fulfill({ json: { profile } });
        }
        return route.fulfill({ contentType: 'text/html', body });
    });
    await page.goto('/__section-save-fixture');
    await expect(page.getByLabel('Retention draft')).toHaveText('3m');
    await page.getByRole('button', { name: 'Edit retention', exact: true }).click();
    await page.getByRole('button', { name: 'Edit processing', exact: true }).click();
    await page.getByRole('button', { name: 'Save processing', exact: true }).click();
    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0]).toEqual({ transcriptionSettings: { autoTranscribe: false, defaultProvider: 'gemini' } });
    expect(profile.storageSettings.deletionPolicy).toBe('3m');
    await expect(page.getByLabel('Retention draft')).toHaveText('6m');
    await page.getByRole('button', { name: 'Save retention', exact: true }).click();
    await expect.poll(() => patches.length).toBe(2);
    expect(patches[1]).toEqual({ storageSettings: { deletionPolicy: '6m' } });
});

test('HeroUI profile inputs display refreshed values and password fields clear on account changes', async ({ page }) => {
    const body = await bundleFixture(`
        import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
        import {ProfileSettings} from './src/components/settings/profile-settings';
        import {useProfileSettings} from './src/hooks/settings/use-profile-settings';
        import {useSettingsForm} from './src/hooks/settings/use-settings-form';
        function Fixture(){const[subject,setSubject]=useState('owner');const[profile,setProfile]=useState(null);
            const user={id:subject,email:'fictional@example.invalid',canChangePassword:true};
            const state=useProfileSettings(user,profile); const{form:passwordForm}=useSettingsForm(subject,{currentPassword:'',newPassword:'',confirmPassword:''});
            return <><button onClick={()=>setProfile({firstName:'Fetched first',lastName:'Fetched last'})}>Load profile</button>
                <button onClick={()=>setSubject('another-owner')}>Switch account</button>
                <ProfileSettings user={user} profileForm={state.profileForm} passwordForm={passwordForm} onUpdateProfile={state.handleUpdateProfile}
                    onChangePassword={async()=>{}} isProfileSaving={false} isPasswordSaving={false}/></>;
        }
        createRoot(document.getElementById('root')).render(<Fixture/>);
    `);
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body }));
    await page.goto('/__heroui-profile-fixture');
    await page.getByRole('button', { name: 'Load profile', exact: true }).click();
    await expect(page.getByLabel('First Name', { exact: true })).toHaveValue('Fetched first');
    await expect(page.getByLabel('Last Name', { exact: true })).toHaveValue('Fetched last');
    await page.getByLabel('Current Password', { exact: true }).fill('old-account-secret');
    await page.getByLabel('New Password', { exact: true }).fill('old-account-new-secret');
    await page.getByRole('button', { name: 'Switch account', exact: true }).click();
    await expect(page.getByLabel('Current Password', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('New Password', { exact: true })).toHaveValue('');
});
