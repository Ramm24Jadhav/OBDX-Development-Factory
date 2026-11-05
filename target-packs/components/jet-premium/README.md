# Premium Oracle JET pack (obdx-jet)

The premium components for a bank's OBDX UI, as `bx-` elements that take the attributes and events of the Oracle JET
elements they replace, so a screen's Knockout bindings stay as they are and only the element changes. Built for
Oracle JET 6 (the release OBDX 22.1 ships) to JET 19: each element registers with `ojs/ojcomposite`, views use only
`oj-bind-*` and `:attr` bindings, and no CSS or text loader plugin is needed.

## The foundation set (0.1.0)

| Element | Replaces | Notes |
|---|---|---|
| `bx-button` | `oj-button` | `chroming` callToAction (primary), solid, outlined, borderless, danger; `on-oj-action` |
| `bx-icon-button` | `oj-button display="icons"` | `label` names it for screen readers |
| `bx-text-field` | `oj-input-text` | `value`, `raw-value`, `converter`, `validators`, `messages-custom`, `help.instruction`, `length.max`, `clear-icon` |
| `bx-amount` | `oj-input-number` (money) | a number `value`, `currency`, `min`, `max`, `converter` |
| `bx-select` | `oj-select-single`, `oj-select-one` | `options` or a JET `data` provider, `item-text`, `value-item` |
| `bx-checkbox-group` | `oj-checkboxset` | choices as cards, `value` is an array |
| `bx-choice-group` | `oj-radioset` | choices as cards |
| `bx-date` | `oj-input-date` | an ISO `value` (yyyy-mm-dd), `min`, `max`, `disabled-days` (a list or a function) |
| `bx-dialog` | `oj-dialog` | `dialog-title`, `cancel-behavior`, `open()`, `close()`, `on-oj-open`, `on-oj-before-close`, `on-oj-close`; focus kept inside |
| `bx-toast` | `oj-messages` | `messages` (`severity`, `summary`, `detail`, `autoTimeout`); errors stay until closed |
| `bx-card` | (new) | `heading`, `subheading`, `interactive`, slots for the body and `actions` |
| `bx-tabs` | `oj-tab-bar` | `selection` (writes back), `options` or `data`; arrow keys, Home, End |
| `bx-data-grid` | `oj-table` | `data` (array or provider), `columns` (`headerText`, `field`, `sortable`, `style`), `selection-mode`, `selected`, `on-oj-sort` |

What each JET attribute becomes, and what does not carry over, is in `../mapping/jet-premium.json`.

## Install in the bank's UI

1. Copy `bx/` into the UI's `js/bx` (next to the other libraries).
2. Add the path to the RequireJS configuration (`main.js`, or `path_mapping.json` for an ojet build): `bx: 'bx'`.
3. Link the skin once: `<link rel="stylesheet" href="js/bx/bx.css">`.
4. Load the elements once, for example in `appController.js`: `require(['bx/bx'])`.
5. Set the bank's colours and the component style on the page's root element:
   `<body class="bx-theme bx-look-elevated bx-motion-hover-lift bx-motion-click-press" style="--bx-brand: #0b5fa5; --bx-brand-2: #0a4c86">`.

The factory adds the pack to a bank's code as part of the first wave of the UI path, so a change never depends on a
copy someone made by hand.

## Design options and motion

The look follows classes on any ancestor, the same values as the component style saved in the Component factory:
`bx-look-elevated` (default), `bx-look-soft`, `bx-look-glass`, `bx-look-outline`, `bx-look-vivid`, `bx-look-pill`,
`bx-look-brutal`, `bx-look-redwood`; `bx-motion-hover-lift|glow|shine`, `bx-motion-click-press|ripple|bounce`,
`bx-motion-scroll-fadeup|scale|slide|blur`; `bx-dark` for the dark theme. Motion stops under
`prefers-reduced-motion`.

## Checks

`test/run.js` runs with Node alone (and with every factory build): the view models as JET runs them (writeback,
validators and converters, events, keyboard, sorting and selection) and the markup accessibility needs (labels tied to
controls, messages announced, roles, header scopes, names on icon buttons), and that the views use only bindings
JET 6 has. Rendering checks in a browser (axe, visual snapshots, themes, phone to laptop) and parity tests against
the JET elements are the next gates; a component shows as Available only once they pass.
