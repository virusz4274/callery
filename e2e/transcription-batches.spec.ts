import { expect, test, type Page } from '@playwright/test';
import { mockRecordings } from './fixtures/recordings';
import type { BatchResponse, TranscriptionWorkspace, WaitingRecording } from '../src/lib/transcription/batch-types';

test.use({ serviceWorkers: 'block', timezoneId: 'America/Los_Angeles' });
test.setTimeout(60_000);

function waitingRecording(id: string, dateKey: string | null, duration = 60): WaitingRecording {
    return {
        id, fileName: dateKey ? `Call caller_${dateKey.replaceAll('-', '')}_003000.wav` : 'voice-note.wav',
        displayName: `Recording ${id}`, duration, recordedAt: dateKey ? `${dateKey}T00:30:00Z` : '2026-10-18T01:00:00Z',
        dateKey, importId: 'import-fixture',
    };
}

async function mockBatchWorkspace(page: Page) {
    const unexpected = await mockRecordings(page, { url: '/upload', open: false });
    const state: TranscriptionWorkspace = {
        waiting: [waitingRecording('new-first', '2026-10-17', 90), { ...waitingRecording('new-second', '2026-10-17', 30), fileName: 'Call second_20261017_003100.wav' }, waitingRecording('older', '2026-10-16'), waitingRecording('unknown', null)],
        batches: [],
        providers: [{ id: 'gemini', name: 'Gemini', description: 'Fixture provider', multiplier: 1 }],
        waitingTotal: 4, batchesTotal: 0, waitingNextCursor: null, batchesNextCursor: null,
    };
    const writes: Array<{ id?: string; action?: string; recordingIds?: string[]; acknowledgeProviderOutcome?: boolean }> = [];
    let importsCreated = 0;
    await page.route('**/api/transcription/**', async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path === '/api/transcription/workspace' && request.method() === 'GET') {
            state.waitingTotal = state.waiting.length;
            state.batchesTotal = state.batches.length;
            return route.fulfill({ json: structuredClone(state) });
        }
        if (path === '/api/transcription/imports') {
            importsCreated++;
            return route.fulfill({ json: { importId: 'import-fixture' } });
        }
        const body = request.postDataJSON();
        if (path === '/api/transcription/batches' && request.method() === 'POST') {
            writes.push(body);
            const items = state.waiting.filter(recording => body.recordingIds.includes(recording.id));
            const batch: BatchResponse = {
                id: `batch-${state.batches.length + 1}`, name: body.name || 'Saved calls', dateKey: items[0]?.dateKey || null,
                provider: 'gemini', model: 'fixture-model', status: 'draft', recordingIds: body.recordingIds,
                recordings: items.map(recording => ({ ...recording, status: 'pending' })),
                totalDuration: items.reduce((sum, recording) => sum + recording.duration, 0), completedCount: 0, failedCount: 0,
                createdAt: '2026-10-18T00:00:00Z', updatedAt: '2026-10-18T00:00:00Z',
            };
            state.waiting = state.waiting.filter(recording => !body.recordingIds.includes(recording.id));
            state.batches.unshift(batch);
            return route.fulfill({ json: { batch } });
        }
        const id = path.split('/').at(-1);
        const batch = state.batches.find(item => item.id === id);
        if (!batch) return route.fulfill({ status: 404, json: { error: 'Batch unavailable' } });
        writes.push({ id, ...body });
        if (body.action === 'edit') {
            const candidates = [...batch.recordings, ...state.waiting];
            const next = candidates.filter(recording => body.recordingIds.includes(recording.id));
            state.waiting = [...state.waiting.filter(recording => !body.recordingIds.includes(recording.id)), ...batch.recordings.filter(recording => !body.recordingIds.includes(recording.id))];
            batch.recordingIds = body.recordingIds;
            batch.recordings = next.map(recording => ({ ...recording, status: 'pending' }));
            batch.totalDuration = next.reduce((sum, recording) => sum + recording.duration, 0);
            batch.name = body.name || batch.name;
        } else if (body.action === 'remove') {
            state.waiting.push(...batch.recordings);
            state.batches = state.batches.filter(item => item.id !== id);
            return route.fulfill({ json: { success: true } });
        } else if (body.action === 'start' || body.action === 'resume' || body.action === 'retry') {
            batch.status = 'running';
            batch.error = undefined;
        } else if (body.action === 'pause') {
            batch.status = 'paused';
        }
        return route.fulfill({ json: { batch } });
    });
    await page.goto('/transcription');
    await expect(page.getByRole('heading', { name: 'Transcription', exact: true })).toBeVisible();
    await expect(page.getByText('Recording new-first', { exact: true })).toBeVisible();
    return { state, writes, unexpected, importsCreated: () => importsCreated };
}

