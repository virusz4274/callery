import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { expect, test, type Page } from '@playwright/test';
import type { SemanticSearchInput } from '../src/lib/search/types';

test.use({ serviceWorkers: 'block' });
test.setTimeout(90_000);
let assets: Promise<Map<string, string>> | undefined;
const audio = Buffer.alloc(44 + 8000 * 32, 128);
audio.write('RIFF', 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(8000, 28); audio.writeUInt16LE(8, 34);
audio.writeUInt16LE(1, 32); audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40);

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
            action: `export async function searchRecordingsAction(input){const response=await fetch('/__transcript-search',{method:'POST',headers:{'Content-Type':'application/json','X-Fixture-Owner':window.transcriptOwner||'guest'},body:JSON.stringify(input)});return response.json()}`,
        };
        const bundle = await esbuild.build({
            stdin: { resolveDir: process.cwd(), sourcefile: 'transcript-fixture.tsx', loader: 'tsx', contents: `
                import React,{useState}from'react';import{createRoot}from'react-dom/client';import{SWRConfig}from'swr';
                import{Identity}from'fixture-identity';import{RecordingContent}from'./src/components/recording-view/recording-content';
                import{SemanticResults}from'./src/components/recordings/semantic-results';import{useSemanticSearch}from'./src/hooks/use-semantic-search';
                import{openRecordingWorkspace}from'./src/lib/recording-workspace-navigation';
                const params=new URLSearchParams(location.search),view=params.get('view')||'viewer';
                const recording={id:'recording-one',authSubject:'owner-a',contactName:'Fictional participant',phoneNumber:'',r2Key:'fixture',fileName:'first-participant.wav',
                    standardizedDisplayName:'First participant',fileSize:256044,mimeType:'audio/wav',duration:32,recordedAt:'2026-01-05T10:00:00Z',createdAt:'2026-01-05T10:00:00Z',updatedAt:'2026-01-05T10:00:00Z',
                    transcriptionStatus:'completed',transcriptionProvider:'soniox',transcriptionModel:'fixture',summary:'A fictional call about invoices and deliveries.',tags:[],isStarred:false,isArchived:false,transcriptRevision:'revision-current',
                    fullTranscript:[
                        {speakerId:'speaker-a',text:'Alpha invoice and alpha deadline.',transliteratedText:'Malayalam invoice and malayalam deadline.',start:0,end:4},
                        {speakerId:'speaker-b',text:'The shipment arrives on Friday.',transliteratedText:'Shipment Friday.',start:5,end:9},
                        {speakerId:'speaker-c',text:'Alpha requires a signed receipt.',transliteratedText:'Signed receipt.',start:10,end:14},
                        {speakerId:'speaker-d',text:'Untimed participant detail.',transliteratedText:'Untimed participant detail.'},
                        {speakerId:'speaker-e',text:'The shipping address is confirmed.',start:15,end:19},
                        {speakerId:'speaker-f',text:'There are six participants so far.',start:20,end:24},
                        {speakerId:'speaker-g',text:'The seventh participant confirms.',start:25,end:29}
                    ]};
                if(params.has('export')){recording.fullTranscript[0].text+=' Café മലയാളം.';recording.fullTranscript[0].transliteratedText+=' മലയാളം.';recording.fullTranscript[4].text+=' Málaga 中文.';}
                if(params.has('unsafe'))recording.id='../unsafe:☎/recording';
                if(params.has('empty'))recording.fullTranscript=[];
                function SearchProbe(){const[filters,setFilters]=useState({contactId:'507f1f77bcf86cd799439011',startDate:'2026-01-01',endDate:'2026-03-31'});const search=useSemanticSearch(5,filters);
                    return <section><label>Meaning search<input aria-label="Meaning search" value={search.query} onChange={e=>search.setQuery(e.target.value)}/></label>
                        <button onClick={search.search}>Run meaning search</button><button onClick={()=>search.changePage(search.page+1)}>Next search page</button>
                        <button onClick={()=>setFilters({contactId:'507f1f77bcf86cd799439022',startDate:'2026-04-01',endDate:'2026-06-30'})}>Change search filters</button>
                        <output aria-label="Search results">{search.results?.map(value=>value.contactName).join(',')||'loading'}</output><output aria-label="Search page">{search.page}</output>
                        <output aria-label="Submitted search">{search.submittedQuery}</output></section>}
                function App(){const[owner,setOwner]=useState(params.has('guest')?undefined:'owner-a');const[visible,setVisible]=useState(true);
                    const[target,setTarget]=useState(params.has('explicit')?{segmentIndex:2,start:10,transcriptRevision:'revision-current'}:undefined);
                    const[urlRevision,setUrlRevision]=useState(0);
                    const[opened,setOpened]=useState(view==='viewer');const[page,setPage]=useState(1);const[openResult,setOpenResult]=useState('');
                    window.transcriptOwner=owner;window.switchTranscriptOwner=()=>setOwner(owner==='owner-a'?'owner-b':'owner-a');
                    window.toggleTranscriptViewer=()=>setVisible(value=>!value);window.clearTranscriptTarget=()=>setTarget(undefined);
                    window.rotateTranscriptUrl=()=>setUrlRevision(value=>value+1);
                    window.setTranscriptTarget=start=>setTarget({start,transcriptRevision:'revision-current'});
                    const open=(item,next)=>{setOpenResult(JSON.stringify({id:item.id,target:next}));openRecordingWorkspace(item.id,next);setTarget(next);setOpened(true)};
                    return <SWRConfig value={{provider:()=>new Map(),revalidateOnFocus:false,shouldRetryOnError:false}}><Identity.Provider value={owner?{id:owner}:null}>
                        <main className="mx-auto flex h-screen max-w-4xl flex-col gap-4 p-3 md:p-6">
                            {view==='hook'?<SearchProbe/>:<>
                            {view==='results'&&<><SemanticResults recordings={[recording]} matches={{'recording-one':[
                                {text:'A signed receipt is needed for this invoice.',segmentIndex:2,start:10,end:14,transcriptRevision:'revision-current'},
                                {text:'Untimed participant detail.',segmentIndex:3,transcriptRevision:'revision-current'}]}}
                                onOpen={open} page={page} hasMore={page===1} pending={false} onPageChange={setPage}/><output aria-label="Opened search target">{openResult}</output></>}
                            {visible&&opened&&<div className="min-h-0 flex-1"><RecordingContent recording={recording} playbackUrl={'/__transcript-audio.wav?signature='+urlRevision} playbackOwnerId={owner} initialTarget={target} autoPlay={params.has('autoplay')} workspace/></div>}
                            </>}
                        </main></Identity.Provider></SWRConfig>}
                createRoot(document.getElementById('root')).render(<App/>);` },
            bundle: true, write: false, format: 'esm', jsx: 'automatic', logLevel: 'silent', alias: { '@': path.resolve('src') },
            define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' },
            plugins: [{ name: 'transcript-fixture', setup(plugin: Plugin) {
                plugin.onResolve({ filter: /^(fixture-identity|@\/lib\/auth\/client|@\/app\/actions\/search-actions)$/ }, ({ path: module }) => ({
                    path: module.includes('/actions/') ? 'action' : 'auth', namespace: 'transcript',
                }));
                plugin.onLoad({ filter: /.*/, namespace: 'transcript' }, ({ path: module }) => ({ contents: modules[module], loader: 'js', resolveDir: process.cwd() }));
            } }],
        });
        const css = await postcss([tailwind({ base: path.resolve('src'), optimize: false })]).process(await readFile('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
        return new Map([['fixture.js', bundle.outputFiles[0].text], ['fixture.css', css.css]]);
    })();
    return assets;
}

