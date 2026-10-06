import { expect, test } from '@playwright/test';

// HTTP fixtures must bypass the service worker to intercept auth responses.
test.use({ serviceWorkers: 'block' });

test('email signup, password controls, logout and login preserve the destination', async ({ page }) => {
    test.setTimeout(90_000);
    const capabilities = await (await page.request.get('/api/auth/capabilities')).json();
    test.skip(capabilities.emailVerificationRequired, 'This journey uses the testing email configuration.');
    const email = `auth.${Date.now()}@example.com`;
    const password = 'AuthSmokePassword123!';
    await page.goto('/signup?redirect=%2Fcontacts');
    await page.getByPlaceholder('John').fill('Auth');
    await page.getByPlaceholder('Doe').fill('Smoke');
    await page.getByPlaceholder('you@company.com').fill(email);
    await page.getByPlaceholder('Minimum 8 characters').fill(password);
    await page.getByPlaceholder('Repeat your password').fill(password);
    await page.getByRole('button', { name: /Create account/i }).click();
    await page.waitForURL('**/contacts');
    await expect(page.getByRole('heading', { name: /^Contacts$/ })).toBeVisible();
    expect((await page.context().cookies()).some(cookie => cookie.name.includes('session_token') && cookie.httpOnly)).toBe(true);
    const profile = await page.request.get('/api/user/profile');
    expect(profile.ok()).toBe(true);
    await page.goto('/settings?tab=profile');
    await expect(page.getByRole('textbox', { name: 'Current Password', exact: true })).toBeVisible();
    await page.route('**/api/auth/list-accounts', route => route.fulfill({ json: [
        { id: 'google-fixture', providerId: 'google', accountId: 'fixture' },
    ] }));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Personal information', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Current Password', exact: true })).toHaveCount(0);
    await page.unroute('**/api/auth/list-accounts');
    const logout = page.waitForResponse(response => response.url().endsWith('/api/auth/sign-out'));
    await page.getByRole('button', { name: 'Open account menu' }).click();
    await page.getByRole('menuitem', { name: 'Log Out' }).click();
    expect((await logout).ok()).toBe(true);
    expect((await page.request.get('/api/user/profile')).status()).toBe(401);
    await page.goto('/login?redirect=%2Fupload');
    await page.getByPlaceholder('you@company.com').fill(email);
    await page.getByPlaceholder('Enter your password').fill(password);
    await page.getByRole('button', { name: /^Sign In$/i }).click();
    await page.waitForURL('**/upload');
});

test('verification-required signup displays check-email confirmation without entering the workspace', async ({ page }) => {
    await page.route('**/api/auth/capabilities', route => route.fulfill({ json: {
        googleEnabled: false, emailVerificationRequired: true, passwordResetEnabled: true,
    } }));
    await page.route('**/api/auth/sign-up/email', route => route.fulfill({ json: {
        token: null, user: { id: 'fixture', email: 'verify@example.com', name: 'Verify Fixture', emailVerified: false },
    } }));
    await page.goto('/signup?redirect=%2Fupload');
    await page.getByPlaceholder('John').fill('Verify');
    await page.getByPlaceholder('Doe').fill('Fixture');
    await page.getByPlaceholder('you@company.com').fill('verify@example.com');
    await page.getByPlaceholder('Minimum 8 characters').fill('FixturePassword123!');
    await page.getByPlaceholder('Repeat your password').fill('FixturePassword123!');
    await page.getByRole('button', { name: /Create account/i }).click();
    await expect(page.getByText(/Check your email for a verification link/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/login?redirect=%2Fupload');
    expect(new URL(page.url()).pathname).toBe('/signup');
});

test('testing configuration presents recovery as unavailable', async ({ page }) => {
    await page.route('**/api/auth/capabilities', route => route.fulfill({ json: {
        googleEnabled: false, emailVerificationRequired: false, passwordResetEnabled: false,
    } }));
    await page.goto('/forgot-password?redirect=%2Fcontacts');
    await expect(page.getByText(/Password recovery is unavailable/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to sign in', exact: true })).toHaveAttribute('href', '/login?redirect=%2Fcontacts');
});
