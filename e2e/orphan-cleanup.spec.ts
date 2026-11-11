import { expect, test } from '@playwright/test';
import { mockAdmin } from './fixtures/admin';

test.use({ serviceWorkers: 'block' });
test.setTimeout(120_000);
const health = { checkedAt: Date.now(), services: [], incidents: { openCount: 0, recent: [] } };

for (const width of [375, 1280]) {
    test(`partial orphan cleanup retains an accurate retry count at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        let attempts = 0;
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const fixture = await mockAdmin(page, '/admin', async name => {
            if (name !== 'cleanupOrphanedRecordings') return health;
            attempts++;
            if (attempts === 1) {
                await gate;
                return { found: 2, deletedDb: 1, deletedR2: 1, failedCount: 1, remaining: 1 };
            }
            return { found: 1, deletedDb: 1, deletedR2: 1, failedCount: 0, remaining: 0 };
        });
        await page.getByRole('button', { name: 'Clean up now', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Clean up orphaned recordings?' });
        await dialog.getByRole('button', { name: 'Clean up recordings', exact: true }).click();
        await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
        await page.keyboard.press('Enter');
        expect(fixture.calls.filter(call => call.name === 'cleanupOrphanedRecordings')).toHaveLength(1);
        release();
        await expect(dialog).toHaveCount(0);
        await expect(page.getByText('Cleanup partially complete', { exact: true })).toBeVisible();
        await expect(page.getByRole('status').filter({ hasText: '1 recording cleaned; 1 retained for retry.' })).toBeVisible();
        await expect(page.getByText('Found 1 orphaned recording with no associated user.', { exact: true })).toBeVisible();

        await page.getByRole('button', { name: 'Clean up now', exact: true }).click();
        await expect(dialog).toContainText('Permanently delete 1 recordings');
        await dialog.getByRole('button', { name: 'Clean up recordings', exact: true }).click();
        await expect(page.getByText('Cleanup complete', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Clean up now', exact: true })).toHaveCount(0);
        expect(fixture.calls.filter(call => call.name === 'cleanupOrphanedRecordings')).toHaveLength(2);
        expect(fixture.unexpected).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test(`failed orphan cleanup remains available for retry at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        let fail = true;
        await mockAdmin(page, '/admin', name => name !== 'cleanupOrphanedRecordings' ? health : fail
            ? { found: 2, deletedDb: 0, deletedR2: 0, failedCount: 2, remaining: 2 }
            : { found: 2, deletedDb: 2, deletedR2: 2, failedCount: 0, remaining: 0 });
        await page.getByRole('button', { name: 'Clean up now', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Clean up orphaned recordings?' });
        await dialog.getByRole('button', { name: 'Clean up recordings', exact: true }).click();
        await expect(page.getByText('Cleanup failed', { exact: true })).toBeVisible();
        await expect(page.getByText('Cleanup complete', { exact: true })).toHaveCount(0);
        await expect(page.getByRole('status').filter({ hasText: '0 recordings cleaned; 2 retained for retry.' })).toBeVisible();
        await expect(page.getByText('Found 2 orphaned recordings with no associated user.', { exact: true })).toBeVisible();
        fail = false;
        await page.getByRole('button', { name: 'Clean up now', exact: true }).click();
        await dialog.getByRole('button', { name: 'Clean up recordings', exact: true }).click();
        await expect(page.getByText('Cleanup complete', { exact: true })).toBeVisible();
        await expect(page.getByRole('status').filter({ hasText: '2 recordings cleaned.' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Clean up now', exact: true })).toHaveCount(0);
    });
}
