import { expect, test, type Page, type Request } from '@playwright/test';

const marketingRoutes = ['/', '/pricing', '/support', '/changelog', '/privacy-policy', '/terms-of-service'];
const leakedCopy = /\bsandbox\b|\bvosift\b|run pricing setup|\blanes?\b|\brollout\b|the homepage now|capability story|the page now shows/i;
const backendError = 'Sandbox VoSift internal_catalog_fixture: secret implementation detail';
const supportMessage = {
  name: 'Marketing Test',
  email: 'marketing-test@example.com',
  subject: 'Finding a recording',
  message: 'I need help finding an existing recording in my archive.',
  companyWebsite: '',
};

test.use({ serviceWorkers: 'block' });
test.setTimeout(120_000);
test.beforeEach(async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_ENABLE_BILLING !== 'true', 'Marketing pages require the managed deployment policy.');
  // No test in this suite can submit a message or start a real checkout.
  await page.route('**/api/support', route => route.fulfill({ status: 500, json: { error: backendError } }));
  await page.route('**/api/stripe/checkout', route => route.fulfill({ status: 500, json: { error: backendError } }));
});
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });

async function fillSupportForm(page: Page) {
  await expect(page.getByRole('button', { name: 'Theme mode', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: /^Name\*?$/ }).fill(supportMessage.name);
  await page.getByRole('textbox', { name: /^Email\*?$/ }).fill(supportMessage.email);
  await page.getByRole('textbox', { name: /^Subject\*?$/ }).fill(supportMessage.subject);
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill(supportMessage.message);
}

function expectCheckoutContract(request: Request, planKey: string) {
  expect(request.method()).toBe('POST');
  expect(request.postDataJSON()).toEqual({
    planKey,
    priceId: expect.stringMatching(/^price_/),
    catalogVersion: expect.any(String),
    successUrl: '/settings?tab=billing&success=true',
    cancelUrl: '/pricing?canceled=true',
  });
  expect(request.postDataJSON().catalogVersion).not.toBe('');
}

for (const width of [360, 768, 1440]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`all public pages remain readable at ${width}px in ${colorScheme} mode`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.addInitScript(() => localStorage.setItem('theme', 'system'));

      for (const route of marketingRoutes) {
        await test.step(route, async () => {
          const response = await page.goto(route);
          expect(response?.status()).toBe(200);
          await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));
          await expect(page.getByRole('main')).toHaveCount(1);
          await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          await expect(page.locator('main main')).toHaveCount(0);
          await expect(page.locator('body')).not.toContainText(leakedCopy);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

          const footer = page.getByRole('contentinfo');
          await expect(footer.getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute('href', '/privacy-policy');
          await expect(footer.getByRole('link', { name: 'Terms', exact: true })).toHaveAttribute('href', '/terms-of-service');
          await expect(footer.getByRole('link', { name: 'Updates', exact: true })).toHaveAttribute('href', '/changelog');
          await expect(footer.getByRole('link', { name: /self.host/i })).toBeVisible();

          const publicMetadata = await page.locator('head').evaluate(head => [
            head.querySelector('title')?.textContent,
            head.querySelector('meta[name="description"]')?.getAttribute('content'),
            head.querySelector('meta[property="og:title"]')?.getAttribute('content'),
            head.querySelector('meta[property="og:description"]')?.getAttribute('content'),
            head.querySelector('meta[name="twitter:title"]')?.getAttribute('content'),
            head.querySelector('meta[name="twitter:description"]')?.getAttribute('content'),
          ].filter(Boolean).join(' '));
          expect(publicMetadata).not.toMatch(leakedCopy);
          expect(publicMetadata).toContain('Callery');

          const structuredCopy = await page.locator('script[type="application/ld+json"]').evaluateAll(scripts => {
            const copy: string[] = [];
            const visit = (value: unknown, field = '') => {
              if (typeof value === 'string') {
                if (['name', 'description', 'featureList', 'text'].includes(field)) copy.push(value);
              } else if (Array.isArray(value)) value.forEach(item => visit(item, field));
              else if (value && typeof value === 'object') {
                Object.entries(value).forEach(([key, item]) => visit(item, key));
              }
            };
            scripts.forEach(script => visit(JSON.parse(script.textContent || '{}')));
            return copy.join(' ');
          });
          expect(structuredCopy).not.toMatch(leakedCopy);
        });
      }
    });
  }
}

test('home explains existing recordings with a static, clearly labeled example', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Find the details in your recorded calls.');
  await expect(page.getByRole('link', { name: 'Start free trial', exact: true }).first()).toHaveAttribute('href', '/signup');
  const howItWorks = page.getByRole('link', { name: 'See how it works', exact: true });
  await expect(howItWorks).toHaveAttribute('href', '#how-it-works');
  await howItWorks.click();
  await expect(page.locator('#how-it-works')).toBeInViewport();
  const example = page.getByRole('figure', { name: 'Example call', exact: true });
  await expect(example).toBeVisible();
  await expect(example).toContainText(/delivery/i);
  await expect(example).toContainText(/summary/i);
  await expect(example).toContainText(/transcript/i);
  await expect(example.locator('button, input, textarea, select, audio[controls], [role="button"], [role="searchbox"]')).toHaveCount(0);
  await expect(page.getByRole('table', { name: /compare/i })).toHaveCount(0);
});

