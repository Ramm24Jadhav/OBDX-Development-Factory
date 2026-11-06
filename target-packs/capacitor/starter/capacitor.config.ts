import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The native shell around the web screens. Calls go through the platform's HTTP stack (CapacitorHttp) with its cookie
 * store (CapacitorCookies), so the OBDX session cookie is kept and sent as in a browser, and the bank's server needs no
 * CORS change. Pages are served over https from the device; no live-reload server in builds for customers.
 */
const config: CapacitorConfig = {
  appId: 'com.bank.obdx',
  appName: 'Online banking',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  ios: { limitsNavigationsToAppBoundDomains: true },
  plugins: {
    CapacitorHttp: { enabled: true },
    CapacitorCookies: { enabled: true },
  },
};

export default config;
