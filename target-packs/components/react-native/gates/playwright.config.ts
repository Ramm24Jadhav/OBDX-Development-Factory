import { defineConfig } from '@playwright/test';

/*
 * The React Native pack's browser gates: its gallery (gallery.tsx, through react-native-web) in light and dark, on a
 * phone and a tablet. Screenshots are kept per platform; CI (Linux) is the reference.
 * specs/parity.spec.ts also needs the JET parity page, served from ../../gates (npm ci in its jet6 and jet21 first).
 * Run: npm install, then npm run gates (npm run gates:update to accept new screenshots).
 */
const node = process.execPath;
export default defineConfig({
  testDir: 'specs',
  timeout: 120_000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'results/gates.json' }]],
  snapshotPathTemplate: '{testDir}/../snapshots/{platform}/{arg}{ext}',
  use: { browserName: 'chromium', deviceScaleFactor: 1, locale: 'en-GB', timezoneId: 'UTC' },
  webServer: [
    { command: 'npx vite --port 5184 --strictPort', port: 5184, reuseExistingServer: !process.env.CI, timeout: 120_000 },
    { command: `"${node}" serve.mjs 5183`, cwd: '../../gates', port: 5183, reuseExistingServer: !process.env.CI, timeout: 30_000 },
  ],
});