test('desktop navigation and theme choices work with the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  const pricing = navigation.getByRole('link', { name: 'Pricing', exact: true });
  await pricing.focus();
  await expect(pricing).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(navigation.getByRole('link', { name: 'Pricing', exact: true })).toHaveAttribute('aria-current', 'page');

  const theme = page.getByRole('button', { name: 'Theme mode', exact: true });
  for (const choice of ['Light', 'Dark', 'System']) {
    await theme.focus();
    await page.keyboard.press('Enter');
    const option = page.getByRole('menuitem', { name: choice, exact: true });
    await option.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${choice === 'Light' ? 'light' : 'dark'}\\b`));
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(choice.toLowerCase());
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
});

test('mobile navigation opens, closes with Escape, and follows links', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  // The footer theme control is rendered only after client hydration completes.
  await expect(page.getByRole('button', { name: 'Theme mode', exact: true })).toBeVisible();
  const menu = page.getByRole('button', { name: 'Site menu', exact: true });
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  const navigation = page.getByRole('navigation', { name: 'Mobile site navigation', exact: true });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();
  await page.keyboard.press('Enter');
  await navigation.getByRole('link', { name: 'Pricing', exact: true }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});

for (const route of ['/privacy-policy', '/terms-of-service']) {
  test(`${route} contents links point to readable sections`, async ({ page }) => {
    await page.goto(route);
    const links = page.getByRole('main').locator('a[href^="#"]');
    expect(await links.count()).toBeGreaterThan(0);
    for (const link of await links.all()) {
      const href = await link.getAttribute('href');
      const id = decodeURIComponent(href!.slice(1));
      expect(await page.evaluate(sectionId => Boolean(document.getElementById(sectionId)), id)).toBe(true);
    }
    const first = links.first();
    await first.click();
    expect(new URL(page.url()).hash).toBe(await first.getAttribute('href'));
  });
}

test('support validates before sending and retains its empty spam trap', async ({ page }) => {
  let submitted = false;
  await page.route('**/api/support', async route => { submitted = true; await route.fulfill({ json: { success: true } }); });
  await page.goto('/support');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  expect(await page.locator('#support-form').evaluate(form => (form as HTMLFormElement).checkValidity())).toBe(false);
  expect(submitted).toBe(false);
  const honeypot = page.locator('#support-company-website');
  await expect(honeypot).toHaveValue('');
  await expect(honeypot).toHaveAttribute('tabindex', '-1');
  await expect(honeypot.locator('..')).toHaveAttribute('aria-hidden', 'true');
});

for (const status of [200, 400, 403, 429, 500, 'network'] as const) {
  test(`support handles ${status} without exposing backend details or sending a real message`, async ({ page }) => {
    let body: unknown;
    await page.route('**/api/support', async route => {
      body = route.request().postDataJSON();
      if (status === 'network') return route.abort('failed');
      return route.fulfill({ status, json: status === 200 ? { success: true } : { error: backendError } });
    });
    await page.goto('/support');
    await fillSupportForm(page);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    const alert = page.locator('#support-form').getByRole(status === 200 ? 'status' : 'alert');
    await expect(alert).toBeVisible();
    expect(body).toEqual(supportMessage);
    await expect(alert).not.toContainText(backendError);
    await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeEnabled();
    if (status === 200) {
      await expect(alert).toContainText('Message sent. We’ll reply by email.');
      await expect(page.getByRole('textbox', { name: /^Subject\*?$/ })).toHaveValue('');
      await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
    } else {
      await expect(alert).toContainText(/try again|reload|wait|email/i);
      await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(supportMessage.message);
    }
  });
}

for (const outcome of ['unauthorized', 'error', 'success'] as const) {
  test(`checkout ${outcome} preserves the published offer contract without starting a real payment`, async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('button', { name: 'Theme mode', exact: true })).toBeVisible();
    const choose = page.getByRole('button', { name: /^Choose (Standard|Pro|Lifetime)$/ }).first();
    test.skip(await choose.count() === 0, 'The published catalog has no purchasable marketing offer.');
    const planKey = await choose.locator('xpath=ancestor::article').getAttribute('data-plan-key');
    expect(['standard', 'pro', 'lifetime']).toContain(planKey);
    let checkoutRequest: Request | undefined;
    await page.route('**/api/stripe/checkout', async route => {
      checkoutRequest = route.request();
      return route.fulfill({
        status: outcome === 'unauthorized' ? 401 : outcome === 'error' ? 500 : 200,
        json: outcome === 'success' ? { url: '/pricing?mock-checkout=complete' } : { error: backendError },
      });
    });
    await choose.click();
    await expect.poll(() => checkoutRequest !== undefined).toBe(true);
    expectCheckoutContract(checkoutRequest!, planKey!);
    if (outcome === 'unauthorized') {
      await expect(page).toHaveURL(/\/login\?redirect=(?:%2F|\/)pricing$/);
    } else if (outcome === 'success') {
      await expect(page).toHaveURL(/\/pricing\?mock-checkout=complete$/);
    } else {
      const alert = page.getByRole('main').getByRole('alert');
      await expect(alert).toContainText(/try again|support/i);
      await expect(alert).not.toContainText(backendError);
      await expect(choose).toBeEnabled();
    }
  });
}
