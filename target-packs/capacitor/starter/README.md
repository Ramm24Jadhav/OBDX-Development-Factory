# OBDX mobile app (Capacitor)

The starter of the Capacitor target pack: the React web app of the React pack (Vite, TypeScript, the same components,
form handling, texts and screens) inside a Capacitor shell for Android and iOS. One team builds the screens once;
they run in the browser and in the app.

```bash
npm install
npm run dev               # the screens in a browser, with /digx proxied to VITE_OBDX_URL (set it in .env)
npm test                  # Vitest and Testing Library, as in the React app
npx cap add android       # once: creates android/ (Android Studio and Gradle)
npx cap add ios           # once: creates ios/ (Xcode)
npm run cap:sync          # builds dist/ and copies it into both apps
npm run android           # opens Android Studio; npm run ios opens Xcode
```

- `src/components`, `src/forms`, `src/i18n`, `src/screens`: the same as the React pack's starter (a test keeps the
  components identical), so a screen generated for React works here unchanged.
- `src/api/client.ts`: every OBDX call, with the session cookie and a nonce on each call that changes something. In
  the app the calls go through the platform's HTTP stack (`CapacitorHttp` in `capacitor.config.ts`), so the cookie is
  kept as in a browser; set `VITE_OBDX_BASE_URL` to the bank's https address before `cap:sync`.
- `src/native/device.ts`: the Android back button. Add device features (biometric sign-in, sharing a receipt) as
  Capacitor plugins here, behind `isNative()`, so the screens still run in a browser.
- Nothing secret is kept on the device: no passwords, tokens or one-time codes in Preferences or local storage; OBDX
  keeps the session.
