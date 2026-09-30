import { defineConfig } from '@playwright/test';

const SWIFTSHADER = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8787',
    viewport: { width: 960, height: 540 },
    launchOptions: { args: SWIFTSHADER },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node apps/server/src/main.ts --port 8787 --static apps/client/dist',
    url: 'http://127.0.0.1:8787/health',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
