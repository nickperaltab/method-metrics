import { defineConfig } from '@playwright/test';

const TRACKER_URL = 'https://nickperaltab.github.io/method-metrics/tracker.html';
const BUILDER_URL = 'https://method-metrics-builder.vercel.app';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'tracker',
      testMatch: /tracker\.spec\.js/,
      use: {
        baseURL: TRACKER_URL,
      },
    },
    {
      name: 'builder',
      testMatch: /builder\.spec\.js/,
      use: {
        baseURL: BUILDER_URL,
      },
    },
    {
      name: 'dashboards',
      testMatch: /dashboards\.spec\.js/,
      use: {
        baseURL: BUILDER_URL,
      },
    },
  ],
});
