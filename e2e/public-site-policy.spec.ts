import { expect as baseExpect, test } from '@playwright/test';
import { GITHUB_SUPPORT_URL, publicSitePolicy } from '../src/lib/public-site-policy';
import { mockRecordings } from './fixtures/recordings';

const managed = publicSitePolicy().marketingEnabled;
const expect = baseExpect.configure({ timeout: 15_000 });
const disabledPages = ['/pricing', '/changelog', '/terms-of-service', '/privacy-policy'];
test.setTimeout(120_000);
test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });

test('public routes and discovery follow the deployment billing flag', async ({ request }) => {
    for (const path of disabledPages) {
        const response = await request.get(path, { maxRedirects: 0 });
        expect(response.status(), path).toBe(managed ? 200 : 404);
    }
    const support = await request.get('/support?email=private%40example.com', { maxRedirects: 0 });
    expect(support.status()).toBe(managed ? 200 : 307);
    if (!managed) expect(support.headers().location).toBe(GITHUB_SUPPORT_URL);

    const developers = await request.get('/developers', { maxRedirects: 0 });
    expect(developers.status()).toBe(200);

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBe(true);
    expect((await sitemap.text()).includes('<loc>')).toBe(managed);
    const robots = await request.get('/robots.txt');
    expect(await robots.text()).toContain(managed ? 'Allow: /' : 'Disallow: /\n');

    if (!managed) {
        const response = await request.post('/api/support', { data: 'invalid JSON' });
        expect(response.status()).toBe(403);
        expect(await response.json()).toMatchObject({ supportUrl: GITHUB_SUPPORT_URL });
    }
});

for (const width of [360, 1280]) {
    test(`developer documentation is public and usable at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.route('**/api/auth/get-session*', route => route.fulfill({ json: null }));
        await page.route('**/api/auth/capabilities', route => route.fulfill({ json: { googleEnabled: false, emailVerificationRequired: false, passwordResetEnabled: false } }));
        const response = await page.goto('/developers');
        expect(response?.status()).toBe(200);
        await expect(page.getByRole('heading', { level: 1, name: 'Build around your conversations.' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Read the integration guide', exact: true })).toHaveAttribute('href', 'https://github.com/virusz4274/callery/blob/main/docs/integration-api.md');
        await expect(page.getByRole('link', { name: 'Open this server’s API reference', exact: true })).toHaveAttribute('href', '/api/v1/openapi.json');
        await expect(page.getByRole('link', { name: 'Manage API keys and connected apps', exact: true })).toHaveAttribute('href', '/settings?tab=integrations');
        await expect(page.getByRole('link', { name: 'ChatGPT, Claude, and Gemini setup', exact: true })).toHaveAttribute('href', 'https://github.com/virusz4274/callery/blob/main/docs/mcp-platforms.md');
        await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Developers', exact: true })).toHaveAttribute('href', '/developers');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        if (!managed) await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
        if (width < 761) {
            await page.getByRole('button', { name: 'Site menu', exact: true }).click();
            await expect(page.getByRole('navigation', { name: 'Mobile site navigation' }).getByRole('link', { name: 'Developers', exact: true })).toBeVisible();
        } else {
            await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Developers', exact: true })).toBeVisible();
        }
    });
}

test('self-host homepage preserves query context through signed-out login', async ({ page, request }) => {
    test.skip(managed, 'Self-host workspace entry only.');
    const query = '?tag=one&tag=two&empty=&search=a%2Fb';
    const response = await request.get(`/${query}`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe(`/recordings${query}`);
    await page.route('**/api/auth/get-session*', route => route.fulfill({ json: null }));
    await page.route('**/api/auth/capabilities', route => route.fulfill({ json: { googleEnabled: false, emailVerificationRequired: false, passwordResetEnabled: false } }));
    await page.route('**/api/system-settings/public', route => route.fulfill({ json: { maintenanceMode: false } }));
    await page.goto(`/${query}`);
    await expect(page).toHaveURL(new RegExp('/login\\?redirect='));
    expect(new URL(page.url()).searchParams.get('redirect')).toBe(`/recordings${query}`);
    await expect(page.getByRole('link', { name: 'Back to site', exact: true })).toHaveCount(0);
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
    await expect(menu.getByRole('menuitem', { name: 'Terms of Service', exact: true })).toHaveCount(managed ? 1 : 0);
    await expect(menu.getByRole('menuitem', { name: 'Privacy Policy', exact: true })).toHaveCount(managed ? 1 : 0);
    expect(unexpected).toEqual([]);
});

test('Google Contacts consent follows availability of the bundled Privacy page', async ({ page }) => {
    const unexpected = await mockRecordings(page, { open: false, url: '/settings?tab=sources' });
    await page.getByRole('button', { name: 'Connect Google', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Connect Google Account', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Privacy Policy', exact: true })).toHaveCount(managed ? 1 : 0);
    if (!managed) await expect(dialog).toContainText('Continuing allows this instance to access and sync your Google contact names');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(unexpected).toEqual([]);
});
