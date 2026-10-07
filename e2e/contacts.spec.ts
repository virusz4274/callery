import { expect, test, type Page, type Route } from '@playwright/test';
import type { ContactResponse, UserResponse } from '../src/lib/db/types';
import { mockRecordings, recording } from './fixtures/recordings';

// All browser API data is mocked; these tests never create accounts or edit the shared database.
test.use({ serviceWorkers: 'block' });

const profile: UserResponse = {
    id: 'directory-fixture', email: 'directory@example.com', firstName: 'Directory', lastName: 'Fixture',
    name: 'Directory Fixture', phoneNumber: '', role: 'user', timezone: 'UTC',
    planKey: 'lifetime', planName: 'Lifetime', createdAt: '2026-01-01T00:00:00Z',
    notificationSettings: { activityDigest: 'off', ingestSuccess: false, ingestFail: false },
    storageSettings: { deletionPolicy: 'never' }, storageUsed: 0, storageAllocation: 1024 ** 3,
    transcriptionUsed: 0, transcriptionAllocation: 3600, transcriptionSettings: { autoTranscribe: false },
    billingSettings: { allowOverage: false }, totalRecordings: 0,
    googleSync: { status: 'completed', hasRefreshToken: true },
};

const contacts: ContactResponse[] = Array.from({ length: 45 }, (_, index) => ({
    id: `contact-${index}`, authSubject: profile.id, googleContactId: `people/${index}`,
    name: index < 20 ? `A Contact ${String(index).padStart(2, '0')}` : `Zebra Needle ${index}`,
    phoneNumbers: [], email: null, firstName: 'Contact', lastName: String(index),
    createdAt: profile.createdAt, updatedAt: profile.createdAt, totalRecordings: 0, lastRecordingAt: null,
    ...(index === 30 ? { jobTitle: 'Lead Engineer' } : {}),
}));

async function mockDirectory(page: Page, respond: (route: Route, url: URL) => Promise<void>, userProfile = profile) {
    await page.route('**/api/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/contacts') return respond(route, url);
        const data: Record<string, unknown> = {
            '/api/auth/get-session': {
                user: { id: profile.id, name: profile.name, email: profile.email, emailVerified: true },
                session: { id: 'fixture-session', userId: profile.id, token: 'fixture', expiresAt: '2099-01-01T00:00:00Z' },
            },
            '/api/auth/capabilities': { googleEnabled: false, emailVerificationRequired: false, passwordResetEnabled: false },
            '/api/auth/list-accounts': [],
            '/api/user/profile': { profile: userProfile },
            '/api/system-settings/public': { maintenanceMode: false },
        };
        await route.fulfill({ json: data[url.pathname] ?? {} });
    });
}

async function directoryResponse(route: Route, url: URL, directory = contacts) {
    const search = (url.searchParams.get('search') || '').trim().toLowerCase();
    const matches = directory.filter(contact => [contact.name, contact.jobTitle, contact.company, ...contact.phoneNumbers].some(value => value?.toLowerCase().includes(search)));
    const skip = Number(url.searchParams.get('skip') || 0);
    const limit = Number(url.searchParams.get('limit') || 20);
    await route.fulfill({ json: { contacts: matches.slice(skip, skip + limit), totalCount: matches.length, limit, skip } });
}