async function mockTranscript(page: Page, options: {
    query?: string;
    respond?: (input: SemanticSearchInput, owner: string) => Promise<Record<string, unknown>> | Record<string, unknown>;
} = {}) {
    const files = await fixtureAssets();
    const unexpected: string[] = [];
    const searches: (SemanticSearchInput & { owner: string })[] = [];
    await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.pathname.startsWith('/__transcript-assets/')) {
            const name = url.pathname.slice('/__transcript-assets/'.length);
            return route.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'text/javascript', body: files.get(name)! });
        }
        if (url.pathname === '/__transcript-audio.wav') {
            const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers().range || '');
            if (match) {
                const start = Number(match[1]), end = Math.min(match[2] ? Number(match[2]) : audio.length - 1, audio.length - 1);
                return route.fulfill({ status: 206, headers: { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes',
                    'Content-Range': `bytes ${start}-${end}/${audio.length}`, 'Content-Length': String(end - start + 1) }, body: audio.subarray(start, end + 1) });
            }
            return route.fulfill({ contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes' }, body: audio });
        }
        if (url.pathname === '/__transcript-search') {
            const input = request.postDataJSON() as SemanticSearchInput, owner = request.headers()['x-fixture-owner'];
            searches.push({ ...input, owner });
            return route.fulfill({ json: await options.respond?.(input, owner) ?? { success: true, results: [{ id: 'matched', contactName: `${input.contactId}:${input.page}` }], matches: {}, mode: 'vector', hasMore: true } });
        }
        if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__transcript-assets/fixture.css"></head><body><div id="root"></div><script type="module" src="/__transcript-assets/fixture.js"></script></body></html>' });
        unexpected.push(url.pathname);
        return route.abort();
    });
    await page.goto(`/__transcript-fixture${options.query || ''}`);
    return { unexpected, searches };
}

