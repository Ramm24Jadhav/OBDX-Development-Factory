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
- The design: `src/component-style.json` is the factory's component style (copy the workspace's from the Component
  factory, or `GET /api/workspaces/{id}/component-style`); `style.ts` and `components/looks.css` draw its nine designs,
  Liquid glass included, the same files as the Vue starter.
- Nothing secret is kept on the device: no passwords, tokens or one-time codes in Preferences or local storage; OBDX
  keeps the session.

## The Angular app in the same shell

When the bank's web app is the Angular pack's app, wrap it instead of starting from this starter:

```bash
node target-packs/capacitor/wrap-angular.mjs <the Angular app folder>
```

It adds this starter's `capacitor.config.ts` (with `webDir` pointing at the Angular build, `dist/<project>/browser`)
and `src/native/device.ts` (as `src/app/native/device.ts`), adds this starter's `component-style.json` as
`src/app/component-style.json` when the app has none (the Angular starter reads it for its design), calls `startNative()` in `src/main.ts`, and adds the
Capacitor packages and the `cap:sync` (`ng build && cap sync`), `android` and `ios` scripts at this starter's
versions. Running it again changes nothing. Then `npm install`, `npx cap add android`, `npx cap add ios` and the
commands above. Set `baseUrl` in `src/app/api/config.ts` to the bank's https address before `cap:sync`: in the app the
screens are served from the device. The factory sees `angular.json` in the app folder and writes the screens as
Angular pages from the Angular pack, not React ones.
