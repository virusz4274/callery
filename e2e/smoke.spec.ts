import { expect, test } from '@playwright/test';

function uniqueEmail() {
  return `e2e.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;
}

function silentWav() {
  const audio = Buffer.alloc(44 + 16000);
  audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVE', 8);
  audio.write('fmt ', 12); audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(1, 22); audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(16000, 28);
  audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(16000, 40);
  return audio;
}

const protectedRouteExpectations = [
  {
    route: '/recordings',
    redirect: '/recordings',
    helperCopy: 'Sign in to view your recordings.',
  },
  {
    route: '/upload',
    redirect: '/upload',
    helperCopy: 'Sign in to upload recordings.',
  },
  {
    route: '/contacts',
    redirect: '/contacts',
    helperCopy: 'Sign in to view your contacts.',
  },
  {
    route: '/files',
    redirect: '/files',
    helperCopy: 'Sign in to browse your files.',
  },
  {
    route: '/settings',
    redirect: '/settings',
    helperCopy: 'Sign in to manage your settings.',
  },
];

test('public pages load', async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_ENABLE_BILLING !== 'true', 'Managed public pages require billing.');
  await page.goto('/');
  await expect(page.locator('body')).toContainText('Call Archive & AI Search');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start free workspace', exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('The homepage now leads with');
  await expect(page.locator('body')).not.toContainText('capability story');

  await page.goto('/pricing');
  await expect(page.locator('body')).toContainText('Pricing');
  await expect(page.locator('body')).toContainText('Compare what changes');
  await expect(page.locator('body')).toContainText('Storage');
  await expect(page.locator('body')).not.toContainText('The page now shows the whole ladder at once');

  await page.goto('/support');
  await expect(page.locator('body')).toContainText('Send a support message');
});

test('signed-out protected routes redirect into login with route context', async ({ page }) => {
  for (const expectation of protectedRouteExpectations) {
    await page.goto(expectation.route, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForURL(`**/login?redirect=${encodeURIComponent(expectation.redirect)}`);
    await expect(page.locator('body')).toContainText(expectation.helperCopy);
  }
});

test('auth pages preserve redirect links and sanitize invalid redirect values', async ({ page }) => {
  await page.goto('/login?redirect=%2Fupload');
  await expect(page.getByRole('link', { name: /Create one/i })).toHaveAttribute(
    'href',
    '/signup?redirect=%2Fupload'
  );
  await expect(page.getByRole('link', { name: /Forgot password\?/i })).toHaveAttribute(
    'href',
    '/forgot-password?redirect=%2Fupload'
  );

  await page.goto('/signup?redirect=%2Fupload');
  await expect(page.getByRole('link', { name: /^Sign in$/i })).toHaveAttribute(
    'href',
    '/login?redirect=%2Fupload'
  );

  await page.goto('/forgot-password?redirect=%2Fupload');
  await expect(page.getByRole('link', { name: /Back to sign in/i })).toHaveAttribute(
    'href',
    '/login?redirect=%2Fupload'
  );

  const invalidRedirect = encodeURIComponent('https://example.com/escape');

  await page.goto(`/login?redirect=${invalidRedirect}`);
  await expect(page.locator('body')).toContainText(
    'Sign in to view your recordings.'
  );
  await expect(page.getByRole('link', { name: /Create one/i })).toHaveAttribute(
    'href',
    '/signup?redirect=%2Frecordings'
  );

  await page.goto(`/signup?redirect=${invalidRedirect}`);
  await expect(page.getByRole('link', { name: /^Sign in$/i })).toHaveAttribute(
    'href',
    '/login?redirect=%2Frecordings'
  );
});

test('mobile login shows email sign-in without an extra reveal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login?redirect=%2Fupload');

  await expect(page.getByRole('link', { name: /Back to site/i })).toHaveCount(process.env.NEXT_PUBLIC_ENABLE_BILLING === 'true' ? 1 : 0);
  const capabilities = await page.request.get('/api/auth/capabilities');
  if ((await capabilities.json()).googleEnabled) {
    await expect(page.getByRole('button', { name: /Sign in with Google/i })).toBeVisible();
  } else {
    await expect(page.getByRole('button', { name: /Sign in with Google/i })).toHaveCount(0);
  }
  await expect(page.getByPlaceholder('you@company.com')).toBeVisible();
  await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
  await expect(page.getByRole('link', { name: /Forgot password\?/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Use email/i })).toHaveCount(0);
});

test('authenticated user journey works', async ({ page }) => {
  test.setTimeout(180_000);

  const email = uniqueEmail();
  const password = 'TestPass123!';
  const recordingStem = `e2e-upload-${Date.now()}`;
  const recordingName = `${recordingStem}.wav`;

  await test.step('sign up a fresh user', async () => {
    await page.goto('/signup?redirect=%2Fupload');
    await page.getByPlaceholder('John').fill('E2E');
    await page.getByPlaceholder('Doe').fill('Smoke');
    await page.getByPlaceholder('you@company.com').fill(email);
    await page.getByPlaceholder('Minimum 8 characters').fill(password);
    await page.getByPlaceholder('Repeat your password').fill(password);
    await page.getByRole('button', { name: /Create account/i }).click();

    await page.waitForURL('**/upload', { timeout: 120_000 });
    await expect(page.getByRole('heading', { name: /Upload recordings/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: /View recordings/i })).toBeVisible();
  });

  await test.step('submit the support form', async () => {
    if (process.env.NEXT_PUBLIC_ENABLE_BILLING !== 'true') {
      const response = await page.request.post('/api/support', { data: {} });
      expect(response.status()).toBe(403);
      expect((await response.json()).supportUrl).toBe('https://github.com/virusz4274/Vosift/issues');
      return;
    }
    await page.goto('/support');
    await page.getByPlaceholder('Your name').fill('E2E Smoke');
    await page.getByPlaceholder('you@company.com').fill(email);
    await page.getByPlaceholder('What do you need help with?').fill('Automated smoke test');
    await page
      .getByPlaceholder('Describe the problem, the page you were on, and anything you already tried.')
      .fill('This is an automated support request generated by the Playwright smoke suite.');
    await page.getByRole('button', { name: /Send message/i }).click();

    await expect(page.locator('body')).toContainText(
      'Your message has been sent. We will get back to you soon.',
      { timeout: 30_000 }
    );
  });

  await test.step('upload a recording and surface it in the library', async () => {
    await page.goto('/upload');
    await page.locator('input[type="file"]').setInputFiles({
      name: recordingName,
      mimeType: 'audio/wav',
      buffer: silentWav(),
    });

    await expect(page.locator('body')).toContainText(recordingName);
    await page.getByRole('button', { name: /Upload All/i }).click();

    await expect(page.locator('body')).toContainText('Files uploaded successfully', { timeout: 60_000 });
    await expect(page.locator('body')).toContainText('Uploaded');

    await page.goto('/recordings');
    await expect(page.getByRole('heading', { name: /Recordings/i })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: /Upload recordings/i })).toBeVisible();
    await expect(page.locator('body')).toContainText(recordingStem, { timeout: 60_000 });
  });

  await test.step('workspace surfaces keep primary actions visible', async () => {
    await page.goto('/contacts');
    await expect(page.getByRole('heading', { name: /^Contacts$/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Upload recordings/i })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search contacts' })).toBeVisible();

    await page.goto('/files');
    await expect(page.getByRole('heading', { name: /^Files$/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Upload recordings/i })).toBeVisible();
    await expect(page.locator('body')).toContainText('Current folder:');
  });

  await test.step('exercise billing endpoints for the signed-in user', async () => {
    if (process.env.NEXT_PUBLIC_ENABLE_BILLING !== 'true') {
      const portal = await page.request.post('/api/stripe/portal');
      expect(portal.status()).toBe(403);
      return;
    }

    const result = await page.evaluate(async () => {
      const origin = window.location.origin;

      const invoicesResponse = await fetch('/api/stripe/invoices?limit=3');
      const invoices = await invoicesResponse.json().catch(() => null);

      const portalResponse = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl: `${origin}/settings` }),
      });
      const portal = await portalResponse.json().catch(() => null);

      return {
        invoices: {
          status: invoicesResponse.status,
          body: invoices,
        },
        portal: {
          status: portalResponse.status,
          body: portal,
        },
      };
    });

    expect(result.invoices.status).toBe(200);
    expect(Array.isArray(result.invoices.body?.invoices)).toBeTruthy();

    expect(result.portal.status).toBe(200);
    expect(typeof result.portal.body?.url).toBe('string');
    expect(result.portal.body.url).toContain('stripe.com');

    await page.goto('/pricing');
    await expect(page.locator('body')).toContainText('Pricing');
    await expect(page.locator('body')).toContainText('Compare what changes');
    await expect(page.locator('body')).toContainText('Hosting');
  });
});
