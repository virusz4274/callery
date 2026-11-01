import { expect, test } from '@playwright/test';
import { mockAdmin } from './fixtures/admin';

test.use({ serviceWorkers: 'block' });
test.setTimeout(120_000);

for (const width of [390, 1280]) {
    test(`lifetime billing recovery preserves ownership and explains continuing charges at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        const fixture = await mockAdmin(page, '/admin/billing-fixture?lifetime');
        await expect(page.getByText('Your lifetime access is permanent.', { exact: false })).toBeVisible();
        await expect(page.getByText('Usage billing setup needs attention', { exact: true })).toBeVisible();
        await expect(page.getByText(/Your existing recordings remain readable and exportable/)).toBeVisible();
        await expect(page.getByText(/Resuming usage billing authorizes ongoing storage and transcription charges/)).toBeVisible();
        await expect(page.getByRole('switch', { name: 'Allow pay per usage' })).toHaveCount(0);
        await page.getByRole('button', { name: 'Resume usage billing', exact: true }).click();
        await expect(page.getByText('Update your payment method before resuming usage billing.', { exact: true })).toBeVisible();
        expect(fixture.calls.filter(call => call.name === 'resumeLifetimeUsage')).toHaveLength(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`lifetime-recovery-${width}.png`), fullPage: true });
        await page.getByRole('button', { name: 'Update payment method', exact: true }).click();
        await expect(page).toHaveURL(/usage=ready/);
        await expect(page.getByText('Usage billing setup needs attention', { exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Resume usage billing', exact: true })).toHaveCount(0);
        expect(fixture.calls.filter(call => call.name === 'openBillingPortal')).toHaveLength(1);
        expect(fixture.unexpected).toEqual([]);
    });
}
