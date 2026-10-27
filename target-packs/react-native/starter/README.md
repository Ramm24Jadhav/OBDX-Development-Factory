# OBDX Mobile (starter)

React Native app (Expo) on top of the bank's OBDX REST services, created from the OBDX Development Factory's React
Native target pack. Screens are generated from approved Screen Models; this starter holds what they share.

- `src/components/`: the form components screens are built from (one per Screen Model component type). Restyle them,
  or reimplement them with the bank's design system: screens do not change.
- `src/api/`: the client for OBDX REST services (base URL, JSON, errors). One `<module>Api.ts` per module.
- `src/i18n/`: all visible texts, by screen.
- `src/navigation/`: the screen registry and navigation.

```bash
npm install
npm start          # Expo: scan the QR code with Expo Go on a phone, or press a / i for an emulator
npm run typecheck
npm test
```

Set the OBDX server in `src/api/config.ts`. Versions follow Expo SDK 58; align them with the bank's approved versions.
