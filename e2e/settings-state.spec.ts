import { expect, test, type Page } from '@playwright/test';
import type { UpdateProfileBody } from '../src/lib/schemas';
import { mockRecordings, profile as originalProfile } from './fixtures/recordings';

test.use({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });

async function settingsFixture(page: Page) {
    let profile = structuredClone(originalProfile);
    const patches: UpdateProfileBody[] = [];
    let fail = false, refreshes = 0;
    let hold: Promise<void> | undefined;
    await mockRecordings(page, { profile, url: '/settings?tab=profile', open: false });
    await expect(page.getByLabel('First Name', { exact: true })).toHaveValue(profile.firstName);
    await page.route('**/api/user/profile', async route => {
        if (route.request().method() === 'PATCH') {
            const patch = route.request().postDataJSON() as UpdateProfileBody;
            patches.push(patch);
            if (hold) await hold;
            if (fail) return route.fulfill({ status: 500, json: { error: 'Fixture save failed' } });
            profile = { ...profile, ...patch,
                notificationSettings: { ...profile.notificationSettings, ...patch.notificationSettings },
                storageSettings: { ...profile.storageSettings, ...patch.storageSettings },
                transcriptionSettings: { ...profile.transcriptionSettings, ...patch.transcriptionSettings },
            };
            return route.fulfill({ json: { success: true } });
        }
        refreshes++;
        return route.fulfill({ json: { profile } });
    });
    return { patches, profile: () => profile, refreshes: () => refreshes, fail: () => { fail = true; },
        updateLastName: (lastName: string) => { profile.lastName = lastName; },
        hold: (promise: Promise<void>) => { hold = promise; } };
}

test('saving one settings section refreshes clean fields while retaining another section draft', async ({ page }) => {
    const fixture = await settingsFixture(page);
    await page.getByLabel('First Name', { exact: true }).fill('Unsaved first name');
    fixture.updateLastName('Refreshed surname');
    await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Notifications', exact: true }).click();
    await page.getByRole('radio', { name: 'Weekly', exact: true }).press('Space');
    await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
    await expect(page.getByText('Notifications Saved', { exact: true })).toBeVisible();
    await expect.poll(fixture.refreshes).toBeGreaterThan(0);
    await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Profile', exact: true }).click();
    await expect(page.getByLabel('First Name', { exact: true })).toHaveValue('Unsaved first name');
    await expect(page.getByLabel('Last Name', { exact: true })).toHaveValue('Refreshed surname');
    expect(fixture.patches).toEqual([{ notificationSettings: { activityDigest: 'weekly' } }]);
    expect(fixture.profile().firstName).toBe(originalProfile.firstName);
});

test('failed profile saving preserves the draft and never resets it to cached data', async ({ page }) => {
    const fixture = await settingsFixture(page);
    fixture.fail();
    await page.getByLabel('First Name', { exact: true }).fill('Keep this draft');
    await page.getByRole('button', { name: 'Save Profile', exact: true }).click();
    await expect(page.getByText('Fixture save failed', { exact: true })).toBeVisible();
    await expect(page.getByLabel('First Name', { exact: true })).toHaveValue('Keep this draft');
    expect(fixture.profile().firstName).toBe(originalProfile.firstName);
    expect(fixture.refreshes()).toBe(0);
});

test('different sections can finish concurrent saves without replacing sibling settings', async ({ page }) => {
    const fixture = await settingsFixture(page);
    let release!: () => void;
    fixture.hold(new Promise<void>(resolve => { release = resolve; }));
    try {
        await page.getByLabel('First Name', { exact: true }).fill('Saved first name');
        await page.getByRole('button', { name: 'Save Profile', exact: true }).click();
        await expect.poll(() => fixture.patches.length).toBe(1);
        await expect(page.getByLabel('First Name', { exact: true })).toBeDisabled();
        await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Notifications', exact: true }).click();
        await page.getByRole('radio', { name: 'Monthly', exact: true }).press('Space');
        await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
        await expect.poll(() => fixture.patches.length).toBe(2);
    } finally { release(); }
    await expect(page.getByText('Profile Updated', { exact: true })).toBeVisible();
    await expect(page.getByText('Notifications Saved', { exact: true })).toBeVisible();
    expect(fixture.profile().firstName).toBe('Saved first name');
    expect(fixture.profile().notificationSettings.activityDigest).toBe('monthly');
    expect(fixture.profile().transcriptionSettings).toEqual(originalProfile.transcriptionSettings);
    expect(fixture.profile().storageSettings).toEqual(originalProfile.storageSettings);
});

test('saving processing leaves an edited retention policy unsaved and preserves its draft', async ({ page }) => {
    const fixture = await settingsFixture(page);
    const sections = page.getByRole('navigation', { name: 'Settings sections' });
    await sections.getByRole('button', { name: 'Retention', exact: true }).click();
    await page.getByRole('button', { name: /Automatic deletion policy$/ }).click();
    await page.getByRole('option', { name: '6 Months', exact: true }).click();
    await sections.getByRole('button', { name: 'Processing', exact: true }).click();
    await page.getByRole('switch', { name: 'Auto-Transcribe', exact: true }).press('Space');
    await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
    await expect(page.getByText('Policy Saved', { exact: true })).toBeVisible();
    expect(fixture.patches).toEqual([{ transcriptionSettings: { autoTranscribe: true, defaultProvider: 'gemini' } }]);
    expect(fixture.profile().storageSettings.deletionPolicy).toBe('never');
    await sections.getByRole('button', { name: 'Retention', exact: true }).click();
    await expect(page.getByRole('button', { name: /Automatic deletion policy$/ })).toContainText('6 Months');
    await page.getByRole('button', { name: 'Save Policy', exact: true }).click();
    await expect.poll(() => fixture.patches.length).toBe(2);
    expect(fixture.patches[1]).toEqual({ storageSettings: { deletionPolicy: '6m' } });
});
