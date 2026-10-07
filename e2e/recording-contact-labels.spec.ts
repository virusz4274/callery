import { expect, test } from '@playwright/test';
import { mockRecordings, profile, recording } from './fixtures/recordings';
import type { UserResponse, ContactResponse } from '../src/lib/db/types';
import type { FileSystemNode } from '../src/lib/types';

test.use({ serviceWorkers: 'block', timezoneId: 'Asia/Kolkata' });

for (const width of [1280, 390]) {
    test(`recording labels use caller and readable call date at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const caller = { ...recording, contactName: 'achan', fileName: 'Call achan_260627_053508.m4a',
            standardizedDisplayName: 'achan_2026-06-27_05-35-08', recordedAt: '2026-06-27T00:05:08Z' };
        const unexpected = await mockRecordings(page, { recording: caller });
        const dialog = page.getByRole('dialog', { name: 'achan', exact: true });
        await expect(dialog.getByText(/Jun 27, 2026/)).toBeVisible();
        await expect(dialog.getByText(/5:35 AM/)).toBeVisible();
        await dialog.getByText('Original filename', { exact: true }).click();
        await expect(dialog.getByText(caller.fileName, { exact: true })).toBeVisible();
        expect(unexpected).toEqual([]);
    });

    test(`unmatched numeric caller is displayed as its number at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const caller = { ...recording, contactName: null, phoneNumber: '09947555123', fileName: 'Call 09947555123_260627_181347.m4a' };
        const unexpected = await mockRecordings(page, { recording: caller });
        await expect(page.getByRole('dialog', { name: '09947555123', exact: true })).toBeVisible();
        expect(unexpected).toEqual([]);
    });

    test(`sync completion refreshes an open recording without replacing audio at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const caller = { ...recording, contactId: 'contact-fixture', contactName: 'achan' };
        const syncProfile: UserResponse = { ...profile, googleSync: { ...profile.googleSync, status: 'syncing' as const } };
        const unexpected = await mockRecordings(page, { recording: caller, profile: syncProfile });
        await page.locator('audio').evaluate(element => { element.dataset.identity = 'rename-retained'; });
        caller.contactName = 'Dad';
        caller.updatedAt = '2026-10-06T10:00:00Z';
        syncProfile.googleSync = { ...syncProfile.googleSync, status: 'completed', lastSyncedAt: '2026-10-06T10:00:00Z' };
        await expect(page.getByRole('dialog', { name: 'Dad', exact: true })).toBeVisible({ timeout: 15000 });
        await expect(page.locator('audio')).toHaveAttribute('data-identity', 'rename-retained');
        expect(unexpected).toEqual([]);
    });
}

test('contact folder keeps its current year/month open after a rename', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const caller = { ...recording, contactName: 'achan', recordedAt: '2026-06-27T00:05:08Z' };
    const syncProfile: UserResponse = { ...profile, googleSync: { ...profile.googleSync, status: 'syncing' as const } };
    const node = (id: string, name: string, children: FileSystemNode[] = []): FileSystemNode => ({
        id, name, type: 'folder', lastModified: caller.recordedAt, children,
    });
    const tree = () => node('root', 'Home', [node('folder-contact-fixture', caller.contactName, [node('year', '2026', [node('month', '06', [
        { id: `file-${caller.id}`, name: caller.contactName, type: 'file', recordingId: caller.id, lastModified: caller.recordedAt },
        { id: 'file-second', name: caller.contactName, type: 'file', recordingId: 'second', lastModified: '2026-06-27T07:41:55Z' },
    ])])])]);
    const unexpected = await mockRecordings(page, { url: '/files', open: false, recording: caller, profile: syncProfile, fileSystem: tree });
    await expect(page.getByRole('button', { name: 'Open achan', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Open achan', exact: true }).click();
    await page.getByRole('button', { name: 'Open 2026', exact: true }).click();
    await page.getByRole('button', { name: 'Open 06', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open achan', exact: true })).toHaveCount(2);
    caller.contactName = 'Dad';
    syncProfile.googleSync = { ...syncProfile.googleSync, status: 'completed', lastSyncedAt: '2026-10-06T10:00:00Z' };
    await expect(page.getByRole('button', { name: 'Open Dad', exact: true })).toHaveCount(2, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: '06', exact: true })).toBeVisible();
    await page.getByText('Folder path', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Dad', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('renamed-contact-folder.png') });
    expect(unexpected).toEqual([]);
});

test('sync completion refreshes the cached contacts directory', async ({ page }) => {
    const contact: ContactResponse = { id: 'contact-fixture', authSubject: profile.id, googleContactId: 'people/1',
        name: 'achan', firstName: 'achan', lastName: '', phoneNumbers: ['555'], email: null,
        createdAt: profile.createdAt, updatedAt: profile.createdAt, totalRecordings: 2, lastRecordingAt: recording.recordedAt };
    const syncProfile: UserResponse = { ...profile, googleSync: { ...profile.googleSync, status: 'syncing' } };
    const unexpected = await mockRecordings(page, { url: '/contacts', open: false, contacts: [contact], profile: syncProfile });
    await expect(page.getByRole('link', { name: /^Open achan/ })).toBeVisible();
    contact.name = 'Dad';
    syncProfile.googleSync = { ...syncProfile.googleSync, status: 'completed', lastSyncedAt: '2026-10-06T10:00:00Z' };
    await expect(page.getByRole('link', { name: /^Open Dad/ })).toBeVisible({ timeout: 15000 });
    expect(unexpected).toEqual([]);
});
