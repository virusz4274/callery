import { expect, test } from '@playwright/test';
import { mockRecordings, recording } from './fixtures/recordings';
test.use({ serviceWorkers: 'block' });

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    test(`manual transcription choices render and dismiss at ${viewport.width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        const pressWarnings: string[] = [];
        page.on('console', message => {
            if (message.text().includes('PressResponder')) pressWarnings.push(message.text());
        });
        const transcriptionRequests = await mockRecordings(page);
        const transcribe = page.getByRole('button', { name: 'Transcribe', exact: true });
        await page.locator('audio').evaluate(element => { element.dataset.identity = 'provider-retained'; });
        await transcribe.click();
        const picker = page.getByRole('dialog', { name: 'Choose transcription model', exact: true });
        await expect(picker).toBeVisible();
        await expect(picker.getByRole('button', { name: /^Use / })).toHaveCount(4);
        await expect(picker.getByText('Gemini', { exact: true }).locator('..').getByText('Default')).toBeVisible();
        const compatible = picker.getByRole('button', { name: 'Use Local or compatible server', exact: true });
        await compatible.scrollIntoViewIfNeeded();
        await expect(compatible).toBeInViewport();
        const cancel = picker.getByRole('button', { name: 'Cancel', exact: true });
        await expect(cancel).toBeInViewport();
        await page.screenshot({ path: testInfo.outputPath('provider-picker.png') });
        await cancel.click();
        await expect(picker).toHaveCount(0);
        expect(await page.locator('audio').getAttribute('data-identity')).toBe('provider-retained');
        if (viewport.width >= 768) await expect(transcribe).toBeFocused();

        await transcribe.click();
        await expect(picker).toBeVisible();
        await page.keyboard.press('Tab');
        await expect(picker).toContainText('Choose transcription model');
        await expect.poll(() => picker.evaluate(element => element.contains(document.activeElement))).toBe(true);
        await page.keyboard.press('Escape');
        await expect(picker).toHaveCount(0);
        if (viewport.width >= 768) await expect(transcribe).toBeFocused();
        const recordingTitle = recording.contactName!;
        await expect(page.getByRole('dialog', { name: recordingTitle })).toBeVisible();
        await page.getByRole('dialog', { name: recordingTitle }).getByRole('button', { name: viewport.width < 768 ? 'Back to list' : 'Close', exact: true }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        if (viewport.width < 768) {
            const more = page.getByRole('button', { name: 'More', exact: true });
            await more.click();
            const tools = page.getByRole('dialog', { name: 'More tools', exact: true });
            await expect(tools.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(tools).toHaveCount(0);
            await expect(more).toBeFocused();
        }
        expect(pressWarnings).toEqual([]);
        expect(transcriptionRequests).toEqual([]);
    });
}

for (const result of ['complete', 'fail'] as const) {
    test(`mobile transcription preserves provider choice and handles ${result}`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const unexpected = await mockRecordings(page, { transcription: result });
        const requests: string[] = [];
        page.on('request', request => { if (request.method() === 'POST') requests.push(request.postData() || ''); });
        await page.getByRole('button', { name: 'Transcribe', exact: true }).click();
        await page.getByRole('button', { name: 'Use Gemini', exact: true }).click();
        await expect(page.getByRole('dialog', { name: recording.contactName!, exact: true })).toBeVisible();
        if (result === 'complete') {
            await expect(page.getByText('Generating transcript…', { exact: true })).toBeVisible();
            await expect(page.getByText('Mocked transcription completed.', { exact: true })).toBeVisible({ timeout: 12000 });
            await expect(page.getByRole('button', { name: 'Transcribe again', exact: true })).toBeEnabled();
        } else {
            await expect(page.locator('[data-slot="alert-description"]').filter({ hasText: 'Fixture transcription failed. Try again.' })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Transcribe', exact: true })).toBeEnabled();
        }
        expect(requests.some(body => body.includes('"provider":"gemini"'))).toBe(true);
        expect(unexpected).toEqual([]);
    });
}
