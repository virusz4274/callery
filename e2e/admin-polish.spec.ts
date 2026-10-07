import { expect, test } from '@playwright/test';
import { mockAdmin } from './fixtures/admin';
import { adminPlans, adminUsers } from './fixtures/admin-data';

const pressWarnings = new WeakMap<object, string[]>();
test.beforeEach(({ page }) => {
    const warnings: string[] = [];
    pressWarnings.set(page, warnings);
    page.on('console', message => { if (message.text().includes('PressResponder')) warnings.push(message.text()); });
});
test.afterEach(({ page }) => {
    expect(pressWarnings.get(page), 'Admin controls should register valid pressable triggers').toEqual([]);
});

test.use({ serviceWorkers: 'block', actionTimeout: 15_000 });
test.setTimeout(120_000);
const sections = [
    ['/admin', 'Admin dashboard'], ['/admin/users', 'User management'], ['/admin/plans', 'Pricing plans'],
    ['/admin/announcements', 'Announcements'], ['/admin/audit', 'Audit logs'], ['/admin/settings', 'System settings'],
] as const;

for (const theme of ['light', 'dark']) for (const width of [375, 768, 1280, 667]) {
    test(`admin sections fit ${width}px in ${theme}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: width === 667 ? 375 : 900 });
        await page.addInitScript(value => localStorage.setItem('theme', value), theme);
        const fixture = await mockAdmin(page);
        for (const [url, title] of sections) {
            await page.goto(url);
            await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
            await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            if (width >= 1280) await expect(page.getByRole('navigation', { name: 'Admin sections' })).toBeVisible();
            else await expect(page.getByRole('button', { name: /Admin section/ })).toBeVisible();
            await page.screenshot({ path: testInfo.outputPath(`${title.replaceAll(' ', '-')}-${theme}-${width}.png`), fullPage: true });
        }
        expect(fixture.unexpected).toEqual([]);
    });
}

test('health loading and failures never fabricate a healthy result and retry retains stale data', async ({ page }) => {
    let release!: () => void;
    let fail = false;
    let first = true;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await mockAdmin(page, '/admin', async name => {
        if (name !== 'checkSystemHealth') return;
        if (first) { first = false; await gate; }
        if (fail) throw new Error('Fixture health outage');
        return { checkedAt: Date.now(), services: [{ name: 'Text AI', status: 'configured', latency: 0, message: 'Configuration present' }], incidents: { openCount: 0, recent: [] } };
    });
    await expect(page.getByText('Checking incidents…')).toBeVisible();
    await expect(page.getByText('No open incidents', { exact: true })).toHaveCount(0);
    release();
    await expect(page.getByText('No open incidents', { exact: true })).toBeVisible();
    await expect(page.getByText('Configuration present')).not.toHaveClass(/text-danger/);
    fail = true;
    await page.getByRole('button', { name: 'Refresh system health' }).click();
    await expect(page.getByText('Could not check system health')).toBeVisible();
    await expect(page.getByText(/Data may be out of date/)).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByText('Could not check system health')).toHaveCount(0);
});

test('Users preserve search, page and reading position through details and tab history', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 700 });
    await mockAdmin(page, '/admin/users?search=User&page=2');
    await expect(page.getByText('24 matches', { exact: true })).toBeVisible();
    const link = page.getByRole('link', { name: `Open ${adminUsers[19].name}`, exact: true });
    await link.scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => window.scrollY);
    await link.click();
    await expect(page.getByRole('heading', { name: adminUsers[19].name, exact: true })).toHaveCount(1);
    await expect(page.getByText('1.25 / 2.50 GB', { exact: true })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Storage usage' })).toHaveAttribute('aria-valuenow', '50');
    await page.getByRole('tab', { name: 'Recordings (0)' }).click();
    await expect(page).toHaveURL(/tab=recordings/);
    await page.goBack();
    await expect(page.getByRole('tab', { name: 'User information' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('link', { name: 'Back to users', exact: true }).click();
    await expect(page).toHaveURL(/search=User&page=2/);
    await expect(page.getByRole('searchbox', { name: 'Search users' })).toHaveValue('User');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(scroll - 2);
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await expect(page.getByRole('searchbox', { name: 'Search users' })).toBeFocused();
    await expect(page.getByText('25 users', { exact: true })).toBeVisible();
});

test('quota editors retain fractions and expose validation before saving', async ({ page }) => {
    const fixture = await mockAdmin(page, '/admin/users');
    await page.getByRole('button', { name: `Actions for ${adminUsers[0].name}` }).click();
    await page.getByRole('menuitem', { name: 'Edit Limits', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit limits' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Storage (GB)', { exact: true })).toHaveValue('2.5');
    await dialog.getByLabel('Storage (GB)', { exact: true }).fill('-1');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByLabel('Storage (GB)', { exact: true })).toBeFocused();
    expect(fixture.calls.filter(call => call.name === 'updateUserLimits')).toHaveLength(0);
    await dialog.getByLabel('Storage (GB)', { exact: true }).fill('2.5');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toHaveCount(0);
    expect(fixture.calls.find(call => call.name === 'updateUserLimits')?.args[1]).toEqual({ storageAllocation: adminUsers[0].storageAllocation, transcriptionAllocation: 600.5 });
});

test('plan deletion requires confirmation and recovers from failure without duplicate writes', async ({ page }) => {
    let fail = true;
    const fixture = await mockAdmin(page, '/admin/plans', name => { if (name === 'deletePlan' && fail) throw new Error('Fixture delete failed'); });
    await expect(page.getByRole('button', { name: `Delete ${adminPlans[0].name}` })).toBeDisabled();
    await page.getByRole('button', { name: `Delete ${adminPlans[1].name}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(fixture.calls).toHaveLength(0);
    await dialog.getByRole('button', { name: 'Delete plan', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Fixture delete failed');
    fail = false;
    await dialog.getByRole('button', { name: 'Delete plan', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(fixture.calls.filter(call => call.name === 'deletePlan')).toHaveLength(2);
});

test('settings retain inactive defaults and report field and save errors locally', async ({ page }) => {
    let fail = true;
    const fixture = await mockAdmin(page, '/admin/settings', name => { if (name === 'updateSystemSettings' && fail) throw new Error('Fixture settings outage'); });
    await expect(page.getByText(/The assigned plan is inactive/)).toBeVisible();
    await expect(page.getByText('Default Plan', { exact: true })).toHaveCount(1);
    await page.getByLabel('Soniox Multiplier').fill('0');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(fixture.calls).toHaveLength(0);
    await page.getByLabel('Soniox Multiplier').fill('1.5');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert')).toContainText('Fixture settings outage');
    fail = false;
    await page.getByRole('button', { name: 'Retry save' }).click();
    await expect(page.getByText('Settings updated', { exact: true })).toBeVisible();
    expect(fixture.calls).toHaveLength(2);
});

test('audit errors are separate from empty results and detail JSON is disclosed', async ({ page }) => {
    await mockAdmin(page, '/admin/audit?fail=1');
    await expect(page.getByText('Count unavailable')).toBeVisible();
    await expect(page.getByText('Could not load audit logs')).toBeVisible();
    await expect(page.getByText(/No audit entries/)).toHaveCount(0);
    await page.goto('/admin/audit');
    await page.getByRole('button', { name: /Details for USER_ROLE_UPDATE/ }).filter({ visible: true }).click();
    await expect(page.locator('pre').filter({ visible: true })).toContainText('"role": "admin"');
});

test('announcement schedules, required fields and date controls remain usable in a short viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 600 });
    const fixture = await mockAdmin(page, '/admin/announcements');
    for (const state of ['Visible', 'Scheduled', 'Expired', 'Inactive']) await expect(page.getByText(state, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Create announcement', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Create announcement' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Create announcement', exact: true }).click();
    await expect(dialog.getByLabel('Title', { exact: true })).toBeFocused();
    expect(fixture.calls).toHaveLength(0);
    await dialog.getByLabel('Title', { exact: true }).fill('Test notice');
    await dialog.getByRole('button', { name: 'Create announcement', exact: true }).click();
    await expect(dialog.getByLabel('Message', { exact: true })).toBeFocused();
    await dialog.getByLabel('Message', { exact: true }).fill('A useful message');
    await dialog.getByRole('button', { name: 'Create announcement', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(fixture.calls[0].name).toBe('createAnnouncement');
});

test('enlarged text and keyboard navigation retain modal actions and focus trapping', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 600 });
    await mockAdmin(page, '/admin/plans');
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await page.getByRole('button', { name: 'Create plan', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Create plan', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Create plan', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (let i = 0; i < 15; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true); }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create plan', exact: true })).toBeFocused();
});

for (const [menu, heading] of [['Edit Limits', 'Edit limits'], ['Adjust Usage', 'Edit usage'], ['Manage Plan', 'Manage plan']] as const) {
    test(`${heading} keeps its save action visible with enlarged text`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: 390, height: 600 });
        await mockAdmin(page, '/admin/users');
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        await page.getByRole('button', { name: `Actions for ${adminUsers[0].name}` }).click();
        await page.getByRole('dialog', { name: 'User actions' }).getByRole('button', { name: menu, exact: true }).click();
        const dialog = page.getByRole('dialog', { name: heading, exact: true });
        await expect(dialog).toBeVisible();
        await expect(page.getByRole('dialog', { name: 'User actions', exact: true })).toHaveCount(0);
        await expect(dialog).toHaveCSS('opacity', '1');
        await expect(dialog.getByRole('button', { name: /Save [cC]hanges/ })).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`${heading}-enlarged.png`), animations: 'disabled' });
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
    });
}

