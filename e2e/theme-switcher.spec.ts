import { expect, test, type Page } from '@playwright/test';
import { mockRecordings } from './fixtures/recordings';

async function openThemePage(page: Page) {
  if (process.env.NEXT_PUBLIC_ENABLE_BILLING === 'true') await page.goto('/');
  else await mockRecordings(page, { open: false });
}

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  // Theme fixtures must retain their mocked auth responses after reloading.
  // Disable feature detection too, so registration code never runs in this browser.
  await page.addInitScript(() => { Reflect.deleteProperty(Navigator.prototype, 'serviceWorker'); });
});
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });

function collectHydrationIssues(page: Page) {
  const issues: string[] = [];
  page.on('pageerror', error => issues.push(error.message));
  page.on('console', message => {
    if (/hydration|server rendered HTML|Encountered a script tag/i.test(message.text())) {
      issues.push(message.text());
    }
  });
  return issues;
}

const scenarios = [
  { savedTheme: null, colorScheme: 'light', expectedTheme: 'light' },
  { savedTheme: null, colorScheme: 'dark', expectedTheme: 'dark' },
  { savedTheme: 'light', colorScheme: 'dark', expectedTheme: 'light' },
  { savedTheme: 'dark', colorScheme: 'light', expectedTheme: 'dark' },
  { savedTheme: 'system', colorScheme: 'light', expectedTheme: 'light' },
  { savedTheme: 'system', colorScheme: 'dark', expectedTheme: 'dark' },
] as const;

for (const { savedTheme, colorScheme, expectedTheme } of scenarios) {
  test(`theme hydrates with ${savedTheme ?? 'no saved preference'} and ${colorScheme} system mode`, async ({ page }) => {
    const issues = collectHydrationIssues(page);
    await page.emulateMedia({ colorScheme });
    await page.addInitScript(theme => {
      if (theme === null) localStorage.removeItem('theme');
      else localStorage.setItem('theme', theme);
    }, savedTheme);

    await openThemePage(page);
    await expect(page.locator('html')).toHaveClass(expectedTheme);
    await page.getByRole('button', { name: 'Theme mode', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'System', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    expect(issues).toEqual([]);
  });
}

test('theme choices persist across reloads and navigation and follow system changes', async ({ page }) => {
  const issues = collectHydrationIssues(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await openThemePage(page);
  const trigger = page.getByRole('button', { name: 'Theme mode', exact: true });

  for (const choice of ['Light', 'Dark', 'System']) {
    await trigger.click();
    await page.getByRole('menuitem', { name: choice, exact: true }).click();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.locator('html')).toHaveClass(choice === 'Light' ? 'light' : 'dark');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(choice.toLowerCase());
  }

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveClass('light');
  await trigger.click();
  await page.getByRole('menuitem', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveClass('dark');
  await page.reload();
  await expect(trigger).toBeVisible();
  await expect(page.locator('html')).toHaveClass('dark');

  if (process.env.NEXT_PUBLIC_ENABLE_BILLING === 'true') {
    await page.getByRole('navigation', { name: 'Main navigation', exact: true })
    .getByRole('link', { name: 'Pricing', exact: true }).click();
    await expect(page).toHaveURL(/\/pricing$/);
  } else {
    await page.getByRole('navigation', { name: 'Workspace tools', exact: true })
      .getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
  }
  await trigger.click();
  await expect(page.getByRole('menuitem', { name: 'Dark', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveClass('dark');
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
  expect(issues).toEqual([]);
});