test('directory totals survive pagination and searches count matches beyond the first page', async ({ page }) => {
    let libraryRequests = 0;
    await mockDirectory(page, async (route, url) => {
        if (url.searchParams.get('limit') === '1') libraryRequests++;
        await directoryResponse(route, url);
    });
    await page.goto('/contacts');
    await expect(page.getByText('45 contacts', { exact: true })).toBeVisible();
    await expect(page.getByTestId('contacts-library-count').getByText('45 contacts', { exact: true })).toBeVisible();
    const rows = page.getByRole('link', { name: /^Open (A Contact|Zebra Needle)/ });
    await expect(rows).toHaveCount(20);
    await page.getByRole('link', { name: 'Open A Contact 19', exact: true }).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await expect(rows).toHaveCount(40);
    await expect(page.getByTestId('contacts-library-count').getByText('45 contacts', { exact: true })).toHaveCount(1);

    const search = page.getByRole('searchbox', { name: 'Search contacts' });
    await search.fill('needle');
    await expect(page.getByText('25 matches', { exact: true })).toHaveCount(1);
    await expect(page.getByTestId('contacts-library-count')).toHaveText('45 contacts');
    await expect(page.getByRole('link', { name: 'Open Zebra Needle 20', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Open A Contact/ })).toHaveCount(0);
    await search.fill('missing');
    await expect(page.getByText('0 matches', { exact: true })).toHaveCount(1);
    await expect(page.getByTestId('contacts-library-count')).toHaveText('45 contacts');
    await expect(page.getByText('No contacts found', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(search).toBeFocused();
    await expect(page.getByTestId('contacts-library-count').getByText('45 contacts', { exact: true })).toBeVisible();

    await search.pressSequentially('Lead Engineer', { delay: 15 });
    await expect(search).toHaveValue('Lead Engineer');
    await expect(search).toBeFocused();
    await expect(page.getByText('1 match', { exact: true })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Open Zebra Needle 30', exact: true })).toBeVisible();
    expect(libraryRequests).toBe(1);
});

test('late search responses cannot replace the current query or its count', async ({ page }) => {
    let releaseSlow!: () => void;
    let slowComplete!: () => void;
    const slowGate = new Promise<void>(resolve => { releaseSlow = resolve; });
    const slowFinished = new Promise<void>(resolve => { slowComplete = resolve; });
    await mockDirectory(page, async (route, url) => {
        if (url.searchParams.get('search') === 'slow') {
            await slowGate;
            await route.fulfill({ json: { contacts: [{ ...contacts[0], name: 'Stale contact' }], totalCount: 1, limit: 20, skip: 0 } });
            slowComplete();
        } else {
            await directoryResponse(route, url);
        }
    });
    await page.goto('/contacts');
    await expect(page.getByTestId('contacts-library-count').getByText('45 contacts', { exact: true })).toBeVisible();
    const search = page.getByRole('searchbox', { name: 'Search contacts' });
    await Promise.all([
        page.waitForRequest(request => new URL(request.url()).searchParams.get('search') === 'slow'),
        search.fill('slow'),
    ]);
    await expect(search).toBeFocused();
    await search.fill('needle');
    try {
        await expect(page.getByText('25 matches', { exact: true })).toHaveCount(1);
    } finally {
        releaseSlow();
    }
    await slowFinished;
    await expect(search).toHaveValue('needle');
    await expect(page.getByText('25 matches', { exact: true })).toHaveCount(1);
    await expect(page.getByRole('link', { name: 'Open Stale contact', exact: true })).toHaveCount(0);
});

test('failed directory requests show a retry action without a false zero count', async ({ page }) => {
    let failing = true;
    await mockDirectory(page, async (route, url) => {
        if (failing) await route.fulfill({ status: 500, json: { error: 'Fixture outage' } });
        else await directoryResponse(route, url);
    });
    await page.goto('/contacts');
    await expect(page.getByText('Could not load contacts', { exact: true })).toBeVisible();
    await expect(page.getByText('Count unavailable', { exact: true })).toHaveCount(1);
    await expect(page.getByText('0 contacts', { exact: true })).toHaveCount(0);
    await expect(page.getByText('No contacts yet', { exact: true })).toHaveCount(0);
    failing = false;
    await page.getByRole('button', { name: 'Retry contact total', exact: true }).click();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByTestId('contacts-library-count').getByText('45 contacts', { exact: true })).toBeVisible();
    await expect(page.getByText('Could not load contacts', { exact: true })).toHaveCount(0);
});

const polishedContacts: ContactResponse[] = [
    { ...contacts[0], name: 'Alexandria Catherine Montgomery With A Very Long Contact Name', jobTitle: 'Senior Customer Success Manager', company: 'International Research and Development Corporation', phoneNumbers: ['+44 (20) 555-1234', '+1 202 555 0199', '+91 98765 43210'], totalRecordings: 12 },
    { ...contacts[1], name: '+91 9988776655', phoneNumbers: ['+91 9988776655'], totalRecordings: 1 },
    { ...contacts[2], name: 'Missing metadata', phoneNumbers: [], totalRecordings: 0 },
    { ...contacts[3], name: 'Same Person', phoneNumbers: ['111'] },
    { ...contacts[4], name: 'Same Person', phoneNumbers: ['222'] },
];

for (const theme of ['light', 'dark']) {
    for (const width of [375, 768, 1280]) {
        test(`directory layout and controls at ${width}px in ${theme}`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height: 900 });
            await page.addInitScript(value => localStorage.setItem('theme', value), theme);
            await mockDirectory(page, (route, url) => directoryResponse(route, url, polishedContacts));
            await page.goto('/contacts');
            await expect(page.getByTestId('contacts-library-count')).toHaveText('5 contacts');
            await expect(page.getByTestId('contacts-match-count')).toHaveCount(0);
            const name = polishedContacts[0].name;
            const open = page.getByRole('link', { name: `Open ${name}`, exact: true });
            await expect(open).toBeVisible();
            await expect(page.getByRole('link', { name: 'Open Same Person', exact: true })).toHaveCount(2);
            await expect(page.getByText('No phone number', { exact: true })).toBeVisible();
            const phoneToggle = page.getByRole('button', { name: `Show all phone numbers for ${name}`, exact: true });
            await phoneToggle.focus();
            await expect(phoneToggle).toBeFocused();
            await phoneToggle.press('Enter');
            await expect(page.getByText('+1 202 555 0199', { exact: true })).toBeVisible();
            await expect(page.getByRole('button', { name: `Show fewer phone numbers for ${name}`, exact: true })).toHaveAttribute('aria-expanded', 'true');
            await page.getByRole('button', { name: `Show fewer phone numbers for ${name}`, exact: true }).press('Space');
            await expect(page.getByText('+1 202 555 0199', { exact: true })).toBeHidden();
            await expect(open).toHaveAttribute('href', `/contacts/${polishedContacts[0].id}`);
            await expect(page.getByRole('link', { name: `View recordings for ${name}`, exact: true })).toHaveAttribute('href', `/recordings?contact=${polishedContacts[0].id}`);
            await expect(page.getByRole('link', { name: 'View recordings for Missing metadata', exact: true })).toHaveCount(0);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
            if (width >= 1024) {
                const alignment = await page.getByTestId('contact-row').filter({ has: open }).evaluate(row => {
                    const header = document.querySelector('[data-testid="contacts-columns"]')!;
                    const edges = ['contact-identity', 'contact-phone', 'contact-recordings'].map((id, index) => ({
                        row: row.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect().left,
                        header: header.children[index].getBoundingClientRect().left,
                    }));
                    return edges.every(edge => Math.abs(edge.row - edge.header) < 1);
                });
                expect(alignment).toBe(true);
            } else {
                const targets = await phoneToggle.boundingBox();
                expect(targets!.height).toBeGreaterThanOrEqual(44);
                expect((await page.getByRole('button', { name: 'Manage sources', exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
            }
            await open.focus();
            await expect(open).toBeFocused();
            expect(await open.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
            await page.screenshot({ path: testInfo.outputPath('contacts-directory.png'), fullPage: true });
        });
    }
}

test('pending and failed searches preserve the independently loaded library total', async ({ page }) => {
    let release!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    let failing = true;
    await mockDirectory(page, async (route, url) => {
        if (url.searchParams.get('search') === 'outage') {
            await delayed;
            if (failing) return route.fulfill({ status: 500, json: { error: 'Search unavailable' } });
        }
        await directoryResponse(route, url);
    });
    await page.goto('/contacts');
    await expect(page.getByTestId('contacts-library-count')).toHaveText('45 contacts');
    await page.getByRole('searchbox', { name: 'Search contacts' }).fill('outage');
    await expect(page.getByTestId('contacts-match-count')).toHaveText('Searching…');
    await expect(page.getByTestId('contacts-library-count')).toHaveText('45 contacts');
    release();
    await expect(page.getByText('Could not load contacts', { exact: true })).toBeVisible();
    await expect(page.getByTestId('contacts-match-count')).toHaveText('Matches unavailable');
    await expect(page.getByTestId('contacts-library-count')).toHaveText('45 contacts');
    await expect(page.getByText('No contacts found', { exact: true })).toHaveCount(0);
    failing = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByTestId('contacts-match-count')).toHaveText('0 matches');
});

test('failed library total can retry independently of working search results', async ({ page }) => {
    let failing = true;
    await mockDirectory(page, async (route, url) => {
        if (url.searchParams.get('limit') === '1' && failing) return route.fulfill({ status: 500, json: { error: 'Count unavailable' } });
        await directoryResponse(route, url);
    });
    await page.goto('/contacts?q=needle');
    await expect(page.getByTestId('contacts-match-count')).toHaveText('25 matches');
    await expect(page.getByText('Count unavailable', { exact: true })).toBeVisible();
    failing = false;
    await page.getByRole('button', { name: 'Retry contact total', exact: true }).click();
    await expect(page.getByTestId('contacts-library-count')).toHaveText('45 contacts');
    await expect(page.getByTestId('contacts-match-count')).toHaveText('25 matches');
});

test('automatic pagination retains rows on failure and retries locally', async ({ page }) => {
    let failing = true;
    await mockDirectory(page, async (route, url) => {
        if (Number(url.searchParams.get('skip')) > 0 && failing) return route.fulfill({ status: 500, json: { error: 'Page unavailable' } });
        await directoryResponse(route, url);
    });
    await page.goto('/contacts');
    await expect(page.getByTestId('contacts-progress')).toHaveText('Showing 20 of 45 contacts');
    await page.getByRole('link', { name: 'Open A Contact 19', exact: true }).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.getByText('Could not load more contacts.', { exact: true })).toBeVisible();
    await expect(page.getByTestId('contact-row')).toHaveCount(20);
    failing = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByTestId('contact-row')).toHaveCount(40);
    await expect(page.getByText('Could not load more contacts.', { exact: true })).toHaveCount(0);
});

test('keyboard load more is guarded against duplicate requests', async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let pageTwoRequests = 0;
    await mockDirectory(page, async (route, url) => {
        if (url.searchParams.get('skip') === '20') { pageTwoRequests++; await gate; }
        await directoryResponse(route, url);
    });
    await page.goto('/contacts');
    const more = page.getByRole('button', { name: 'Load more contacts', exact: true });
    await more.focus();
    await more.press('Enter');
    await expect(more).toBeDisabled();
    release();
    await expect(page.getByTestId('contact-row')).toHaveCount(40);
    expect(pageTwoRequests).toBe(1);
});

