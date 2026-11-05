# Premium Angular components (obdx-angular)

The foundation set for a bank's OBDX UI in Angular: standalone components with signal inputs, `OnPush`, and the same
markup and `bx-` skin as the premium JET pack (`src/bx.css`, kept identical by the tests). The dialog's focus handling
comes from the Angular CDK (`cdkTrapFocus`). The selectors are the premium JET pack's element names, so a screen's tags carry over
from an upgraded JET screen unchanged; load one pack per page.

| Selector | Replaces | Notes |
|---|---|---|
| `bx-button`, `bx-icon-button` | `oj-button` | `(action)`, `busy` stops a second press |
| `bx-text-field` | `oj-input-text` | `[(value)]` or `[formControl]` |
| `bx-amount` | `oj-input-number` (money) | a number value, the currency's decimals, `min`, `max` |
| `bx-select` | `oj-select-single` | the native select |
| `bx-checkbox-group`, `bx-choice-group` | `oj-checkboxset`, `oj-radioset` | choices as cards |
| `bx-date` | `oj-input-date` | ISO value, `min`, `max`, `disabledDays` |
| `bx-dialog` | `oj-dialog` | `[(open)]`, buttons in `[footer]`, `cancelBehavior` |
| `bx-toast` | `oj-messages` | `(closed)` says which message to remove |
| `bx-card` | (new) | `interactive` makes it a button, `(action)` |
| `bx-tabs` | `oj-tab-bar` | `[(selection)]`, arrow keys, Home and End; `panelId()` and `tabId()` for the panels |
| `bx-data-grid` | `oj-table` | sortable headers, `[(selected)]` rows, an empty state |

Every field is a `ControlValueAccessor`, so reactive forms and `ngModel` work as well as `[(value)]`. Add `src/bx.css`
to the app's styles and put `styleClasses(style)` on the root element. `OBDX_COMPONENTS` lists all of them for a
screen's `imports`.

## Checks

`npm ci` then `npm run check` (Node 22): the typecheck, then vitest with the Angular compiler (the Analog Vite plugin,
so signal inputs compile as in a bank's build), Testing Library and axe-core on every rendered component.
