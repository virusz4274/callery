import { expect, test } from '@playwright/test';
import { mockRecordings, recording } from './fixtures/recordings';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });

for (const theme of ['light', 'dark']) {
    for (const width of [375, 768, 1280]) {
        test(`HeroUI public pages fit ${width}px in ${theme}`, async ({ page }, testInfo) => {
            test.skip(process.env.NEXT_PUBLIC_ENABLE_BILLING !== 'true', 'Managed public pages require billing.');
            await page.setViewportSize({ width, height: 900 });
            await page.addInitScript(value => localStorage.setItem('theme', value), theme);
            const unexpected = await mockRecordings(page, { url: '/support', open: false });
            for (const route of ['/support', '/changelog', '/privacy-policy', '/terms-of-service', '/pricing']) {
                await page.goto(route);
                await expect(page.locator('main h1')).toBeVisible();
                await expect(page.locator('main [data-slot="card"]').first()).toBeVisible();
                await expect(page.locator('main a button')).toHaveCount(0);
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
                expect(await page.locator('main').evaluate(main => [...main.querySelectorAll('*')].some(element => getComputedStyle(element).backgroundImage.includes('radial-gradient')))).toBe(false);
            }
            await page.goto('/support');
            const email = page.getByRole('textbox', { name: /^Email/ });
            await expect(email).toHaveAttribute('data-slot', 'input');
            await email.fill('reader@example.com');
            await page.screenshot({ path: testInfo.outputPath(`support-${theme}-${width}.png`), fullPage: true });
            expect(unexpected).toEqual([]);
        });

        test(`HeroUI file navigation at ${width}px in ${theme}`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height: 900 });
            await page.addInitScript(value => localStorage.setItem('theme', value), theme);
            const unexpected = await mockRecordings(page, { url: '/files', open: false });
            const archive = page.getByRole('button', { name: 'Open Archive', exact: true });
            await expect(archive).toHaveAttribute('data-slot', 'button');
            await archive.focus();
            await page.keyboard.press('Enter');
            await expect(page.getByRole('button', { name: 'Open 2026', exact: true })).toBeVisible();
            if (width < 768) {
                await page.getByRole('button', { name: 'Folder path', exact: true }).click();
                await expect(page.getByRole('list', { name: 'Folder breadcrumbs', exact: true })).toBeVisible();
            } else await expect(page.getByRole('grid', { name: 'Files', exact: true })).toHaveAttribute('data-slot', 'table-content');
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await page.screenshot({ path: testInfo.outputPath(`files-${theme}-${width}.png`), fullPage: true });
            expect(unexpected).toEqual([]);
        });
    }
}

test('HeroUI table selection, sorting, and disclosures retain their behavior', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const unexpected = await mockRecordings(page, { open: false, recordings: [recording, { ...recording, id: 'second', contactName: 'Second caller' }] });
    const table = page.getByRole('grid', { name: 'Recordings', exact: true });
    await expect(table).toHaveAttribute('data-slot', 'table-content');
    await page.locator('[data-slot="checkbox"]').filter({ has: page.getByRole('checkbox', { name: 'Select all', exact: true }) }).locator('[data-slot="checkbox-content"]').click();
    await expect(page.getByRole('checkbox', { name: /^Select Dialog Fixture/ })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /^Select Second caller/ })).toBeChecked();
    await page.getByRole('checkbox', { name: /^Select Second caller/ }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('checkbox', { name: /^Select Second caller/ })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: /^Select Dialog Fixture/ })).toBeChecked();
    await page.getByRole('button', { name: /Sort order/ }).click();
    await page.getByRole('option', { name: 'Oldest first', exact: true }).click();
    await expect(page).toHaveURL(/order=asc/);
    await page.screenshot({ path: testInfo.outputPath('recordings-heroui.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: recording.contactName!, exact: true }).click();
    await page.getByRole('button', { name: 'Original filename', exact: true }).click();
    await expect(page.getByText(recording.fileName, { exact: true }).filter({ visible: true })).toBeVisible();
    expect(unexpected).toEqual([]);
});
