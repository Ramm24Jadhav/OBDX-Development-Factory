import { defineConfig } from '@playwright/test';

/*
 * The browser gates of the premium packs. Each pack serves its gallery (every foundation component in its states);
 * the specs run the gates on it in Chromium. Screenshots are kept per platform: CI (Linux) is the reference.
 * Run: npm run gates (the packs' node_modules must be installed); npm run gates:update to accept new screenshots.
 */
const node = process.execPath;
export default defineConfig({
  testDir: 'specs',
  timeout: 120_000,
  workers: process.env.CI ? 2 : 1,
  reporter: [['list'], ['json', { outputFile: 'results/gates.json' }]],
  snapshotPathTemplate: '{testDir}/../snapshots/{platform}/{arg}{ext}',
  use: { browserName: 'chromium', deviceScaleFactor: 1, locale: 'en-GB', timezoneId: 'UTC' },
  webServer: [
    { command: `"${node}" node_modules/vite/bin/vite.js --config gallery/vite.config.ts --port 5181 --strictPort`, cwd: '../react', port: 5181, reuseExistingServer: !process.env.CI, timeout: 120_000 },
    { command: `"${node}" node_modules/vite/bin/vite.js --config gallery/vite.config.ts --port 5182 --strictPort`, cwd: '../angular', port: 5182, reuseExistingServer: !process.env.CI, timeout: 180_000 },
    { command: `"${node}" serve.mjs 5183`, port: 5183, reuseExistingServer: !process.env.CI, timeout: 30_000 },
  ],
});
