import { expect, test } from '@playwright/test';
import { mockRecordings } from './fixtures/recordings';

test.use({ serviceWorkers: 'block' });
for (const theme of ['light', 'dark']) for (const width of [375, 1280]) {
    test(`integration credentials work at ${width}px in ${theme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(value => localStorage.setItem('theme', value), theme);
        const tokens: Record<string, unknown>[] = [];
        let created: { scopes: string[]; expiresAt?: string | null } | undefined;
        await mockRecordings(page, { open: false, url: '/settings' });
        await page.route('**/api/user/api-tokens**', async route => {
            const request = route.request();
            if (request.method() === 'POST') {
                created = request.postDataJSON();
                const token = { id: 'fixture-token', name: 'CRM test', prefix: 'vst_fixture', scopes: created!.scopes, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 90 * 86400_000).toISOString(), revokedAt: null, lastUsedAt: null };
                tokens.push(token);
                return route.fulfill({ json: { success: true, data: { ...token, secret: 'vst_fixture_secret_shown_once' } } });
            }
            if (request.method() === 'DELETE') {
                tokens[0].revokedAt = new Date().toISOString();
                return route.fulfill({ json: { success: true, data: tokens[0] } });
            }
            return route.fulfill({ json: { success: true, data: tokens } });
        });
        await page.goto('/settings?tab=integrations');
        await expect(page.getByLabel('Token name')).toBeVisible();
        await page.getByLabel('Token name').fill('CRM test');
        await expect(page.getByLabel('Upload recordings', { exact: true })).toBeChecked();
        await expect(page.getByLabel('Read recordings and transcripts', { exact: true })).toBeChecked();
        await expect(page.getByLabel('Request transcription', { exact: true })).not.toBeChecked();
        await page.getByRole('button', { name: 'Create token', exact: true }).click();
        await expect(page.getByText('vst_fixture_secret_shown_once', { exact: true })).toBeVisible();
        expect(created?.scopes).toEqual(['recordings:upload', 'recordings:read']);
        await page.getByRole('button', { name: 'I’ve saved it' }).click();
        await expect(page.getByText('vst_fixture_secret_shown_once', { exact: true })).toHaveCount(0);
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: 'Revoke token', exact: true }).click();
        await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`integrations-${theme}-${width}.png`), animations: 'disabled', fullPage: true });
    });
}
