import { defineConfig, devices } from '@playwright/test';

// Tests run against the built single-file app (dist/index.html), i.e. exactly what is deployed.
// Run `npm run build` first. Locally, PW_CHANNEL=chrome uses your installed Chrome instead of
// downloading Playwright's browser.
export default defineConfig({
  testDir: 'test/e2e',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { channel: process.env.PW_CHANNEL || undefined, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined } },
    { name: 'phone', use: { ...devices['Pixel 7'], channel: process.env.PW_CHANNEL || undefined } },
  ],
});
