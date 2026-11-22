import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const port = Number(process.env.PHOTO_EDITOR_TEST_PORT ?? 5187);
const baseURL = `http://127.0.0.1:${port}/app/photostudio/`;
export default defineConfig({
  ...base,
  testDir: 'tests/production',
  grepInvert: /@native-fnos/, // The Vite preview has no Go backend.
  webServer: {
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  // Its flows tolerate tracing (verified by earlier green runs), unlike the dev suite.
  use: { ...base.use, baseURL, trace: 'retain-on-failure' },
});
