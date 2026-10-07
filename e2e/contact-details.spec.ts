import { expect, test } from '@playwright/test';
import type { ContactResponse, RecordingResponse } from '../src/lib/db/types';
import { mockRecordings, profile, recording } from './fixtures/recordings';

test.use({ serviceWorkers: 'block', timezoneId: 'Asia/Kolkata' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });

const contact: ContactResponse = {
    id: 'contact-detail-fixture', authSubject: profile.id, googleContactId: 'people/detail',
    name: 'Alexandria Catherine Montgomery With A Very Long Contact Name', firstName: 'Alexandria', lastName: 'Montgomery',
    phoneNumbers: ['+44 (20) 555-1234', '+1 202 555 0199'], email: 'alexandria.montgomery@example.com',
    jobTitle: 'Senior Customer Success Manager', company: 'International Research and Development Corporation',
    createdAt: profile.createdAt, updatedAt: profile.createdAt, totalRecordings: 2, lastRecordingAt: '2026-10-07T10:00:00Z',
};
const calls: RecordingResponse[] = [0, 1].map(index => ({
    ...recording, id: `contact-call-${index}`, contactId: contact.id, contactName: contact.name,
    recordedAt: `2026-10-0${7 - index}T10:00:00Z`, transcriptionStatus: index ? 'failed' : 'completed',
    summary: `**Summary:** Discussed the upcoming launch.\n\n- **Next steps:** Confirm requirements.\n- Review <script>unsafe()</script> as text.`,
    tags: ['Project launch', 'Follow-up'],
}));

for (const theme of ['light', 'dark']) {
    for (const width of [375, 768, 1280]) {
        test(`HeroUI contact details and review flow at ${width}px in ${theme}`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height: 900 });
            await page.addInitScript(value => localStorage.setItem('theme', value), theme);
            const unexpected = await mockRecordings(page, { contacts: [contact], recordings: calls, recording: calls[0], url: `/contacts/${contact.id}`, open: false });
            const heading = page.getByRole('heading', { name: contact.name, level: 1, exact: true });
            await expect(heading).toBeVisible();
            await expect(page.getByRole('heading', { name: 'Recent calls', exact: true })).toHaveCount(1);
            await expect(page.getByTestId('contact-call-row')).toHaveCount(2);
            await expect(page.getByText('Recent call timeline', { exact: true })).toHaveCount(0);
            await expect(page.getByText('Recent call summaries', { exact: true })).toHaveCount(0);
            await expect(page.getByText(/total talk time/)).toHaveCount(0);
            await expect(page.getByTestId('contact-profile')).toHaveAttribute('data-slot', 'card');
            expect(await heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeLessThanOrEqual(30);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            await page.getByRole('button', { name: `Show all phone numbers for ${contact.name}`, exact: true }).click();
            await expect(page.getByText('+1 202 555 0199', { exact: true })).toBeVisible();
            await page.getByRole('button', { name: `Show fewer phone numbers for ${contact.name}`, exact: true }).click();

            const first = page.getByTestId('contact-call-row').first();
            const more = first.getByRole('button', { name: `Show full summary for ${contact.name}`, exact: true });
            await more.click();
            await expect(first.getByRole('region', { name: `Full summary for ${contact.name}`, exact: true })).toBeVisible();
            await expect(first.locator('strong').filter({ hasText: 'Next steps:' })).toBeVisible();
            await expect(first.locator('script')).toHaveCount(0);
            await page.getByRole('heading', { name: 'Recent calls', exact: true }).click();
            await expect(more).toHaveAttribute('aria-expanded', 'false');
            await page.getByRole('button', { name: 'Topics in recent calls', exact: true }).click();
            await expect(page.getByText('Project launch', { exact: true })).toBeVisible();
            await page.getByRole('button', { name: 'Topics in recent calls', exact: true }).click();
            await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
            await page.screenshot({ path: testInfo.outputPath('contact-heroui.png'), fullPage: true });

            const open = first.getByRole('button', { name: /^Open recording from/ });
            await open.focus();
            await open.press('Enter');
            const dialog = page.getByRole('dialog', { name: contact.name, exact: true });
            await expect(dialog).toBeVisible();
            await dialog.getByRole('button', { name: width < 768 ? 'Back to list' : 'Close', exact: true }).click();
            await expect(dialog).toHaveCount(0);
            await expect(open).toBeFocused();
            await first.getByRole('button', { name: /^Play recording from/ }).click();
            await expect(dialog).toBeVisible();
            await expect.poll(() => dialog.locator('audio').evaluate(element => (element as HTMLAudioElement).paused)).toBe(false);
            await dialog.getByRole('button', { name: width < 768 ? 'Back to list' : 'Close', exact: true }).click();
            await page.waitForLoadState('networkidle');
            expect(unexpected).toEqual([]);
        });
    }
}

