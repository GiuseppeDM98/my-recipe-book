import { defineConfig, devices } from '@playwright/test';

// Base config for guided-testing sessions against `npm run dev` + `npm run emulators`.
// Throwaway per-session test scripts live in e2e/scratch/ (gitignored) and are written
// fresh for each collaudo, per the guided-testing protocol.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
