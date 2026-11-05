# Premium React components (obdx-react)

The foundation set for a bank's OBDX UI rebuilt in React 19. The components render the same markup and `bx-` classes
as the premium JET pack and use its skin (`src/bx.css`, a copy the tests keep identical), so a module moved to React
looks the same as the screens upgraded in JET. Dialog and tabs take their behaviour from Radix; the other controls are
native elements, which every screen reader and phone already knows.

| Component | Replaces | Notes |
|---|---|---|
| `Button`, `IconButton` | `oj-button` | `chroming` callToAction, solid, outlined, borderless, danger; `busy` stops a second press |
| `TextField` | `oj-input-text` | `maxLength` with a counter, `clearable` |
| `AmountInput` | `oj-input-number` (money) | a number value, the currency's decimals, `min`, `max` |
| `Dropdown` | `oj-select-single`, `oj-select-one` | the native select; clearing gives no value |
| `CheckboxGroup`, `RadioGroup` | `oj-checkboxset`, `oj-radioset` | choices as cards, in a fieldset with a legend |
| `DatePicker` | `oj-input-date` | ISO value, `min`, `max`, `disabledDays` |
| `Dialog` | `oj-dialog` | focus moves in, stays inside and goes back; `cancelBehavior="none"` for a step that must be answered |
| `Toast` | `oj-messages` | errors are alerts that stay; others are status messages that close after five seconds |
| `Card` | (new) | `onAction` makes the whole card a button |
| `Tabs` | `oj-tab-bar` | arrow keys, Home and End; panels tied to their tabs |
| `DataTable` | `oj-table` | sortable headers (`aria-sort`), single or multiple selection, an empty state |

Every field takes the same props as the starter's components (`testID`, `label`, `value`, `onChange`, `required`,
`readOnly`, `disabled`, `helpText`, `placeholder`, `error`). Validation rules come from the screen through `error`; a
field checks only required and its own format, after the customer leaves it.

## Use

```tsx
import './bx.css';
import { styleClasses } from 'obdx-react';

<div className={styleClasses(componentStyle)} style={{ '--bx-brand': '#0b5fa5' } as React.CSSProperties}>...</div>
```

## Checks

`npm ci` then `npm run check` (Node 22): the typecheck, and vitest with Testing Library for behaviour, keyboard and
writeback, and axe-core on every rendered component. Colour contrast needs a real browser and is part of the browser
gates, with the visual, theme and phone-to-laptop checks.