test('missing metadata and an empty call history retain usable HeroUI actions', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    const person = { ...contact, name: '+91 9988776655', phoneNumbers: [], email: null, company: undefined, jobTitle: undefined, totalRecordings: 0, lastRecordingAt: null };
    const unexpected = await mockRecordings(page, { contacts: [person], recordings: [], url: `/contacts/${person.id}`, open: false });
    await expect(page.getByRole('heading', { name: person.name, level: 1, exact: true })).toBeVisible();
    await expect(page.getByText('No phone number', { exact: true })).toBeVisible();
    await expect(page.getByText('No email linked', { exact: true })).toBeVisible();
    await expect(page.getByText('No recordings linked to this contact yet.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Topics in recent calls', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Upload recordings', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(unexpected).toEqual([]);
});

test('first 30 calls are labelled as a partial list and link to the full collection', async ({ page }) => {
    const history = Array.from({ length: 35 }, (_, index) => ({ ...calls[index % 2], id: `history-${index}` }));
    const unexpected = await mockRecordings(page, { contacts: [{ ...contact, totalRecordings: 35 }], recordings: history, url: `/contacts/${contact.id}`, open: false });
    await expect(page.getByText('Showing 30 of 35 recordings, newest first.', { exact: true })).toBeVisible();
    await expect(page.getByTestId('contact-call-row')).toHaveCount(30);
    await expect(page.getByRole('link', { name: 'View all 35 recordings', exact: true })).toHaveAttribute('href', `/recordings?contact=${contact.id}`);
    expect(unexpected).toEqual([]);
});

test('call history failures stay local and can retry without hiding the contact', async ({ page }) => {
    let failing = true;
    const unexpected = await mockRecordings(page, { contacts: [contact], recordings: calls, failRecordings: () => failing, url: `/contacts/${contact.id}`, open: false });
    await expect(page.getByRole('heading', { name: contact.name, level: 1, exact: true })).toBeVisible();
    await expect(page.getByText('Could not load call history', { exact: true })).toBeVisible();
    await expect(page.getByText('No recordings linked to this contact yet.', { exact: true })).toHaveCount(0);
    failing = false;
    await page.getByRole('button', { name: 'Retry calls', exact: true }).click();
    await expect(page.getByTestId('contact-call-row')).toHaveCount(2);
    await expect(page.getByText('Could not load call history', { exact: true })).toHaveCount(0);
    expect(unexpected).toEqual([]);
});

test('missing contact provides a standard recovery card and Back link', async ({ page }) => {
    const unexpected = await mockRecordings(page, { contacts: [], url: '/contacts/missing-contact', open: false });
    await expect(page.getByRole('heading', { name: 'Contact not found', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Back to contacts', exact: true }).click();
    await expect(page).toHaveURL(/\/contacts$/);
    await expect(page.getByRole('heading', { name: 'Contacts', level: 1, exact: true })).toBeVisible();
    expect(unexpected).toEqual([]);
});

test('contact failure uses a HeroUI recovery card and retries independently', async ({ page }) => {
    let failing = true;
    const unexpected = await mockRecordings(page, { contacts: [contact], recordings: calls, failContacts: () => failing, url: `/contacts/${contact.id}`, open: false });
    await expect(page.getByRole('heading', { name: 'Unable to load contact', exact: true })).toBeVisible();
    failing = false;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByRole('heading', { name: contact.name, level: 1, exact: true })).toBeVisible();
    await expect(page.getByTestId('contact-call-row')).toHaveCount(2);
    expect(unexpected).toEqual([]);
});

test('contact details reflow at 200 percent zoom with an unbroken name', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 450 }); // 1280px desktop at 200% browser zoom.
    const person = { ...contact, name: 'VeryLongUnbrokenContactName'.repeat(5), email: 'extremelylongemailaddress'.repeat(3) + '@example.com' };
    const unexpected = await mockRecordings(page, { contacts: [person], recordings: calls, url: `/contacts/${person.id}`, open: false });
    await expect(page.getByRole('heading', { name: person.name, level: 1, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'View recordings', exact: true }).focus();
    await expect(page.getByRole('button', { name: 'View recordings', exact: true })).toBeFocused();
    expect(await page.getByTestId('contact-profile').evaluate(element => getComputedStyle(element).backgroundImage)).toBe('none');
    expect(unexpected).toEqual([]);
});