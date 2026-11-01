import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('account changes hide cached contacts, recordings, statistics, workspace pages and opened audio', async ({ page }) => {
    const require = createRequire(import.meta.url);
    const esbuild = createRequire(require.resolve('tsx/package.json'))('esbuild') as { build(options: object): Promise<{ outputFiles: { text: string }[] }> };
    type Plugin = { onResolve(options: { filter: RegExp }, callback: (input: { path: string }) => { path: string; namespace: string } | undefined): void;
        onLoad(options: { filter: RegExp; namespace: string }, callback: (input: { path: string }) => { loader: string; contents: string; resolveDir: string }): void };
    const modules: Record<string, string> = {
        identity: `import React, { createContext, useContext } from 'react'; export const Identity=createContext(null); export function useUser(){return {user:useContext(Identity)}};`,
        navigation: `export function useSearchParams(){return new URLSearchParams('id=shared-id')}`,
        recordings: `export async function getRecordingsAction(){return (await fetch('/fixture-recordings')).json()}; export async function getRecordingDetailsAction(){return (await fetch('/fixture-detail')).json()}; export async function deleteRecordingAction(){}; export async function updateRecordingAction(){}`,
        stats: `export async function getStatsAction(){return (await fetch('/fixture-stats')).json()}`,
    };
    const result = await esbuild.build({
        stdin: { resolveDir: process.cwd(), sourcefile: 'account-cache-fixture.tsx', loader: 'tsx', contents: `
            import React, { useState } from 'react'; import { createRoot } from 'react-dom/client'; import { SWRConfig } from 'swr';
            import { Identity } from 'fixture-identity';
            import { useContacts } from './src/hooks/use-contacts'; import { useRecordings } from './src/hooks/use-recordings';
            import { useStats } from './src/hooks/use-stats'; import { useTranscriptionWorkspace } from './src/hooks/use-transcription-workspace';
            import { useRecordingWorkspace } from './src/hooks/use-recording-workspace';
            function Content(){const contacts=useContacts();const recordings=useRecordings();const stats=useStats();const jobs=useTranscriptionWorkspace(true);const viewer=useRecordingWorkspace(recordings.data || []);
                return <><output aria-label="Contacts">{contacts.data?.map(value=>value.name).join(',') || 'loading'}</output>
                <output aria-label="Recordings">{recordings.data?.map(value=>value.contactName).join(',') || 'loading'}</output>
                <output aria-label="Stats">{stats.stats?.totalRecordings ?? 'loading'}</output>
                <output aria-label="Jobs">{jobs.waiting.map(value=>value.contactName).join(',') || 'loading'}</output>
                <output aria-label="Opened recording">{viewer.recording?.contactName || 'loading'}</output>
                <output aria-label="Autoplay">{String(viewer.autoPlay)}</output>
                <button onClick={()=>viewer.open(recordings.data[0],true)}>Open audio</button></>}
            function App(){const [user,setUser]=useState({id:'first-owner'});return <Identity.Provider value={user}><button onClick={()=>setUser({id:'second-owner'})}>Switch account</button><Content/></Identity.Provider>}
            createRoot(document.getElementById('root')).render(<SWRConfig value={{provider:()=>new Map(),revalidateOnFocus:false}}><App/></SWRConfig>);
        ` },
        bundle: true, write: false, format: 'esm', jsx: 'automatic', logLevel: 'silent', define: { 'process.env.NODE_ENV': '"development"' },
        plugins: [{ name: 'account-fixture', setup(plugin: Plugin) {
            plugin.onResolve({ filter: /^(fixture-identity|@\/lib\/auth\/client|next\/navigation|@\/app\/actions\/(recordings|stats))$/ }, ({ path }) => ({
                path: path.includes('recordings') ? 'recordings' : path.includes('stats') ? 'stats' : path === 'next/navigation' ? 'navigation' : 'identity', namespace: 'fixture',
            }));
            plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', contents: modules[path], resolveDir: process.cwd() }));
        } }],
    });
    const body = `<div id="root"></div><script type="module">${result.outputFiles[0].text}</script>`;
    let owner = 'First', release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const recording = () => ({ id: 'shared-id', contactName: `${owner} private recording`, updatedAt: '2026-10-23T00:00:00Z' });
    await page.route('**/*', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path.startsWith('/api/') || path.startsWith('/fixture-')) {
            if (owner === 'Second') await held;
            if (path === '/api/contacts') return route.fulfill({ json: { contacts: [{ id: owner, name: `${owner} private contact` }], totalCount: 1, limit: 20, skip: 0 } });
            if (path === '/api/transcription/workspace') return route.fulfill({ json: { waiting: [{ id: owner, contactName: `${owner} private job` }], batches: [], providers: [] } });
            if (path === '/fixture-recordings') return route.fulfill({ json: { recordings: [recording()], totalCount: 1 } });
            if (path === '/fixture-detail') return route.fulfill({ json: { recording: recording() } });
            if (path === '/fixture-stats') return route.fulfill({ json: { stats: { totalRecordings: owner === 'First' ? 111 : 222 } } });
            return route.abort();
        }
        return route.fulfill({ contentType: 'text/html', body });
    });
    await page.goto('/__account-cache-fixture');
    await expect(page.getByLabel('Contacts', { exact: true })).toHaveText('First private contact');
    await expect(page.getByLabel('Recordings', { exact: true })).toHaveText('First private recording');
    await expect(page.getByLabel('Jobs', { exact: true })).toHaveText('First private job');
    await expect(page.getByLabel('Stats', { exact: true })).toHaveText('111');
    await page.getByRole('button', { name: 'Open audio', exact: true }).click();
    await expect(page.getByLabel('Autoplay', { exact: true })).toHaveText('true');
    owner = 'Second';
    await page.getByRole('button', { name: 'Switch account', exact: true }).click();
    for (const label of ['Contacts', 'Recordings', 'Jobs', 'Stats', 'Opened recording']) await expect(page.getByLabel(label, { exact: true })).toHaveText('loading');
    await expect(page.getByLabel('Autoplay', { exact: true })).toHaveText('false');
    release();
    await expect(page.getByLabel('Contacts', { exact: true })).toHaveText('Second private contact');
    await expect(page.getByLabel('Recordings', { exact: true })).toHaveText('Second private recording');
    await expect(page.getByLabel('Jobs', { exact: true })).toHaveText('Second private job');
    await expect(page.getByLabel('Stats', { exact: true })).toHaveText('222');
    await expect(page.getByLabel('Opened recording', { exact: true })).toHaveText('Second private recording');
});