test('plan form validates required fields and preserves fractional limits', async ({ page }) => {
    const fixture = await mockAdmin(page, '/admin/plans');
    await page.getByRole('button', { name: 'Create plan', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Create plan', exact: true }).click();
    await expect(dialog.getByLabel('Plan key', { exact: true })).toBeFocused();
    expect(fixture.calls).toHaveLength(0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Edit Standard', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect((fixture.calls[0].args[1] as { limits: unknown }).limits).toEqual(adminPlans[0].limits);
});

test('manual usage fields are associated, validated and retry preserves edited values', async ({ page }) => {
    let fail = true;
    const fixture = await mockAdmin(page, '/admin/users', name => { if (name === 'updateUserUsage' && fail) throw new Error('Fixture usage outage'); });
    await page.getByRole('button', { name: `Actions for ${adminUsers[0].name}` }).click();
    await page.getByRole('menuitem', { name: 'Adjust Usage', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit usage' });
    await expect(dialog.getByLabel('Storage used (bytes)', { exact: true })).toHaveAttribute('aria-describedby', 'storageUsed-help');
    await dialog.getByLabel('Transcription used (seconds)', { exact: true }).fill('30.5');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Fixture usage outage');
    await expect(dialog.getByLabel('Transcription used (seconds)', { exact: true })).toHaveValue('30.5');
    fail = false;
    await dialog.getByRole('button', { name: 'Retry save' }).click();
    await expect(dialog).toHaveCount(0);
    expect(fixture.calls.at(-1)?.args[1]).toEqual({ storageUsed: adminUsers[0].storageUsed, transcriptionUsed: 30.5 });
});

test('zero allocations keep progress finite and direct details links return safely to Users', async ({ page }) => {
    await mockAdmin(page, `/admin/users/${adminUsers[1].id}`);
    await expect(page.getByRole('heading', { name: adminUsers[1].name, exact: true })).toHaveCount(1);
    // This fixture has positive consumed usage with no remaining allocation.
    await expect(page.getByRole('progressbar', { name: 'Storage usage' })).toHaveAttribute('aria-valuenow', '100');
    await expect(page.getByRole('progressbar', { name: 'Transcription usage' })).toHaveAttribute('aria-valuenow', '100');
    await page.getByRole('link', { name: 'Back to users', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
});

test('Users pending confirmation blocks duplicate writes and retains context after failure', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const fixture = await mockAdmin(page, '/admin/users', async name => { if (name === 'deleteUser') { await gate; throw new Error('Fixture account outage'); } });
    await page.getByRole('button', { name: `Actions for ${adminUsers[0].name}` }).click();
    await page.getByRole('menuitem', { name: 'Delete User', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    release();
    await expect(dialog.getByRole('alert')).toContainText('Fixture account outage');
    expect(fixture.calls.filter(call => call.name === 'deleteUser')).toHaveLength(1);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByText('25 users', { exact: true })).toBeVisible();
});

test('empty admin sections offer setup actions without fabricating results', async ({ page }) => {
    await mockAdmin(page, '/admin/plans?empty=1');
    await expect(page.getByRole('button', { name: 'Create your first plan' })).toBeVisible();
    await page.goto('/admin/announcements?empty=1');
    await expect(page.getByRole('button', { name: 'Create your first announcement' })).toBeVisible();
    await page.goto('/admin/users?search=missing');
    await expect(page.getByText('0 matches', { exact: true })).toBeVisible();
    await expect(page.getByText('No users match your search.')).toBeVisible();
    await page.goto('/admin/audit?empty=1');
    await expect(page.getByText('0 matching events', { exact: true })).toBeVisible();
    await expect(page.getByText(/No audit entries/)).toBeVisible();
    await page.goto('/admin/settings?fail=1');
    await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
});

test('audit calendar dates survive local timezone round trips and reject reversed ranges', async ({ page }) => {
    await mockAdmin(page, '/admin/audit?startDate=2026-10-06T18%3A30%3A00.000Z&endDate=2026-10-08T18%3A29%3A59.999Z');
    const days = page.getByRole('spinbutton', { name: /day/i });
    const expected = await page.evaluate(() => new Date('2026-10-06T18:30:00.000Z').getDate());
    await expect(days.first()).toHaveAttribute('aria-valuenow', String(expected));
    // Moving the start past the end must show an error instead of navigating.
    await days.first().focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('alert')).toHaveText('Choose an end date on or after the start date.');
});
