# The bank's web app (Oracle JET Core Pack)

A new web app in Oracle JET (VDOM: Preact and TypeScript) with the Core Pack components (`oj-c-*`) and the Redwood
theme, on the bank's OBDX REST services, written by the OBDX Development Factory. The bank's existing OBDX JET UI and
the OBDX services stay as they are. The project is the one `ojet create --vdom --template=basic` makes, with Jest
testing (`ojet add testing --jest`).

- `src/components`: the components screens are built from, wrapping the Core Pack elements with the same props as
  the factory's other target packs (testID, label, value, onChange, error ...); `app.tsx` shows the page the address
  asks for.
- `src/api`: `client.ts` sends the session cookie with every call and a fresh nonce with every call that changes
  something (`config.ts`); one `<module>Api.ts` file per module.
- `src/forms/useForm.ts`: a screen's values, rules and messages. `src/i18n/en.json`: every visible text, read with
  `t('screenKey.name')`. `src/navigation/routes.tsx`: the pages by path.
- `src/screens/<module>/<Screen>Page.tsx`: the screens, each with a test in `__tests__`.

    npm install
    npm run serve        # ojet serve
    npm run typecheck    # TypeScript with the Core Pack's element types
    npm test             # Jest with the JET preset