for (const width of [1280, 390]) {
    test(`save, reopen, edit, run and pause a date batch at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        const fixture = await mockBatchWorkspace(page);
        const dateHeadings = page.locator('main').getByRole('heading', { level: 2 });
        await expect(dateHeadings).toHaveText(['October 17, 2026', 'October 16, 2026', 'Recording date unavailable']);
        expect(fixture.writes).toEqual([]);

        await page.getByRole('checkbox', { name: 'Select October 17, 2026', exact: true }).press('Space');
        await expect(page.getByText('2 selected · 2m 0s', { exact: true })).toBeVisible();
        await expect(page.getByRole('checkbox', { name: 'Select October 16, 2026', exact: true })).toBeDisabled();
        await page.getByRole('textbox', { name: 'Batch name (optional)' }).fill('October calls');
        await page.getByRole('button', { name: 'Save batch', exact: true }).click();
        await expect(page.getByText('Saved for later', { exact: true })).toBeVisible();
        expect(fixture.writes).toHaveLength(1);
        expect(fixture.state.batches[0].status).toBe('draft');
        await page.reload();
        await page.getByRole('tab', { name: /Saved batches/ }).click();
        // The saved server-side fixture persists while the browser is reloaded.
        await expect(page.getByRole('heading', { name: 'October calls', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Edit batch', exact: true }).click();
        await page.getByRole('checkbox', { name: 'Select Call second_20261017_003100.wav', exact: true }).press('Space');
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(page.getByText('1 recording · 1m 30s · Gemini · fixture-model', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Start batch', exact: true }).click();
        await expect(page.getByText('Running', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Pause batch', exact: true }).click();
        await expect(page.getByText('Paused', { exact: true })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`transcription-batch-${width}.png`) });
        await page.reload();
        await page.getByRole('tab', { name: /Saved batches/ }).click();
        await expect(page.getByText('Paused', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Resume batch', exact: true }).click();
        await expect(page.getByText('Running', { exact: true })).toBeVisible();
        fixture.state.batches[0].status = 'completed';
        fixture.state.batches[0].completedCount = 1;
        fixture.state.batches[0].recordings[0].status = 'completed';
        fixture.state.batches[0].recordings[0].jobState = 'completed';
        await page.reload();
        await page.getByRole('tab', { name: /History/ }).click();
        await expect(page.getByText('1 of 1 completed', { exact: true })).toBeVisible();
        await page.getByRole('tab', { name: /Waiting recordings/ }).click();
        await expect(page.getByText('Recording new-second', { exact: true })).toBeVisible();
        await expect(page.getByText('Recording older', { exact: true })).toBeVisible();
        expect(fixture.writes.filter(write => write.action === 'start')).toHaveLength(1);
        expect(fixture.unexpected).toEqual([]);
        await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate(element => element.clientWidth));
        await page.screenshot({ path: testInfo.outputPath(`transcription-${width}.png`) });
    });
}

test('removing an unstarted batch returns its recordings to Waiting', async ({ page }) => {
    const fixture = await mockBatchWorkspace(page);
    await page.getByRole('checkbox', { name: 'Select October 17, 2026', exact: true }).press('Space');
    await page.getByRole('button', { name: 'Save batch', exact: true }).click();
    await page.getByRole('button', { name: 'Remove batch Saved calls', exact: true }).click();
    await page.getByRole('tab', { name: /Waiting recordings/ }).click();
    await expect(page.getByText('Recording new-first', { exact: true })).toBeVisible();
    await expect(page.getByText('Recording new-second', { exact: true })).toBeVisible();
    expect(fixture.state.batches).toEqual([]);
    expect(fixture.writes.some(write => write.action === 'start')).toBe(false);
    expect(fixture.unexpected).toEqual([]);
});

test('uncertain provider work needs explicit review before retrying', async ({ page }) => {
    const fixture = await mockBatchWorkspace(page);
    await page.getByRole('checkbox', { name: 'Select October 17, 2026', exact: true }).press('Space');
    await page.getByRole('button', { name: 'Save batch', exact: true }).click();
    const batch = fixture.state.batches[0];
    batch.status = 'needs_review';
    batch.failedCount = 1;
    batch.error = 'Provider submission outcome is uncertain.';
    batch.recordings[0].jobState = 'needs_review';
    batch.recordings[0].error = batch.error;
    await page.reload();
    await page.getByRole('tab', { name: /Saved batches/ }).click();
    const retry = page.getByRole('button', { name: 'Retry unfinished recordings', exact: true });
    await expect(retry).toBeDisabled();
    await page.getByRole('button', { name: 'View recordings', exact: true }).click();
    await expect(page.getByText('Provider submission outcome is uncertain.', { exact: true })).toHaveCount(2);
    await page.getByRole('checkbox', { name: 'I checked the provider outcome; retrying may incur another charge.', exact: true }).press('Space');
    await retry.click();
    await expect(page.getByText('Running', { exact: true })).toBeVisible();
    expect(fixture.writes.at(-1)).toEqual({ id: batch.id, action: 'retry', recordingIds: [batch.recordings[0].id], acknowledgeProviderOutcome: true });
    expect(fixture.unexpected).toEqual([]);
});

test('dedicated bulk import creates the durable hold before upload initialization', async ({ page }) => {
    const fixture = await mockBatchWorkspace(page);
    const initializations: Array<{ fileName: string; bulkImportId?: string }> = [];
    await page.route('**/api/uploads', async route => {
        if (route.request().method() === 'POST') {
            const input = route.request().postDataJSON();
            initializations.push(input);
            expect(fixture.importsCreated()).toBe(1);
        }
        return route.fallback();
    });
    await page.getByRole('button', { name: 'Bulk import', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Bulk import recordings', exact: true })).toBeVisible();
    await expect(page.getByRole('note')).toContainText('No AI processing starts until you start a batch');
    await page.getByLabel('Audio files', { exact: true }).setInputFiles({ name: 'Call caller_20261017_003000.wav', mimeType: 'audio/wav', buffer: Buffer.from('mock audio') });
    await page.getByRole('button', { name: 'Upload All', exact: true }).click();
    await expect(page.getByText('Files uploaded successfully', { exact: true })).toBeVisible();
    expect(initializations).toHaveLength(1);
    expect(initializations[0].bulkImportId).toBe('import-fixture');
    expect(fixture.writes).toEqual([]);
    await page.getByRole('link', { name: 'Review waiting recordings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Transcription', exact: true })).toBeVisible();
    expect(fixture.unexpected).toEqual([]);
});