async function audioTime(page: Page) {
    return page.getByLabel('Recording audio', { exact: true }).evaluate(element => (element as HTMLAudioElement).currentTime);
}

async function readyAudio(page: Page) {
    await expect.poll(() => page.getByLabel('Recording audio', { exact: true }).evaluate(element => (element as HTMLAudioElement).duration)).toBe(32);
}

async function mockTranscriptClipboard(page: Page, fail = false) {
    await page.addInitScript(({ fail }) => {
        const state = window as typeof window & { transcriptClipboard: string[] };
        state.transcriptClipboard = [];
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
            writeText: async (text: string) => {
                if (fail) throw new Error('Clipboard unavailable');
                state.transcriptClipboard.push(text);
            },
        } });
    }, { fail });
}

const originalExport = [
    '[00:00] Speaker 1\nAlpha invoice and alpha deadline. Café മലയാളം.',
    '[00:05] Speaker 2\nThe shipment arrives on Friday.',
    '[00:10] Speaker 3\nAlpha requires a signed receipt.',
    'Speaker 4\nUntimed participant detail.',
    '[00:15] Speaker 5\nThe shipping address is confirmed. Málaga 中文.',
    '[00:20] Speaker 6\nThere are six participants so far.',
    '[00:25] Speaker 7\nThe seventh participant confirms.',
].join('\n\n');
const transliteratedExport = [
    '[00:00] Speaker 1\nMalayalam invoice and malayalam deadline. മലയാളം.',
    '[00:05] Speaker 2\nShipment Friday.',
    '[00:10] Speaker 3\nSigned receipt.',
    'Speaker 4\nUntimed participant detail.',
    '[00:15] Speaker 5\nThe shipping address is confirmed. Málaga 中文.',
    '[00:20] Speaker 6\nThere are six participants so far.',
    '[00:25] Speaker 7\nThe seventh participant confirms.',
].join('\n\n');

async function downloadTranscript(page: Page) {
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Download TXT', exact: true }).click(),
    ]);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return { filename: download.suggestedFilename(), text: Buffer.concat(chunks).toString('utf8') };
}

