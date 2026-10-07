import { expect, test } from '@playwright/test';
import { mockRecordings, profile, recording } from './fixtures/recordings';
import type { ContactResponse, RecordingResponse } from '../src/lib/db/types';

test.use({ serviceWorkers: 'block', timezoneId: 'Asia/Kolkata' });

const contacts: ContactResponse[] = Array.from({ length: 25 }, (_, i) => ({
    id: `contact-${i}`, authSubject: profile.id, googleContactId: `people/${i}`,
    name: `Contact ${String(i).padStart(2, '0')}`, firstName: 'Contact', lastName: String(i),
    phoneNumbers: [`555${String(i).padStart(3, '0')}`], email: null,
    createdAt: profile.createdAt, updatedAt: profile.createdAt, totalRecordings: 1, lastRecordingAt: recording.recordedAt,
}));
const samples: RecordingResponse[] = [
    { ...recording, id: 'first', contactName: 'Alex Morgan — project decisions and follow-up conversation',
        phoneNumber: '555000', duration: 65, transcriptionStatus: 'completed',
        summary: '**Summary:** Discussed **project decisions**, delivery dates, and next steps. '.repeat(15),
        fullTranscript: Array.from({ length: 40 }, (_, i) => ({ speakerId: 'spk:0', start: i, end: i + 1, text: `Segment ${i}: review the next steps and delivery schedule.`, words: [] })),
    },
    { ...recording, id: 'second', contactName: null, phoneNumber: '555111', transcriptionStatus: 'processing', summary: '' },
    { ...recording, id: 'third', contactName: 'Jamie', phoneNumber: '', transcriptionStatus: 'failed', summary: 'Confirm the appointment details.' },
];

