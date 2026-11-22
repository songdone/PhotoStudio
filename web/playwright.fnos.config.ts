import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testDir: 'tests/production',
  testMatch: ['i18n.spec.ts', 'i18n-files.spec.ts', 'fnos.spec.ts', 'fnos-launch.spec.ts', 'fnos-save.spec.ts', 'fnos-startup.spec.ts'],
  outputDir: process.env.PHOTO_TEST_OUTPUT ?? 'test-results/fnos',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: { ...base.use, baseURL: process.env.PHOTO_TEST_URL ?? 'http://127.0.0.1:18764/app/photostudio/', screenshot: 'only-on-failure' },
  webServer: undefined,
});
