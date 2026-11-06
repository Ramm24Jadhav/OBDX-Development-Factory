# OBDX Web for Angular (starter)

An Angular web app on top of the bank's OBDX REST services, created from the OBDX Development Factory's Angular
target pack. Screens are generated from approved Screen Models; this starter holds what they share.

- `src/app/components/`: the components screens are built from. The premium Angular components are a copy of the
  factory's pack, with the same skin as the premium JET pack (`bx.css`). The starter's own parts (screen frame,
  section, text area, switch, read-only value) are in `layout.ts`.
- `src/app/api/`: the client for OBDX REST services, with the session cookie and a nonce on every call that changes
  something (`config.ts`). One `<module>Api.ts` per module.
- `src/app/forms/form.ts`: field values as signals, their rules and validate().
- `src/app/i18n/`: all visible texts, by screen.
- `src/app/component-style.json`: the factory's component style (copy the workspace's from the Component factory, or
  `GET /api/workspaces/{id}/component-style`); `app.ts` puts its look, motion, dark mode and brand on the root, and
  `bx.css` draws the nine designs, Liquid glass included.
- `src/app/app.routes.ts`: the screen registry (routes).

```bash
npm install
npm start          # http://localhost:4200, calls to /digx go to the server in proxy.conf.json
npm run build      # production build in dist/
npm test
```

Versions are current at the time of the pack; align them with the bank's approved versions.