for (const width of [375, 390, 768, 1280, 1864]) for (const theme of ['light', 'dark']) {
    test(`clean list and viewer at ${width}px in ${theme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(value => localStorage.setItem('theme', value), theme);
        const unexpected = await mockRecordings(page, { recordings: samples, recording: samples[0], contacts, open: false });
        const caller = page.getByRole('button', { name: samples[0].contactName!, exact: true });
        await expect(caller).toBeVisible();
        await expect(caller).toHaveCount(1);
        for (const status of ['Transcribed', 'Processing', 'Failed', 'Not transcribed']) await expect(page.getByText(status, { exact: true })).toHaveCount(0);
        const previews = page.locator('.recording-preview').filter({ visible: true });
        const longPreview = previews.filter({ hasText: 'Discussed' });
        await expect(previews).toHaveCount(3);
        expect(await longPreview.innerText()).not.toContain('**');
        expect(await longPreview.innerText()).not.toMatch(/^Summary:/);
        await expect.poll(() => longPreview.evaluate(element => ({ clamp: getComputedStyle(element).webkitLineClamp, height: element.getBoundingClientRect().height }))).toEqual({ clamp: '2', height: 40 });
        await expect(page.getByText('555111', { exact: true }).filter({ visible: true })).toHaveCount(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        if (width >= 1024) {
            await expect(page.getByRole('columnheader', { name: 'Conversation', exact: true })).toBeVisible();
            const offsets = await page.locator('table').evaluate(table => {
                const headings = Array.from(table.querySelectorAll('th'));
                const cells = Array.from(table.querySelectorAll('tbody tr:first-child td'));
                return headings.map((heading, i) => Math.abs(heading.getBoundingClientRect().left + parseFloat(getComputedStyle(heading).paddingLeft) - cells[i].getBoundingClientRect().left - parseFloat(getComputedStyle(cells[i]).paddingLeft)));
            });
            expect(offsets.every(offset => offset <= 1)).toBe(true);
            const selectionAlignment = await page.locator('table').evaluate(table => {
                const header = table.querySelector('th')!;
                const firstCell = table.querySelector('tbody tr:first-child td')!;
                const controlCenter = (element: Element) => {
                    const rect = element.querySelector('[data-slot="checkbox-control"]')!.getBoundingClientRect();
                    return rect.left + rect.width / 2;
                };
                return { width: header.getBoundingClientRect().width, offset: Math.abs(controlCenter(header) - controlCenter(firstCell)) };
            });
            expect(selectionAlignment.width).toBeLessThanOrEqual(80);
            expect(selectionAlignment.offset).toBeLessThanOrEqual(1);
        } else await expect(page.getByRole('button', { name: 'Select items', exact: true })).toBeVisible();
        if (width >= 768) {
            await page.getByLabel('Comfortable density', { exact: true }).click();
            await expect.poll(() => longPreview.evaluate(element => getComputedStyle(element).webkitLineClamp)).toBe('3');
        }
        await page.screenshot({ path: testInfo.outputPath('recordings-list.png'), animations: 'disabled' });
        await caller.click();
        const dialog = page.getByRole('dialog', { name: samples[0].contactName!, exact: true });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('heading', { name: samples[0].contactName!, exact: true })).toHaveCount(1);
        const scrollers = await dialog.evaluate(element => Array.from(element.querySelectorAll('*')).filter(node => {
            const style = getComputedStyle(node);
            return ['auto', 'scroll'].includes(style.overflowY) && node.scrollHeight > node.clientHeight + 2;
        }).length);
        expect(scrollers).toBe(1);
        await expect(page.getByTestId('recording-audio')).toBeInViewport();
        await page.screenshot({ path: testInfo.outputPath('recording-viewer.png'), animations: 'disabled' });
        await dialog.getByRole('button', { name: width < 768 ? 'Back to list' : 'Close', exact: true }).click();
        await expect(caller).toBeFocused();
        expect(unexpected).toEqual([]);
    });
}

test('contact picker searches and loads contacts after the first page', async ({ page }) => {
    const unexpected = await mockRecordings(page, { contacts, recordings: samples, open: false });
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Contact 24', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Load more contacts', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Contact 24', exact: true })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search contacts', exact: true }).fill('555024');
    await expect(page.getByRole('button', { name: 'Contact 24', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Contact 00', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Contact 24', exact: true }).click();
    await expect(page).toHaveURL(/contact=contact-24/);
    await page.getByRole('searchbox', { name: 'Search contacts', exact: true }).press('Escape');
    await expect(page.getByRole('button', { name: 'Remove Contact 24 filter', exact: true })).toBeVisible();
    expect(unexpected).toEqual([]);
});

for (const width of [375, 1280]) for (const theme of ['light', 'dark']) {
    test(`summary disclosure and direct playback at ${width}px in ${theme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(value => localStorage.setItem('theme', value), theme);
        const unexpected = await mockRecordings(page, { recordings: samples, recording: samples[0], contacts, open: false });
        const showAlex = () => page.getByRole('button', { name: `Show full summary for ${samples[0].contactName}`, exact: true });
        await showAlex().click();
        const summary = page.getByRole('region', { name: `Full summary for ${samples[0].contactName}`, exact: true });
        await expect(summary).toBeVisible();
        await expect(summary.locator('.recording-preview')).toHaveCount(0);
        await expect(summary.locator('strong').first()).toHaveText('Summary:');
        await summary.click();
        await expect(summary).toBeVisible();
        await page.getByRole('button', { name: 'Show full summary for Jamie', exact: true }).click();
        await expect(summary).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Collapse summary for Jamie', exact: true })).toHaveAttribute('aria-expanded', 'true');
        await page.getByRole('heading', { name: 'Recordings', exact: true }).first().click();
        await expect(page.getByRole('button', { name: 'Show full summary for Jamie', exact: true })).toHaveAttribute('aria-expanded', 'false');
        await showAlex().focus();
        await page.keyboard.press('Enter');
        await expect(summary).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(summary).toHaveCount(0);
        await expect(showAlex()).toBeFocused();
        if (width >= 768) {
            const select = await page.getByRole('button', { name: /Sort order/ }).boundingBox();
            const icon = await page.getByTestId('recording-sort-icon').boundingBox();
            expect(Math.abs(select!.y + select!.height / 2 - icon!.y - icon!.height / 2)).toBeLessThanOrEqual(1);
            expect(icon!.x + icon!.width).toBeLessThan(select!.x + select!.width);
        }
        await page.screenshot({ path: testInfo.outputPath('recordings-with-summary-controls.png'), animations: 'disabled' });
        await page.getByRole('button', { name: `Play audio for ${samples[0].contactName}`, exact: true }).click();
        const audio = page.getByRole('dialog').locator('audio');
        await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).paused)).toBe(false);
        await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
        await page.getByRole('button', { name: width < 768 ? 'Back to list' : 'Close', exact: true }).click();
        // Opening for review should leave playback stopped.
        await page.getByRole('button', { name: samples[0].contactName!, exact: true }).click();
        await expect(audio).toBeVisible();
        expect(await audio.evaluate(element => (element as HTMLAudioElement).paused)).toBe(true);
        expect(unexpected).toEqual([]);
    });
}

