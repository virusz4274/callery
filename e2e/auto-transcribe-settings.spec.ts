import { expect, test, type Page } from '@playwright/test';
import type { UserResponse } from '../src/lib/db/types';

test.use({ serviceWorkers: 'block' });

const initialProfile: UserResponse = {
    id: 'settings-fixture', email: 'settings@example.com', name: 'Settings Fixture',
    firstName: 'Settings', lastName: 'Fixture', phoneNumber: '', role: 'user', timezone: 'Asia/Calcutta',
    planKey: 'lifetime', planName: 'Lifetime', createdAt: '2026-01-01T00:00:00Z',
    notificationSettings: { activityDigest: 'monthly', ingestSuccess: true, ingestFail: false },
    storageSettings: { deletionPolicy: '3m' }, storageUsed: 0, storageAllocation: 1024 ** 3,
    transcriptionUsed: 0, transcriptionAllocation: 3600,
    transcriptionSettings: { autoTranscribe: true, defaultProvider: 'gemini', defaultModel: 'configured-model' },
    billingSettings: { allowOverage: false }, totalRecordings: 0,
    googleSync: { status: 'not_connected', hasRefreshToken: false },
};

const providers = [
    { id: 'soniox', name: 'Soniox', description: 'Standard transcription', multiplier: 1 },
    { id: 'gemini', name: 'Gemini', description: 'Gemini transcription', multiplier: 0.5 },
];

async function mockSettings(page: Page, failSaves = false) {
    let profile = structuredClone(initialProfile);
    const saves: Array<{ storageSettings: UserResponse['storageSettings']; transcriptionSettings: UserResponse['transcriptionSettings'] }> = [];
    const unexpectedActions: string[] = [];
    const actionNames = new Map<string, string>();

    // All settings writes and Server Actions stay in this browser fixture.
    await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.pathname.startsWith('/_next/') && url.pathname.endsWith('.js')) {
            const response = await route.fetch();
            const source = await response.text();
            // Next development action IDs change between builds.
            for (const match of source.matchAll(/createServerReference[^\n]*?\)\("([a-f0-9]{40,64})",[^\n]*?, "(\w+)"\)/g)) {
                actionNames.set(match[1], match[2]);
            }
            return route.fulfill({ response, body: source });
        }
        if (url.pathname.startsWith('/api/')) {
            if (url.pathname === '/api/user/profile' && request.method() === 'PATCH') {
                const patch = request.postDataJSON() as (typeof saves)[number];
                saves.push(patch);
                if (failSaves) return route.fulfill({ status: 500, json: { error: 'Fixture save failed' } });
                profile = {
                    ...profile,
                    storageSettings: { ...profile.storageSettings, ...patch.storageSettings },
                    transcriptionSettings: { ...profile.transcriptionSettings, ...patch.transcriptionSettings },
                };
                return route.fulfill({ json: { success: true } });
            }
            const data: Record<string, unknown> = {
                '/api/auth/get-session': {
                    user: { id: profile.id, name: profile.name, email: profile.email, emailVerified: true },
                    session: { id: 'fixture-session', userId: profile.id, token: 'fixture', expiresAt: '2099-01-01T00:00:00Z' },
                },
                '/api/auth/capabilities': { googleEnabled: false, emailVerificationRequired: false, passwordResetEnabled: false },
                '/api/auth/list-accounts': [],
                '/api/user/profile': { profile },
                '/api/system-settings/public': { maintenanceMode: false },
            };
            return route.fulfill({ json: data[url.pathname] ?? {} });
        }
        if (request.method() === 'POST') {
            const action = actionNames.get(request.headers()['next-action']);
            let result: unknown;
            if (action === 'getAvailableProviders') result = providers;
            else if (action === 'fetchNotifications' || action === 'getActiveAnnouncements') result = [];
            else if (action === 'getExportStatus') result = null;
            else {
                unexpectedActions.push(action || 'Unknown action');
                result = { error: 'Unexpected fixture action' };
            }
            return route.fulfill({ contentType: 'text/x-component', body: `0:${JSON.stringify({ a: result, f: [] })}\n` });
        }
        return route.continue();
    });

    await page.goto('/settings?tab=processing');
    await expect(page.getByRole('switch', { name: 'Auto-Transcribe', exact: true })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Default transcription provider' })).toContainText('Gemini');
    return { saves, unexpectedActions, profile: () => profile };
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    test(`auto-transcribe toggles, saves and reloads at ${viewport.width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        const fixture = await mockSettings(page);
        const toggle = page.getByRole('switch', { name: 'Auto-Transcribe', exact: true });

        // Click the visible switch track, then exercise its native keyboard input.
        await page.locator('[data-slot="switch-control"]').click();
        await expect(toggle).not.toBeChecked();
        await expect(page.getByText('Manual', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Default transcription provider' })).toHaveCount(0);
        expect(fixture.saves).toEqual([]);
        await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
        await expect(page.getByText('Policy Saved', { exact: true })).toBeVisible();
        expect(fixture.saves).toEqual([{
            storageSettings: { deletionPolicy: '3m' },
            transcriptionSettings: { autoTranscribe: false, defaultProvider: 'gemini' },
        }]);

        await page.reload();
        await expect(toggle).not.toBeChecked();
        await toggle.press('Space');
        await expect(toggle).toBeChecked();
        await expect(toggle).toBeFocused();
        await expect(page.getByText('Automatic', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Default transcription provider' })).toContainText('Gemini');
        await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
        await expect(page.getByText('Policy Saved', { exact: true })).toBeVisible();
        expect(fixture.saves[1]).toEqual({
            storageSettings: { deletionPolicy: '3m' },
            transcriptionSettings: { autoTranscribe: true, defaultProvider: 'gemini' },
        });
        expect(fixture.profile()).toEqual(initialProfile);
        await page.reload();
        await expect(toggle).toBeChecked();
        expect(fixture.unexpectedActions).toEqual([]);
        if (viewport.width === 1280) await page.screenshot({ path: testInfo.outputPath('auto-transcribe.png') });
    });
}

test('failed auto-transcribe saves show an error and preserve the stored preference', async ({ page }) => {
    const fixture = await mockSettings(page, true);
    const toggle = page.getByRole('switch', { name: 'Auto-Transcribe', exact: true });
    await toggle.press('Space');
    await expect(toggle).not.toBeChecked();
    await page.getByRole('button', { name: 'Save Settings', exact: true }).click();
    await expect(page.getByText('Save Failed', { exact: true })).toBeVisible();
    await expect(page.getByText('Fixture save failed', { exact: true })).toBeVisible();
    await expect(page.getByText('Policy Saved', { exact: true })).toHaveCount(0);
    expect(fixture.profile()).toEqual(initialProfile);
    await page.reload();
    await expect(toggle).toBeChecked();
    expect(fixture.unexpectedActions).toEqual([]);
});
