import { expect, test } from '@playwright/test';
import type { ExportJobResponse } from '../src/lib/db/types';
import { mockAdmin } from './fixtures/admin';
import { adminUsers } from './fixtures/admin-data';

test.use({ serviceWorkers: 'block' });
test.setTimeout(120_000);

function failedJob(overrides: Partial<ExportJobResponse> = {}): ExportJobResponse {
    return { id: '507f1f77bcf86cd799439011', status: 'failed', progress: 43, parts: [],
        error: 'The archive could not be uploaded to storage.', createdAt: '2026-11-02T08:04:59.000Z', retryAvailable: true, ...overrides };
}

test('a refused personal retry stays failed and refreshes the server explanation', async ({ page }) => {
    let job = failedJob();
    const reason = 'Recordings changed after this export was created. Request a new export when the next fresh export window opens.';
    const fixture = await mockAdmin(page, '/admin/export-personal-fixture', name => {
        if (name === 'getExportStatus') return job;
        if (name === 'retryExport') {
            job = { ...job, retryAvailable: false, retryUnavailableReason: reason };
            return { success: false, message: reason };
        }
        return { success: true };
    });
    await page.getByRole('button', { name: 'Retry export', exact: true }).click();
    await expect(page.getByText(reason, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry export', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Queued for export', exact: true })).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveText('The archive could not be uploaded to storage.');
    expect(fixture.calls.filter(call => call.name === 'retryExport')).toHaveLength(1);
    expect(fixture.calls.filter(call => call.name === 'startExport')).toHaveLength(0);
    expect(fixture.unexpected).toEqual([]);
});

test('a refused employee retry immediately refreshes its eligibility', async ({ page }) => {
    let job = failedJob();
    const reason = 'Recordings changed after this export was created. Request a new export when the next fresh export window opens.';
    const fixture = await mockAdmin(page, `/admin/recordings?team=1&employeeId=${adminUsers[2].id}`, name => {
        if (name === 'getAvailableProviders') return [];
        if (name === 'getExportStatus') return job;
        if (name === 'retryExport') {
            job = { ...job, retryAvailable: false, retryUnavailableReason: reason };
            return { success: false, message: reason };
        }
        return { success: true };
    });
    await page.getByRole('button', { name: 'Retry export', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry export', exact: true })).toHaveCount(0, { timeout: 2000 });
    await expect(page.getByText(reason, { exact: true }).first()).toBeVisible();
    expect(fixture.calls.find(call => call.name === 'retryExport')?.args).toEqual([job.id, adminUsers[2].id]);
    expect(fixture.calls.filter(call => call.name === 'startExport')).toHaveLength(0);
    expect(fixture.unexpected).toEqual([]);
});

for (const width of [390, 1280]) {
    test(`personal export retry preserves identity and resumes polling to completion at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        let job = failedJob();
        let release!: () => void;
        const hold = new Promise<void>(resolve => { release = resolve; });
        const fixture = await mockAdmin(page, '/admin/export-personal-fixture', async name => {
            if (name === 'getExportStatus') return job;
            if (name === 'retryExport') {
                await hold;
                job = { ...job, status: 'processing', progress: 62, retryAvailable: false, error: undefined };
                return { success: true, jobId: job.id };
            }
            return { success: true };
        });
        await expect(page.getByRole('alert')).toHaveText('The archive could not be uploaded to storage.');
        await page.getByRole('button', { name: 'Retry export', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Retry export', exact: true })).toBeDisabled();
        await expect.poll(() => fixture.calls.filter(call => call.name === 'retryExport').length).toBe(1);
        release();
        await expect(page.getByRole('button', { name: 'Export running', exact: true })).toBeDisabled();
        await expect(page.getByText('62% processed', { exact: true })).toBeVisible();
        job = { ...job, status: 'completed', progress: 100, parts: [{ url: '/__export-fixture-package', expiresAt: '2026-11-09T08:04:59.000Z' }] };
        await expect(page.getByRole('link', { name: 'Download part 1', exact: true })).toHaveAttribute('href', '/__export-fixture-package');
        expect(fixture.calls.find(call => call.name === 'retryExport')?.args).toEqual([job.id]);
        expect(fixture.calls.filter(call => call.name === 'startExport')).toHaveLength(0);
        expect(fixture.unexpected).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test(`exhausted personal export explains why retry is unavailable at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const reason = 'This export has used its single retry. Request a new export when the next fresh export window opens.';
        const fixture = await mockAdmin(page, '/admin/export-personal-fixture', name => name === 'getExportStatus'
            ? failedJob({ retryAvailable: false, retryUnavailableReason: reason }) : { success: true });
        await expect(page.getByText(reason, { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Retry export', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Start export', exact: true })).toBeEnabled();
        expect(fixture.calls.filter(call => call.name === 'retryExport')).toHaveLength(0);
        expect(fixture.unexpected).toEqual([]);
    });

    test(`administrator retries the selected former employee archive at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        let job = failedJob();
        const fixture = await mockAdmin(page, `/admin/recordings?team=1&employeeId=${adminUsers[2].id}`, name => {
            if (name === 'getAvailableProviders') return [];
            if (name === 'getExportStatus') return job;
            if (name === 'retryExport') { job = { ...job, status: 'pending', retryAvailable: false, error: undefined }; return { success: true, jobId: job.id }; }
            return { success: true };
        });
        await expect(page.getByText(/User 02 \(access removed\)/).first()).toBeVisible();
        await page.getByRole('button', { name: 'Retry export', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Queued for export', exact: true })).toBeDisabled();
        expect(fixture.calls.find(call => call.name === 'retryExport')?.args).toEqual([job.id, adminUsers[2].id]);
        expect(fixture.calls.filter(call => call.name === 'startExport')).toHaveLength(0);
        expect(fixture.unexpected).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
}
