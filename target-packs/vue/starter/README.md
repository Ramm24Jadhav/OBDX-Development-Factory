# OBDX web app (Vue 3)

The starter of the Vue 3 target pack: a Vite app in TypeScript with single-file components (`<script setup lang="ts">`)
that calls the bank's OBDX REST services.

```bash
npm install
npm run dev        # http://localhost:5173, with /digx proxied to VITE_OBDX_URL (set it in .env)
npm test           # Vitest and @vue/test-utils
npm run build      # vue-tsc, then the static build in dist/ for Oracle HTTP Server
```

- `src/components`: the form components every generated screen uses (TextField, TextArea, NumberField, AmountField,
  DateField, SelectField, AccountField, RadioGroup, CheckboxGroup, SwitchField, ReadOnlyField, Button, Section,
  Screen). Fields take `v-model` and `testID`, `label`, `error`, `required`, `readOnly`, `helpText`, `placeholder`,
  `maxLength`, `options`. Restyle `components.css` (or rebuild the components on the bank's design system); generated
  screens keep working.
- `src/forms/useForm.ts`: the values, the messages and `validate()` of a screen.
- `src/api/client.ts`: every OBDX call, with the session cookie and a nonce on each call that changes something
  (`src/api/config.ts` says which service gives it and the header it goes in).
- `src/i18n`: the texts (`t('screenKey.name')`).
- The design: `src/component-style.json` is the factory's component style (the factory writes the workspace's there: its
  starter download `/api/workspaces/{id}/targets/{target}/starter.zip`, and changes). `style.ts` puts its look, motion, dark mode and brand on the
  page, and `components/looks.css` draws the nine designs: Elevated, Soft, Glass, Outline, Vivid, Pill, Neo-brutalist,
  Redwood and Liquid glass. Liquid glass frosts sections and buttons and keeps fields solid; it falls back to a solid
  surface for reduced transparency, system colours under forced colours, and a 92% surface without backdrop-filter.
- Motion follows `target-packs/components/motion.json` with the bank's `--bx-dur-*` and `--bx-ease-*` tokens: sections
  rise in, a field shakes once when its error appears, a chosen option pops, a busy button shimmers. Under reduced
  motion nothing moves.
