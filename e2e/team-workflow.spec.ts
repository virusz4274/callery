import { expect, test } from '@playwright/test';
import { mockAdmin } from './fixtures/admin';
import { adminUsers } from './fixtures/admin-data';
import { companyRecording } from './fixtures/team-data';

const audio = Buffer.alloc(44 + 16000);
audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(16000, 28); audio.writeUInt16LE(2, 32);
audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(16000, 40);
const playbackUrl = `data:audio/wav;base64,${audio.toString('base64')}`;

test.use({ serviceWorkers: 'block', timezoneId: 'Asia/Kolkata' });
test.setTimeout(120_000);

for (const width of [390, 1280]) {
    test(`company setup defaults to audio backup and requires adoption confirmation at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const fixture = await mockAdmin(page, '/admin/team-settings?team=1&setup=1', () => ({ success: true }));
        await expect(page.getByRole('button', { name: /Off — back up audio only/ })).toBeVisible();
        await page.getByLabel('Company name', { exact: true }).fill('Pilot Company');
        await page.getByRole('button', { name: 'Enable company archive', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText(/All existing recordings become company records/)).toBeVisible();
        expect(fixture.calls.filter(call => call.name === 'saveTeamSettings')).toHaveLength(0);
        await dialog.getByRole('button', { name: 'Enable company archive', exact: true }).click();
        await expect(page.getByRole('status').filter({ hasText: 'Company settings saved' })).toBeVisible();
        expect(fixture.calls.find(call => call.name === 'saveTeamSettings')?.args[0]).toMatchObject({ enabled: true, companyName: 'Pilot Company', retentionPolicy: 'never', transcriptionMode: 'off' });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(fixture.unexpected).toEqual([]);
    });

    test(`invitations and employee removal retain the archive at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const fixture = await mockAdmin(page, '/admin/users?team=1', () => ({ success: true }));
        await page.getByLabel('Employee email', { exact: true }).fill('new@example.test');
        await page.getByRole('button', { name: 'Send invitation' }).click();
        await expect(page.getByText('Invitation sent.', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Resend', exact: true }).click();
        await expect(page.getByText('Invitation resent.', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Revoke', exact: true }).click();
        await expect(page.getByText('Invitation revoked.', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Remove access', exact: true }).nth(1).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText(/keep all company recordings/)).toBeVisible();
        await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
        await expect(dialog).not.toBeVisible();
        expect(fixture.calls.find(call => call.name === 'deleteUser')?.args).toEqual([adminUsers[1].id]);
        expect(fixture.calls.filter(call => call.name === 'inviteTeamMember').map(call => call.args[0])).toEqual(['new@example.test', 'pending@example.test']);
        expect(fixture.calls.find(call => call.name === 'revokeTeamInvitation')?.args[0]).toBe('eeeeeeeeeeeeeeeeeeeeeeee');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(fixture.unexpected).toEqual([]);
    });

    test(`administrator archive filters, paging and former employee export at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const fixture = await mockAdmin(page, `/admin/recordings?team=1&employeeId=${adminUsers[2].id}`, name => {
            if (name === 'getAvailableProviders') return [];
            if (name === 'startExport') return { success: true, jobId: 'export-fixture' };
            if (name === 'getExportStatus') return null;
            if (name === 'getRecordingDetailsAction') return { success: true, recording: companyRecording };
            if (name === 'getPlaybackUrlAction') return { playbackUrl };
            return { success: true };
        });
        await expect(page.getByText(/User 02 \(access removed\)/).first()).toBeVisible();
        await expect(page.getByText('Uploaded by User 01').filter({ visible: true })).toBeVisible();
        await page.getByLabel('Search recordings', { exact: true }).fill('customer');
        await page.getByLabel('From date', { exact: true }).fill('2026-09-25');
        await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
        await expect(page).toHaveURL(/search=customer/);
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(page.getByText('Page 2 of 2')).toBeVisible();
        await page.getByRole('button', { name: /Export|Start.*export/i }).click();
        await expect.poll(() => fixture.calls.some(call => call.name === 'startExport')).toBe(true);
        expect(fixture.calls.find(call => call.name === 'startExport')?.args).toEqual([adminUsers[2].id]);
        await page.getByRole('button', { name: 'Phone customer', exact: true }).filter({ visible: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Phone customer', exact: true });
        await expect(dialog).toBeVisible();
        await expect.poll(() => dialog.locator('audio').evaluate((element: HTMLAudioElement) => Number.isFinite(element.duration) && element.duration > 0)).toBe(true);
        await expect(dialog.getByRole('button', { name: /Share/i })).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(fixture.unexpected).toEqual([]);
    });
}
