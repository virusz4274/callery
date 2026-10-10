import { expect as baseExpect, test } from '@playwright/test';
import { mockRecordings, profile } from './fixtures/recordings';
import { publicSitePolicy } from '../src/lib/public-site-policy';

const expect = baseExpect.configure({ timeout: 15_000 });
test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });

for (const theme of ['light', 'dark']) for (const [width, height] of [[320, 720], [390, 844], [667, 375]]) {
    test(`More tools fits ${width}x${height} in ${theme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height });
        await page.addInitScript(value => localStorage.setItem('theme', value), theme);
        const admin = width === 667;
        const unexpected = await mockRecordings(page, { open: false, profile: { ...profile, role: admin ? 'admin' : 'user' } });
        const more = page.getByRole('button', { name: 'More', exact: true, includeHidden: true });
        await expect(more).toHaveAttribute('aria-haspopup', 'dialog');
        await more.focus();
        await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog', { name: 'More tools', exact: true });
        await expect(dialog).toBeVisible();
        await expect(page.locator('[data-slot="modal-container"]')).not.toHaveAttribute('data-entering', 'true');
        await expect(more).toHaveAttribute('aria-expanded', 'true');
        await expect(dialog.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('href', '/settings');
        await expect(dialog.getByRole('link', { name: 'Help & support', exact: true })).toHaveAttribute('href', publicSitePolicy().supportHref);
        await expect(dialog.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(admin ? 1 : 0);
        const controls = dialog.getByRole('link').or(dialog.getByRole('button'));
        for (const control of await controls.all()) {
            const rect = await control.boundingBox();
            expect(rect!.height).toBeGreaterThanOrEqual(44);
            expect(rect!.width).toBeGreaterThanOrEqual(44);
        }
        const layout = await dialog.evaluate(element => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, overflow: element.scrollWidth > element.clientWidth };
        });
        expect(layout.left).toBeGreaterThanOrEqual(12);
        expect(layout.right).toBeLessThanOrEqual(width - 12);
        expect(layout.top).toBeGreaterThanOrEqual(12);
        expect(layout.bottom).toBeLessThanOrEqual(height - 12);
        expect(layout.overflow).toBe(false);
        await page.screenshot({ path: testInfo.outputPath(`more-${theme}-${width}.png`), animations: 'disabled' });
        for (let i = 0; i < await controls.count() + 2; i++) {
            await page.keyboard.press('Tab');
            expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
        }
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(more).toBeFocused();
        await expect(more).toHaveAttribute('aria-expanded', 'false');
        await more.click();
        await dialog.getByRole('button', { name: 'Close more tools', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        await expect(more).toBeFocused();
        await more.click();
        await page.mouse.click(4, 4);
        await expect(dialog).toHaveCount(0);
        await expect(more).toBeFocused();
        expect(unexpected).toEqual([]);
    });
}

test('More tools opens destinations and marks the current settings page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const unexpected = await mockRecordings(page, { open: false });
    let documentNavigations = 0;
    page.on('request', request => { if (request.isNavigationRequest() && request.resourceType() === 'document') documentNavigations++; });
    const more = page.getByRole('button', { name: 'More', exact: true });
    const dialog = page.getByRole('dialog', { name: 'More tools', exact: true });
    await more.click();
    await dialog.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { name: 'Settings', level: 1, exact: true })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await more.click();
    await expect(dialog.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(documentNavigations).toBe(0);
    const { marketingEnabled, supportHref } = publicSitePolicy();
    if (!marketingEnabled) {
        await page.route(supportHref, route => route.fulfill({ contentType: 'text/html', body: '<h1>GitHub Issues</h1>' }));
    }
    await dialog.getByRole('link', { name: 'Help & support', exact: true }).click();
    await expect(page).toHaveURL(marketingEnabled ? /\/support$/ : supportHref);
    await expect(page.getByRole('heading', { name: marketingEnabled ? 'Get help keeping your call archive moving.' : 'GitHub Issues', exact: true })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(more).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(unexpected).toEqual([]);
});

test('More tools remains usable with enlarged text and a short viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 375 });
    const unexpected = await mockRecordings(page, { open: false, profile: { ...profile, role: 'admin' } });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await page.getByRole('button', { name: 'More', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'More tools', exact: true });
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole('button', { name: 'Close more tools', exact: true });
    await expect(close).toBeInViewport();
    const admin = dialog.getByRole('link', { name: 'Admin', exact: true });
    await admin.focus();
    await expect(admin).toBeInViewport();
    const overflow = await dialog.evaluate(element => element.scrollWidth > element.clientWidth);
    expect(overflow).toBe(false);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(unexpected).toEqual([]);
});