for (const width of [390, 1280]) {
    test(`copy and UTF-8 TXT exports use the entire loaded transcript at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await mockTranscriptClipboard(page);
        const fixture = await mockTranscript(page, { query: '?guest=1&export=1&unsafe=1' });
        await page.getByRole('searchbox', { name: 'Find in transcript', exact: true }).fill('alpha');
        await expect(page.locator('mark')).toHaveCount(3);
        await page.getByRole('button', { name: 'Copy transcript', exact: true }).click();
        await expect(page.getByRole('status').filter({ hasText: 'Transcript copied.' })).toBeVisible();
        expect(await page.evaluate(() => (window as unknown as { transcriptClipboard: string[] }).transcriptClipboard.at(-1))).toBe(originalExport);
        const original = await downloadTranscript(page);
        expect(original.text).toBe(originalExport);
        expect(original.filename).toMatch(/^transcript-[A-Za-z0-9_-]+\.txt$/);
        expect(original.filename).not.toContain('..');
        expect(original.filename).not.toContain('transliteration');
        expect(original.text).not.toMatch(/owner-a|first-participant\.wav|2026-01-05|<mark|r2Key/);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: test.info().outputPath(`transcript-export-${width}.png`), fullPage: true, animations: 'disabled' });

        await page.getByRole('button', { name: 'Transliteration', exact: true }).click();
        await page.getByRole('button', { name: 'Copy transcript', exact: true }).click();
        await expect(page.getByRole('status').filter({ hasText: 'Transliteration copied.' })).toBeVisible();
        expect(await page.evaluate(() => (window as unknown as { transcriptClipboard: string[] }).transcriptClipboard.at(-1))).toBe(transliteratedExport);
        const transliterated = await downloadTranscript(page);
        expect(transliterated.text).toBe(transliteratedExport);
        expect(transliterated.filename).toMatch(/^transcript-[A-Za-z0-9_-]+-transliteration\.txt$/);
        expect(fixture.searches).toEqual([]);
        expect(fixture.unexpected).toEqual([]);
    });

    test(`clipboard failure leaves UTF-8 TXT downloads available at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await mockTranscriptClipboard(page, true);
        const fixture = await mockTranscript(page, { query: '?guest=1&export=1' });
        await page.getByRole('button', { name: 'Copy transcript', exact: true }).click();
        await expect(page.getByRole('alert')).toHaveText('Could not copy the transcript. Use Download TXT to save it instead.');
        const download = await downloadTranscript(page);
        expect(download.text).toBe(originalExport);
        expect(download.filename).toBe('transcript-recording-one.txt');
        await expect(page.getByRole('alert')).toHaveCount(0);
        expect(fixture.unexpected).toEqual([]);
    });

    test(`timestamp seeking, active segments and seven read-only speakers work at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const fixture = await mockTranscript(page);
        await readyAudio(page);
        const seek = page.getByRole('button', { name: 'Seek to 0:05, Speaker 2', exact: true });
        await seek.focus(); await page.keyboard.press('Enter');
        await expect.poll(() => audioTime(page)).toBe(5);
        await expect(page.locator('[data-segment-index="1"]')).toHaveAttribute('data-active', 'true');
        await page.getByLabel('Recording audio', { exact: true }).evaluate(element => (element as HTMLAudioElement).play());
        await expect.poll(() => audioTime(page)).toBeGreaterThan(5.1);
        await page.getByLabel('Recording audio', { exact: true }).evaluate(element => (element as HTMLAudioElement).pause());
        await page.getByLabel('Recording audio', { exact: true }).evaluate(element => { const audio = element as HTMLAudioElement; audio.currentTime = 4.5; audio.dispatchEvent(new Event('timeupdate')); });
        await expect(page.locator('[data-segment-index][data-active="true"]')).toHaveCount(0);
        await expect(page.locator('[data-segment-index="3"]')).toContainText('Time unavailable');
        await expect(page.locator('[data-segment-index="3"] button')).toHaveCount(0);
        for (let speaker = 1; speaker <= 7; speaker++) await expect(page.getByText(`Speaker ${speaker}`, { exact: true })).toBeVisible();
        await expect(page.locator('[contenteditable="true"], textarea')).toHaveCount(0);
        await expect(page.getByRole('button', { name: /edit transcript|rename speaker/i })).toHaveCount(0);
        await page.getByRole('button', { name: 'Seek to 0:25, Speaker 7', exact: true }).scrollIntoViewIfNeeded();
        await expect(page.getByRole('button', { name: 'Seek to 0:25, Speaker 7', exact: true })).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: test.info().outputPath(`transcript-${width}.png`), fullPage: true, animations: 'disabled' });
        expect(fixture.unexpected).toEqual([]);
    });

    test(`transcript find navigates original and transliterated matches at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await mockTranscript(page);
        const find = page.getByRole('searchbox', { name: 'Find in transcript', exact: true });
        await find.fill('alpha');
        await expect(page.getByRole('status')).toHaveText('1 of 3');
        await expect(page.locator('mark')).toHaveCount(3);
        await expect(page.locator('mark[data-current-match="true"]')).toHaveCount(1);
        await page.getByRole('button', { name: 'Next transcript match', exact: true }).click();
        await expect(page.getByRole('status')).toHaveText('2 of 3');
        await page.getByRole('button', { name: 'Previous transcript match', exact: true }).click();
        await expect(page.getByRole('status')).toHaveText('1 of 3');
        await find.press('Shift+Enter');
        await expect(page.getByRole('status')).toHaveText('3 of 3');
        await expect(page.locator('[data-segment-index="2"] mark[data-current-match="true"]')).toHaveText('Alpha');
        await find.fill('malayalam');
        await expect(page.getByRole('status')).toHaveText('No matches');
        await page.getByRole('button', { name: 'Transliteration', exact: true }).click();
        await expect(page.getByRole('status')).toHaveText('1 of 2');
        await expect(page.locator('mark')).toHaveCount(2);
        await page.getByRole('button', { name: 'Clear transcript search', exact: true }).click();
        await expect(find).toHaveValue('');
        await expect(page.locator('mark')).toHaveCount(0);
    });
}

