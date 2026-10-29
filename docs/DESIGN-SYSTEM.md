# Design system

How the factory UI looks and which shared pieces pages use. The approved reference is the "Design System" image (screen
24 in the design set); the 23 screen designs are in `design/design and implementation plan.docx`.

## Audit (starting point)

- Stack: Oracle JET 21 (Knockout, RequireJS, Redwood theme), one stylesheet `factory-ui/src/css/app.css` (about 5,900
  lines) and per-page views and view models. No CSS preprocessor, no component framework beyond JET.
- 242 different hard-coded colours, mostly Tailwind-like slate and blue values; only 9 CSS variables.
- Controls are mixed: 345 native buttons and 96 `oj-button`, 57 native selects and 18 `oj-select-single`, 52
  `oj-input-text`. Every page has its own pill, pager, chip and split-button styles.
- No shared toast, dialog, tooltip or carousel; 18 places use `window.confirm` / `window.alert`.
- No dark theme. Build: `npx ojet build` passes; the server and its tests build on GitHub CI.

## Plan

1. **Foundations** (`app.css` top): design tokens as CSS variables for colour, type, spacing, radius, elevation, focus
   and motion; a dark theme that only redefines the tokens (`<html data-theme="dark">`, plus JET's
   `oj-color-invert` for JET components); the Redwood variables mapped to the tokens so every JET button, field and
   menu follows the brand.
2. **Brand**: a new geometric mark (connected nodes forming an upward "A"), the wordmark and a "Powered by AI" label, in
   full, compact and icon-only forms, inline SVG so it works on dark and light backgrounds.
3. **Shell**: dark navy sidebar with the brand, active and collapsed states and a small "Build smarter with AI" card;
   white top bar with the workspace selector, search (Ctrl K), theme toggle, notifications and the user menu.
4. **Components** (`app.css` "Components" section and `js/services/`): buttons (variants, sizes, icon, loading), split
   buttons, fields and validation, selects, checkbox / radio / switch / toggle groups, chips and status chips, badges,
   tables with selection and pagination, cards and KPI cards, progress and steps, alerts, toasts, confirm dialogs,
   tooltips, breadcrumbs, tabs and a horizontal carousel. Behaviour lives in `services/ui.js` (pager, split menu,
   carousel), `services/toast.js` and `services/dialog.js`.
5. **Design System page** (`?ojr=design`): the tokens and every component, live, so they can be checked in one place.
6. **Screens**: each of the 23 screens moves from its own colours and one-off controls to the tokens and shared
   components, keeping its workflows, data and endpoints. `window.confirm` becomes the shared dialog; success and
   failure messages become toasts.
7. **Checks**: UI build, a console-error sweep of every page in both workspaces, keyboard focus, colour contrast of
   the token pairs (WCAG AA), light and dark screenshots, phone width; the server tests run on CI.

Risks: the stylesheet is large, so colours are moved to tokens by property (text, background, border) with a script
and then checked page by page; JET components follow the tokens through their own variables, not by overriding their
internal classes. Inter is used when installed; there is no web font download (banks run the factory offline).

## Using it

- **Tokens**: `--fx-*` in `factory-ui/src/css/app.css` (top). Use `--fx-text`, `--fx-text-body`, `--fx-text-muted`,
  `--fx-surface`, `--fx-surface-2/3`, `--fx-border`, `--fx-primary` (`-hover`, `-text`, `-soft`, `-border`) and the
  status sets (`--fx-success|warning|danger|info` with `-text` for text and `-soft` for tints). Never a raw colour that
  should change with the theme; fixed colours are fine for white text on a filled button and for code blocks.
- **Themes**: `services/preferences.js` keeps `theme` ('light', 'dark', 'system') and sets `<html data-theme>`; the top
  bar toggle and Account & Preferences change it. Embedded pages (screen preview, customer review) stay light because
  they show the bank's screens. JET components follow the tokens through their own `--oj-*` variables.