test('needs transcription counts and pages cover the library and clearing preserves density', async ({ page }) => {
    const library = Array.from({ length: 24 }, (_, i) => ({ ...recording, id: `recording-${i}`, contactName: `Caller ${i}`, transcriptionStatus: i % 2 ? 'pending' as const : 'completed' as const }));
    const unexpected = await mockRecordings(page, { contacts, recordings: library, url: '/recordings?collection=needs-transcription&limit=5', open: false });
    await expect(page.getByText('Showing 5 of 12 recordings', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Page 2 of 3', { exact: true })).toBeVisible();
    await page.getByLabel('Comfortable density', { exact: true }).click();
    await page.getByRole('button', { name: 'Views', exact: true }).click();
    await page.getByRole('textbox', { name: 'Saved view name', exact: true }).fill('Backlog');
    await page.getByRole('button', { name: 'Save current view', exact: true }).click();
    await page.getByRole('textbox', { name: 'Saved view name', exact: true }).press('Escape');
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(page.getByText('Showing 5 of 24 recordings', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Comfortable density', { exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Views', exact: true }).click();
    await page.getByRole('button', { name: 'Backlog', exact: true }).click();
    await expect(page.getByText('Showing 5 of 12 recordings', { exact: true })).toBeVisible();
    expect(unexpected).toEqual([]);
});

test('AI pages use submitted queries and restore the filtered library', async ({ page }) => {
    const requests: Array<{ query: string; page: number }> = [];
    const unexpected = await mockRecordings(page, { contacts, recordings: samples, open: false, url: '/recordings?q=fixture&sortBy=duration&order=asc&page=2&limit=1',
        semanticSearch: (query, pageNumber) => { requests.push({ query, page: pageNumber }); return { success: true, results: [samples[pageNumber - 1]], totalCount: 200, hasMore: pageNumber === 1, mode: 'fallback', fallbackReason: 'embedding_unavailable' }; },
    });
    await page.getByRole('button', { name: 'AI search', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Filters', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Sort order/ })).toHaveCount(0);
    const search = page.getByRole('searchbox', { name: 'Search recordings with AI search', exact: true });
    await search.fill('delivery');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText('Results for “delivery”', { exact: true })).toBeVisible();
    await search.fill('draft query');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    expect(requests).toEqual([{ query: 'delivery', page: 1 }, { query: 'delivery', page: 2 }]);
    await page.getByRole('button', { name: 'Return to library', exact: true }).click();
    await expect(page).toHaveURL(/q=fixture.*page=2/);
    await expect(page.getByRole('searchbox', { name: 'Filter recordings', exact: true })).toHaveValue('fixture');
    await expect(page.getByRole('button', { name: /Sort order/ })).toContainText('Shortest first');
    expect(unexpected).toEqual([]);
});

test('AI retry and switching mode ignore a late search response', async ({ page }) => {
    let calls = 0;
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const unexpected = await mockRecordings(page, { contacts, open: false,
        semanticSearch: async () => {
            calls++;
            if (calls === 1) return { success: false, results: [], error: 'Fixture search unavailable' };
            await pending;
            return { success: true, results: [samples[0]], hasMore: false, mode: 'vector' };
        },
    });
    await page.getByRole('button', { name: 'AI search', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search recordings with AI search', exact: true }).fill('delivery');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Fixture search unavailable' })).toBeVisible();
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect.poll(() => calls).toBe(2);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    release();
    await expect(page.getByRole('button', { name: recording.contactName!, exact: true })).toBeVisible();
    await expect(page.getByText('Results for “delivery”', { exact: true })).toHaveCount(0);
    expect(unexpected).toEqual([]);
});

test('empty library and filtered zero results offer the appropriate recovery', async ({ page }) => {
    await mockRecordings(page, { contacts, recordings: [], open: false });
    await expect(page.getByRole('heading', { name: 'Your recording library is empty', exact: true }).filter({ visible: true })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Filter recordings', exact: true }).fill('nothing');
    await expect(page.getByRole('heading', { name: 'No matching recordings', exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear filters', exact: true }).filter({ visible: true })).toHaveCount(2);
});

test('200 percent zoom retains usable controls and keyboard navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockRecordings(page, { contacts, recordings: samples, open: false });
    await page.locator('html').evaluate(element => { element.style.zoom = '2'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const caller = page.getByRole('button', { name: samples[0].contactName!, exact: true });
    await caller.focus();
    await caller.press('Enter');
    const dialog = page.getByRole('dialog', { name: samples[0].contactName!, exact: true });
    await expect(dialog).toBeVisible();
    await dialog.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(caller).toBeFocused();
});