test('empty loaded transcripts have no copy or TXT download actions', async ({ page }) => {
    const fixture = await mockTranscript(page, { query: '?guest=1&empty=1' });
    await expect(page.getByText('No transcript available', { exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Transcript export', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Copy transcript', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Download TXT', exact: true })).toHaveCount(0);
    expect(fixture.unexpected).toEqual([]);
});

test('playback resumes per account while explicit search targets take precedence', async ({ page }) => {
    await page.addInitScript(() => {
        if (!localStorage.getItem('callery:playback:owner-a:recording-one')) localStorage.setItem('callery:playback:owner-a:recording-one', JSON.stringify({ seconds: 7 }));
        if (!localStorage.getItem('callery:playback:owner-b:recording-one')) localStorage.setItem('callery:playback:owner-b:recording-one', JSON.stringify({ seconds: 3 }));
    });
    await mockTranscript(page);
    await readyAudio(page);
    await expect.poll(() => audioTime(page)).toBe(7);
    await page.getByRole('button', { name: 'Seek to 0:15, Speaker 5', exact: true }).click();
    await expect.poll(() => audioTime(page)).toBe(15);
    await page.evaluate(() => (window as unknown as { switchTranscriptOwner: () => void }).switchTranscriptOwner());
    await expect.poll(() => audioTime(page)).toBe(3);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('callery:playback:owner-a:recording-one')!).seconds)).toBe(15);
    await page.evaluate(() => (window as unknown as { switchTranscriptOwner: () => void }).switchTranscriptOwner());
    await expect.poll(() => audioTime(page)).toBe(15);
    await page.reload();
    await readyAudio(page);
    await expect.poll(() => audioTime(page)).toBe(15);
    await page.goto('/__transcript-fixture?explicit=1');
    await readyAudio(page);
    await expect.poll(() => audioTime(page)).toBe(10);
    await expect(page.locator('[data-segment-index="2"]')).toHaveAttribute('data-active', 'true');
});

