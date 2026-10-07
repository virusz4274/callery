import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// Read the shared deployment configuration without changing the file or shell overrides.
loadEnv({ path: new URL('.env', import.meta.url), quiet: true, override: false });
const configuredBaseURL = process.env.TEST_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: configuredBaseURL || 'http://localhost:9000',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: configuredBaseURL ? undefined : {
    command: 'pnpm dev',
    url: 'http://localhost:9000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
