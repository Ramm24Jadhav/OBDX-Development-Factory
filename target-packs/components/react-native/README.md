# Premium React Native components (obdx-react-native)

The foundation set for a bank's OBDX app on Android and iOS, on React Native primitives. Colours, spacing and type
come from the bank tokens (`src/tokens.ts`, generated from `../tokens/tokens.json` by `../tools/build-tokens.js`); the
look, the press motion and dark mode follow the component style saved in the Component factory.

```tsx
import { ThemeProvider } from 'obdx-react-native';

<ThemeProvider style={componentStyle} brand="#0b5fa5">...</ThemeProvider>
```

The components and their props match the React pack (`Button`, `IconButton`, `TextField`, `AmountInput`, `Dropdown`,
`CheckboxGroup`, `RadioGroup`, `DatePicker`, `Dialog`, `Toast`, `Card`, `Tabs`, `DataTable`), with what a phone needs:

- Every control is at least 48 points tall and has a role, a name and its state for TalkBack and VoiceOver.
- Field errors are alerts (a live region on Android). Toasts are announced when they arrive.
- The dropdown opens a sheet of options. The dialog is modal for screen readers, and the back button closes it unless
  `cancelBehavior` is `none`.
- The date is typed as dd/mm/yyyy on the number pad (a calendar sheet is still to come, with the same props).
- The table shows each row as a card of "header: value" pairs, so nothing scrolls sideways.
- Amounts are formatted without the platform's locale data (Hermes).

The forms wave (0.2.0) adds `TextArea`, `PasswordField` (no suggestions, the platforms' password autofill),
`NumberInput` (the number pad and steppers), `CurrencySelector` and `MultiSelect` (sheets), `Toggle` (the platform
switch), `DateRangePicker`, `SearchField` (the keyboard's Search key), `Autocomplete` (suggestions under the field)
and `FileUpload`. React Native has no file picker of its own, so `FileUpload` takes `pick`: a function that opens the
app's document picker (expo-document-picker, for example) and resolves with the files.

## Checks

`npm ci` then `npm run check` (Node 22): the typecheck, then Jest with React Native Testing Library for behaviour,
writeback and announcements. The same run checks every control's role, name, state and touch target. `gates/` renders
the pack in a browser through react-native-web for screenshots, the light and dark themes, contrast and touch targets
(`cd gates && npm install && npm run gates`); screen reader runs stay on devices. The same run checks parity with the
JET elements (`gates/specs/parity.spec.ts`, on JET 6.2 and 21; `npm ci` in `../gates/jet6` and `../gates/jet21` first), and
`node ../gates/record.mjs` writes its results into `packs.json`.

## The banking groups

Groups 1 to 6 (`src/G1.tsx` … `src/G6.tsx`) are the components `catalogue.json` names for React Native, built on the
shared parts in `src/parts.tsx` (sheet, banner, key-value card, tiles, item list, steps, timeline, progress bars, bar
chart, segmented choice, chips, code boxes, slider), so they look and read alike. Fields take the same props as the
foundation (`testID`, `label`, `value`, `onChange`, `required`, `readOnly`, `disabled`, `helpText`, `error`); display
components take their data (`rows`, `tiles`, `items`, `steps`, with the web packs' names and shapes) and report actions as events. Account and card
numbers show only their last four digits, IBANs are checked with their check digits, codes and PINs are never kept, and
nothing calls a service: `AuthChallenge` takes the app's own biometric check as `authenticate`, as `FileUpload` takes
`pick`. Charts are plain views, so the pack needs no drawing library.

## Motion

`src/motion.tsx` is the motion layer, on React Native's own `Animated` (no Reanimated, no other library), following
`../motion.json`: enter (the component style's scroll effect: fade up, scale, slide or blur), press (its click
effect: press, bounce, or the Android ripple), shake (a field's error), pop (a chosen mark, chip or code slot), roll (a
changed number), grow (bars and meters), settle (new rows and files), spring (sheets and dialogs), slide (the chosen
tab or segment) and shimmer (a busy button, a skeleton). The shared parts carry it, so every component moves the same
way. Durations come from the bank tokens. When the device asks for reduced motion (`AccessibilityInfo`), everything
shows its end state at once.

The five effect categories (69 components, our own code) are in `TextEffects.tsx`, `MotionEffects.tsx`,
`Showcase.tsx`, `Backdrops.tsx` and `Micro.tsx`. Phones have no hover or cursor, so the hover ideas answer the finger
instead. Every gesture has a screen reader action as well, text effects read their whole text at once, and backdrops
are hidden from screen readers and take no touches.