test('contact sync refreshes the library total even while searching', async ({ page }) => {
    const syncing: UserResponse = { ...profile, googleSync: { ...profile.googleSync, status: 'syncing' } };
    const directory = [...contacts];
    await mockDirectory(page, (route, url) => directoryResponse(route, url, directory), syncing);
    await page.goto('/contacts?q=needle');
    await expect(page.getByTestId('contacts-library-count')).toHaveText('45 contacts');
    await expect(page.getByTestId('contacts-match-count')).toHaveText('25 matches');
    directory.push({ ...contacts[0], id: 'new-contact', name: 'Added after sync' });
    syncing.googleSync = { ...syncing.googleSync, status: 'completed', lastSyncedAt: '2026-10-07T10:00:00Z' };
    await expect(page.getByTestId('contacts-library-count')).toHaveText('46 contacts', { timeout: 15000 });
    await expect(page.getByTestId('contacts-match-count')).toHaveText('25 matches');
});

test('empty directory offers setup actions without suggesting search failure', async ({ page }) => {
    await mockDirectory(page, (route, url) => directoryResponse(route, url, []), { ...profile, googleSync: { ...profile.googleSync, hasRefreshToken: false } });
    await page.goto('/contacts');
    await expect(page.getByTestId('contacts-library-count')).toHaveText('0 contacts');
    await expect(page.getByText('No contacts yet', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Upload recordings', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Connect Google Contacts', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Clear search', exact: true })).toHaveCount(0);
});

for (const width of [375, 1280]) {
    test(`recording shortcuts navigate to this contact's calls at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const contact = polishedContacts[0];
        const unexpected = await mockRecordings(page, { url: '/contacts', open: false, contacts: polishedContacts,
            recording: { ...recording, contactId: contact.id, contactName: contact.name } });
        await page.getByRole('link', { name: `View recordings for ${contact.name}`, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/recordings\\?contact=${contact.id}`));
        await expect(page.getByRole('heading', { name: 'Recordings', level: 1, exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: contact.name, exact: true })).toBeVisible();
        // Finish the fixture's bundle interceptions before the test closes its context.
        await page.waitForLoadState('networkidle');
        expect(unexpected).toEqual([]);
    });
}

test('duplicate phone warning retains a clear source-management action', async ({ page }) => {
    await mockDirectory(page, (route, url) => directoryResponse(route, url, polishedContacts), {
        ...profile, googleSync: { ...profile.googleSync, duplicatePhoneIssueCount: 2 },
    });
    await page.goto('/contacts');
    await expect(page.getByText('Review duplicate numbers in Google Contacts', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Review sync issues', exact: true })).toHaveAttribute('href', '/settings?tab=sources');
});

test('directory remains usable at 200 percent zoom', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockDirectory(page, (route, url) => directoryResponse(route, url, polishedContacts));
    await page.goto('/contacts');
    await expect(page.getByTestId('contact-row')).toHaveCount(5);
    // Desktop browser zoom at 200% halves the CSS viewport. CSS `zoom` alone
    // keeps desktop media queries active and cannot model browser zoom reflow.
    await page.setViewportSize({ width: 640, height: 450 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const toggle = page.getByRole('button', { name: `Show all phone numbers for ${polishedContacts[0].name}`, exact: true });
    await toggle.click();
    await expect(page.getByText('+1 202 555 0199', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('contacts-zoom-200.png'), fullPage: true });
});
