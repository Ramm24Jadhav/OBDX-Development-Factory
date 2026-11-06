import { defineConfig } from '@playwright/test';

/*
 * The React Native pack's browser gates: its gallery (gallery.tsx, through react-native-web) in light and dark, on a
 * phone and a tablet. Screenshots are kept per platform; CI (Linux) is the reference.
 * Run: npm install, then npm run gates (npm run gates:update to accept new screenshots).
 */
export default defineConfig({
  testDir: 'specs',
  timeout: 120_000,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'results/gates.json' }]],
  snapshotPathTemplate: '{testDir}/../snapshots/{platform}/{arg}{ext}',
  use: { browserName: 'chromium', deviceScaleFactor: 1, locale: 'en-GB', timezoneId: 'UTC' },
  webServer: { command: 'npx vite --port 5184 --strictPort', port: 5184, reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
