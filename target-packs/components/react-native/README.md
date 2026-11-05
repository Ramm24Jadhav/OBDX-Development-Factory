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
- The date is typed as dd/mm/yyyy on the number pad. A calendar sheet comes with the forms wave, with the same props.
- The table shows each row as a card of "header: value" pairs, so nothing scrolls sideways.
- Amounts are formatted without the platform's locale data (Hermes).

## Checks

`npm ci` then `npm run check` (Node 22): the typecheck, then Jest with React Native Testing Library for behaviour,
writeback and announcements. The same run checks every control's role, name, state and touch target. Screen reader
runs on devices, screenshots and themes are the next gates.
