import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Optional mobile browser checks reuse the saved origin and fully mocked workflows.
export default defineConfig({
  ...base,
  outputDir: './test-results/webkit',
  testMatch: ['mobile-workspace.spec.ts', 'transcription-dialog.spec.ts', 'contacts.spec.ts'],
  projects: [{ name: 'mobile-webkit', use: { ...devices['iPhone 13'], serviceWorkers: 'block' } }],
});
