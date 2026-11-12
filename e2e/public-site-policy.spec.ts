import { expect as baseExpect, test } from '@playwright/test';
import { GITHUB_SUPPORT_URL, marketingPageHref, publicSitePolicy } from '../src/lib/public-site-policy';
import { mockRecordings } from './fixtures/recordings';

const { managedEnabled: managed, marketingHref } = publicSitePolicy();
const legalAvailable = Boolean(marketingHref);
const expect = baseExpect.configure({ timeout: 15_000 });
const informationPages = ['/changelog', '/terms-of-service', '/privacy-policy'] as const;
test.setTimeout(120_000);
test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });

test('account services and website redirects are independent of app indexing', async ({ request }) => {
    const pricing = await request.get('/pricing', { maxRedirects: 0 });
    expect(pricing.status()).toBe(managed ? 200 : 404);
    for (const path of informationPages) {
        const response = await request.get(`${path}?email=private%40example.com`, { maxRedirects: 0 });
        const destination = marketingPageHref(path);
        expect(response.status(), path).toBe(destination ? 307 : 404);
        if (destination) expect(response.headers().location).toBe(destination);
    }
    const support = await request.get('/support?email=private%40example.com', { maxRedirects: 0 });
    expect(support.status()).toBe(managed ? 200 : 307);
    if (!managed) expect(support.headers().location).toBe(GITHUB_SUPPORT_URL);

    const developers = await request.get('/developers?email=private%40example.com', { maxRedirects: 0 });
    expect(developers.status()).toBe(307);
    expect(developers.headers().location).toBe(marketingPageHref('/developers')
        || 'https://github.com/virusz4274/callery/blob/main/docs/integration-api.md');

    const openapi = await request.get('/api/v1/openapi.json', { maxRedirects: 0 });
    expect(openapi.status()).toBe(200);
    expect(openapi.headers().location).toBeUndefined();
    expect(await openapi.json()).toHaveProperty('openapi');

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBe(true);
    expect((await sitemap.text()).includes('<loc>')).toBe(false);
    const robots = await request.get('/robots.txt');
    expect(await robots.text()).toContain('Disallow: /\n');

    if (!managed) {
        const response = await request.post('/api/support', { data: 'invalid JSON' });
        expect(response.status()).toBe(403);
        expect(await response.json()).toMatchObject({ supportUrl: GITHUB_SUPPORT_URL });
    }
});

test('legacy public routes never forward mutation requests to the website', async ({ request }) => {
    for (const path of [...informationPages, '/developers']) {
        const response = await request.post(path, { maxRedirects: 0, data: { private: 'app data' } });
        expect(response.headers().location, path).toBeUndefined();
    }
});

test('app homepage preserves query context through signed-out login', async ({ page, request }) => {
    const query = '?tag=one&tag=two&empty=&search=a%2Fb';
    const response = await request.get(`/${query}`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    const destination = new URL(response.headers().location, response.url());
    expect(destination.pathname).toBe('/recordings');
    expect([...destination.searchParams]).toEqual([...new URL(`/${query}`, response.url()).searchParams]);
    await page.route('**/api/auth/get-session*', route => route.fulfill({ json: null }));
    await page.route('**/api/auth/capabilities', route => route.fulfill({ json: { googleEnabled: false, emailVerificationRequired: false, passwordResetEnabled: false } }));
    await page.route('**/api/system-settings/public', route => route.fulfill({ json: { maintenanceMode: false } }));
    await page.goto(`/${query}`);
    await expect(page).toHaveURL(new RegExp('/login\\?redirect='));
    expect(new URL(page.url()).searchParams.get('redirect')).toBe(`/recordings${query}`);
    await expect(page.getByRole('link', { name: 'Back to site', exact: true })).toHaveCount(marketingHref ? 1 : 0);
    const robotsTags = page.locator('meta[name="robots"]');
    await expect(robotsTags.first()).toHaveAttribute('content', /noindex/);
    for (const tag of await robotsTags.all()) await expect(tag).toHaveAttribute('content', /noindex/);
});

test('workspace support, account links and homepage work for signed-in users', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const unexpected = await mockRecordings(page, { open: false, url: '/' });
    await expect(page).toHaveURL(/\/recordings$/);
    await expect(page.getByRole('link', { name: 'Help & support', exact: true })).toHaveAttribute('href', managed ? '/support' : GITHUB_SUPPORT_URL);
    await page.getByRole('button', { name: 'Open account menu', exact: true }).click();
    const menu = page.getByRole('menu', { name: 'Open account menu', exact: true });
    await expect(menu.getByRole('menuitem', { name: 'Help & Feedback' })).toHaveAttribute('href', managed ? '/support' : GITHUB_SUPPORT_URL);
    await expect(menu.getByRole('menuitem', { name: 'Terms of Service', exact: true })).toHaveCount(legalAvailable ? 1 : 0);
    await expect(menu.getByRole('menuitem', { name: 'Privacy Policy', exact: true })).toHaveCount(legalAvailable ? 1 : 0);
    expect(unexpected).toEqual([]);
});

test('Google Contacts consent follows availability of the public website Privacy page', async ({ page }) => {
    const unexpected = await mockRecordings(page, { open: false, url: '/settings?tab=sources' });
    await page.getByRole('button', { name: 'Connect Google', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Connect Google Account', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Privacy Policy', exact: true })).toHaveCount(legalAvailable ? 1 : 0);
    if (!legalAvailable) await expect(dialog).toContainText('Continuing allows this instance to access and sync your Google contact names');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(unexpected).toEqual([]);
});