- **Brand**: `.factory-brand-mark` (the logo, any size), `.factory-brand-ai` ("Powered by AI");
  `factory-ui/src/css/images/factory-logo.svg` is the same mark as a file.
- **Components** (prefix `fx-`): buttons, split buttons and menus, fields, checkbox/radio, switch, toggle group, chips,
  badges, avatars, cards and KPI cards, tables, pager, progress and steps, alerts, toasts, dialog, tooltip
  (`data-fx-tip`, on a `.fx-tip-wrap` for disabled controls), breadcrumb, tabs, carousel, empty state, skeleton, code
  block, dropzone. The Design System page (`?ojr=design`) shows each one working; copy its markup.
- **Services**: `ui.pages(list, size, sizes)` (numbered pager), `ui.menu()` (split-button and menu state, keyboard,
  outside click), `ui.carousel()` (`attach(track)` in `connected`), `ui.badge(text, tone)`, `ui.avatarTone(name)`,
  `ui.copy(text)`; `toast.success|info|warning|error(message, {action})`; `dialog.confirm({title, message,
  confirmLabel, danger})` in place of `window.confirm`.
- **Pages**: each page's own rules are scoped under its root class (`.factory-<prefix>`); the "Pages on the design
  system" section of `app.css` holds them. Phones: under 768 px the page grids become one column and toolbars wrap.

## Checks done

- WCAG AA contrast of the token pairs in both themes (text, muted text, links, status text on tints, white on primary):
  all 4.5:1 or more; placeholders use the muted colour.
- Every page loads with no console errors in light and dark, in both demo workspaces; no page is wider than a 390 px
  phone screen.
- Not done: automated accessibility or visual-regression tests (the project has none set up); Inter is not bundled,
  so the system UI font is used where Inter is not installed.

## The factory's own elements (no Oracle JET visual components)

The screens use the factory's own elements instead of JET's visual components; JET remains only as the framework
(router, page modules, Knockout binding: `oj-bind-if`, `oj-bind-for-each`, `oj-bind-text`). The screen preview is the one
exception: it renders the bank's OBDX screens, which are built with JET, so it keeps JET's components.

`js/components/fx-elements.js` defines them (as JET composites, so `value="{{x}}"` writes back like before):

| Element | Use | Main properties |
|---|---|---|
| `fx-input` | text, email, url, search, number, password (with show/hide) | `value` (writeback), `label`, `hide-label`, `placeholder`, `type`, `icon`, `clearable`, `required`, `disabled`, `readonly`, `help`, `error`, `maxlength`, `autocomplete`; event `fxEnter` (`on-fx-enter`) |
| `fx-textarea` | multi-line text | `value`, `label`, `rows`, `counter`, `maxlength`, `mono`, `help`, `error` |
| `fx-select` | one value from a list, with optional search | `value`, `options` (`[{value, label, description?, disabled?}]` or strings) or `data` (an ArrayDataProvider), `label`, `placeholder`, `searchable`; keyboard: arrows, Enter, Escape, type-ahead |
| `fx-date` | a date (`yyyy-mm-dd`) with a calendar | `value`, `min`, `max`, `label`; typing a date also works; arrow keys move in the calendar |
| `fx-time` | a time (`hh:mm`; keeps JET's `Thh:mm:ss` if that is what it was given) | `value`, `label` |
| `fx-switch` | on / off | `value` (boolean), `label` or `aria-label`, `disabled` |
| `fx-menu-button` | a button with a menu of actions | `label`, `icon`, `icon-only`, `variant`, `size`, `align`, `items` (`[{value, label, icon?, disabled?, danger?, separator?, title?}]`); event `fxAction` (`on-fx-action`, `event.detail.value`) |

Buttons are plain `<button class="fx-btn fx-btn--primary|secondary|tertiary|ghost|link|danger|success">`; form layouts
are `<div class="fx-form fx-form--2">`; file pickers are a native file input with a button label; tables are `fx-table`.
Popups (select lists, calendars, menus) are positioned against the window so cards and tables never clip them, and close
on Escape, an outside click or scrolling.