for (const autoPlay of [false, true]) test(`polled signed URLs preserve playing and paused media without reapplying passage targets (autoplay ${autoPlay})`, async ({ page }) => {
    const fixture = await mockTranscript(page, { query: `?explicit=1${autoPlay ? '&autoplay=1' : ''}` });
    await readyAudio(page);
    const audio = page.getByLabel('Recording audio', { exact: true });
    await expect.poll(() => audioTime(page)).toBeGreaterThanOrEqual(10);
    expect(await audioTime(page)).toBeLessThan(15);
    await audio.evaluate(element => {
        const media = element as HTMLAudioElement;
        media.currentTime = 16;
        (window as unknown as { heldTranscriptAudio: HTMLAudioElement }).heldTranscriptAudio = media;
        return media.play();
    });
    await expect.poll(() => audioTime(page)).toBeGreaterThan(16.1);
    for (let revision = 1; revision <= 3; revision++) {
        const before = await audioTime(page);
        await page.evaluate(() => (window as unknown as { rotateTranscriptUrl: () => void }).rotateTranscriptUrl());
        await expect(audio.locator('source')).toHaveAttribute('src', `/__transcript-audio.wav?signature=${revision}`);
        await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).paused)).toBe(false);
        await expect.poll(() => audioTime(page)).toBeGreaterThan(before + 0.05);
        expect(await audio.evaluate(element => element === (window as unknown as { heldTranscriptAudio: HTMLAudioElement }).heldTranscriptAudio)).toBe(true);
    }
    await audio.evaluate(element => (element as HTMLAudioElement).pause());
    const pausedAt = await audioTime(page);
    await page.evaluate(() => (window as unknown as { rotateTranscriptUrl: () => void }).rotateTranscriptUrl());
    await expect(audio.locator('source')).toHaveAttribute('src', '/__transcript-audio.wav?signature=4');
    await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).paused)).toBe(true);
    expect(await audioTime(page)).toBeCloseTo(pausedAt, 1);

    // A different passage still applies once; removing it leaves the current
    // position alone instead of rereading an older saved history checkpoint.
    await page.evaluate(() => (window as unknown as { setTranscriptTarget: (start: number) => void }).setTranscriptTarget(20));
    await expect.poll(() => audioTime(page)).toBe(20);
    await audio.evaluate(element => { (element as HTMLAudioElement).currentTime = 22; });
    await page.evaluate(() => (window as unknown as { clearTranscriptTarget: () => void }).clearTranscriptTarget());
    await expect.poll(() => audioTime(page)).toBe(22);
    await page.evaluate(() => (window as unknown as { rotateTranscriptUrl: () => void }).rotateTranscriptUrl());
    await expect(audio.locator('source')).toHaveAttribute('src', '/__transcript-audio.wav?signature=5');
    expect(await audioTime(page)).toBe(22);
    expect(fixture.unexpected).toEqual([]);
});

test('account changes and viewer unmount still pause the previous audio element', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('callery:playback:owner-b:recording-one', JSON.stringify({ seconds: 3 })));
    const fixture = await mockTranscript(page);
    await readyAudio(page);
    const audio = page.getByLabel('Recording audio', { exact: true });
    await audio.evaluate(element => { const media = element as HTMLAudioElement; media.currentTime = 12; return media.play(); });
    await expect.poll(() => audioTime(page)).toBeGreaterThan(12.1);
    await page.evaluate(() => (window as unknown as { switchTranscriptOwner: () => void }).switchTranscriptOwner());
    await expect.poll(() => audioTime(page)).toBe(3);
    await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).paused)).toBe(true);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('callery:playback:owner-a:recording-one')!).seconds)).toBeGreaterThan(12);
    await audio.evaluate(element => {
        const media = element as HTMLAudioElement;
        (window as unknown as { heldTranscriptAudio: HTMLAudioElement }).heldTranscriptAudio = media;
        return media.play();
    });
    await page.evaluate(() => (window as unknown as { toggleTranscriptViewer: () => void }).toggleTranscriptViewer());
    await expect(audio).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { heldTranscriptAudio: HTMLAudioElement }).heldTranscriptAudio.paused)).toBe(true);
    expect(fixture.unexpected).toEqual([]);
});

