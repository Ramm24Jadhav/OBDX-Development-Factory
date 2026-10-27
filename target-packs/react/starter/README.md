# OBDX Web (starter)

React web app on top of the bank's OBDX REST services, created from the OBDX Development Factory's React target
pack. Screens are generated from approved Screen Models; this starter holds what they share.

- `src/components/`: the form components screens are built from (one per Screen Model component type), styled in
  `components.css`. Restyle them, or reimplement them with the bank's design system: screens do not change.
- `src/api/`: the client for OBDX REST services. One `<module>Api.ts` per module.
- `src/i18n/`: all visible texts, by screen.
- `src/navigation/routes.tsx`: the screen registry (routes).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type check and production build in dist/
npm test
```

Versions are current at the time of the pack; align them with the bank's approved versions.