test('public playback never writes account playback history', async ({ page }) => {
    await mockTranscript(page, { query: '?guest=1' });
    await readyAudio(page);
    await page.getByRole('button', { name: 'Seek to 0:20, Speaker 6', exact: true }).click();
    await expect.poll(() => audioTime(page)).toBe(20);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('callery:playback:')))).toEqual([]);
});

test('semantic excerpts pass real timing and revision to the viewer; untimed matches remain untimed', async ({ page }) => {
    const fixture = await mockTranscript(page, { query: '?view=results' });
    await page.getByRole('button', { name: /0:10 · Open passage/ }).click();
    const opened = JSON.parse(await page.getByLabel('Opened search target').textContent() || '{}');
    expect(opened).toEqual({ id: 'recording-one', target: { segmentIndex: 2, start: 10, transcriptRevision: 'revision-current' } });
    expect(new URL(page.url()).searchParams.get('segment')).toBe('2');
    expect(new URL(page.url()).searchParams.get('t')).toBe('10');
    expect(new URL(page.url()).searchParams.get('revision')).toBe('revision-current');
    await readyAudio(page);
    await expect.poll(() => audioTime(page)).toBe(10);
    await page.getByRole('button', { name: /Open matching passage/ }).click();
    expect(JSON.parse(await page.getByLabel('Opened search target').textContent() || '{}')).toEqual({ id: 'recording-one', target: { segmentIndex: 3, transcriptRevision: 'revision-current' } });
    expect(new URL(page.url()).searchParams.has('t')).toBe(false);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    expect(fixture.unexpected).toEqual([]);
});

test('semantic searches send filter objects, reset pagination for a new scope and hide previous-account results', async ({ page }) => {
    let hold = false, release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const fixture = await mockTranscript(page, { query: '?view=hook', respond: async (input, owner) => {
        if (hold) await held;
        return { success: true, results: [{ id: 'matched', contactName: `${owner}:${input.contactId}:${input.page}` }], mode: 'vector', hasMore: true };
    } });
    await page.getByLabel('Meaning search', { exact: true }).fill('a signed delivery receipt');
    await page.getByRole('button', { name: 'Run meaning search', exact: true }).click();
    await expect(page.getByLabel('Search results', { exact: true })).toHaveText('owner-a:507f1f77bcf86cd799439011:1');
    expect(fixture.searches[0]).toEqual({ query: 'a signed delivery receipt', page: 1, pageSize: 5,
        contactId: '507f1f77bcf86cd799439011', startDate: '2026-01-01', endDate: '2026-03-31', owner: 'owner-a' });
    await page.getByRole('button', { name: 'Next search page', exact: true }).click();
    await expect(page.getByLabel('Search page', { exact: true })).toHaveText('2');
    await expect(page.getByLabel('Search results', { exact: true })).toHaveText('owner-a:507f1f77bcf86cd799439011:2');
    hold = true;
    await page.getByRole('button', { name: 'Change search filters', exact: true }).click();
    await expect(page.getByLabel('Search page', { exact: true })).toHaveText('1');
    await expect(page.getByLabel('Search results', { exact: true })).toHaveText('loading');
    await expect.poll(() => fixture.searches.length).toBe(3);
    expect(fixture.searches[2]).toEqual({ query: 'a signed delivery receipt', page: 1, pageSize: 5,
        contactId: '507f1f77bcf86cd799439022', startDate: '2026-04-01', endDate: '2026-06-30', owner: 'owner-a' });
    await page.evaluate(() => (window as unknown as { switchTranscriptOwner: () => void }).switchTranscriptOwner());
    release();
    await expect(page.getByLabel('Search results', { exact: true })).toHaveText('loading');
    await expect(page.getByLabel('Meaning search', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Submitted search', { exact: true })).toHaveText('');
    expect(fixture.unexpected).toEqual([]);
});
