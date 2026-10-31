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

## Workflow components (`js/components/fx-more.js`) and helpers

| Element / helper | Use |
|---|---|
| `fx-multiselect` | several values as removable chips, with a searchable checklist (`value` is an array; Backspace removes the last) |
| `fx-radio-group` | one of a few options, native radios (`options`, `value`, `inline`) |
| `fx-segmented` | a segmented control with radiogroup semantics and arrow keys |
| `fx-date-range` | `from` / `to` with presets (Today, Last 7 days, Last 30 days, This month, All dates) |
| `fx-popover` | a button that opens rich content (slot) next to it; Escape closes |
| `fx-sheet` | a side panel for details and logs (slot); traps focus, Escape and the backdrop close it |
| `fx-resizer` | drag or arrow keys to resize the column before it, inside a grid marked `data-fx-panes`; remembered per `storage-key`; double-click or Enter resets |
| `ui.status(serverStatus, words?)` | one look per status category for every page: draft, queued, in progress, needs review, done, closed, failed (icon and words, never colour alone) |
| `ui.tableKeys(rows, {open, toggle})` | list tables: ↑/↓ or J/K move, Enter opens, X selects |
| `.fx-bulkbar`, `.fx-approval`, `.fx-context`, `.fx-disclosure`, `.fx-timeline`, `.fx-log`, `.fx-live` | bulk actions on selected rows; approval actions set apart from generate and validate; what the AI assistant answers from; advanced settings folded away; steps and activity; log text; a live indicator while real polling runs |

## Command palette and shortcuts (`js/services/palette.js`)

Ctrl or Cmd K, `/`, or the top bar search button opens one search across pages, actions, workspaces, requirements,
changes and the code. Arrow keys move, Enter runs, Escape closes; `>` narrows to actions, `@` to workspaces, `#` to
requirements and changes. `g` then a letter jumps to a page (G O overview, G R requirements, G H changes, ...), and `?`
lists every shortcut. Single-letter shortcuts never fire while typing in a field.

## Motion and interaction

**Tokens** (`app.css`, "Motion and interaction"):

| Token | Value | Used for |
|---|---|---|
| `--fx-dur-hover` | 140ms | hover and focus colour, border and shadow; also the general `--fx-duration` |
| `--fx-dur-press` | 120ms | a button press (1px down, scale 0.985) |
| `--fx-dur-pop` | 180ms | menus, popups, the notification panel, backdrops |
| `--fx-dur-panel` | 240ms | the menu collapsing, cards lifting, carousel dots |
| `--fx-dur-modal` | 260ms | dialogs, the command palette, the blocking overlay |
| `--fx-dur-page` | 240ms | a page opening |
| `--fx-stagger` | 40ms | summary cards following one another |

Easings:
- `--fx-ease-out` (entering and settling);
- `--fx-ease-in-out` (moving between two states).

Motion only uses `transform` and `opacity`. There are no bounces and no animations that loop for ever, except spinners and the progress bar while something is actually running. `prefers-reduced-motion: reduce` turns every animation and transition off. On touch screens (`hover: none`) cards do not lift.

**Pages** rise in (6px, 240ms) when they open. The animation runs only when a page is inserted, so updates inside a page never replay it. **Popups** (menus, lists, the bell panel) drop in, and dialogs and the palette zoom in. They close at once, so nothing invisible is left blocking a click or holding focus.

**Interactive cards** (`a.fx-card`, `button.fx-card`, `.fx-card[tabindex="0"]`, `.fx-card.is-interactive`) lift 2px on hover. Static cards do not move.

## Loading and operation feedback (`js/services/busy.js`)

Every request goes through `services/api.js`, which reports it to `services/busy` and releases it however it ends: success, an error answer, a network failure or an exception. The feedback follows from that:

- **The button that started a request** shows a spinner in place of its label (its width stays) and ignores further clicks until the request settles, so nothing is sent twice. No page code is needed: it is the `.fx-btn` or icon button that was clicked when the request started.
- **The progress bar** under the top bar runs while a request the user started (within 1.5 seconds of a click or key press) is open. Background polling does not move it.
- **`busy.block(promise, message)`** covers the page with a message for operations that must finish before anything else:
  - starting the factory (the start screen);
  - signing in ("Signing in…");
  - committing a change to SVN ("Committing the change to a new SVN branch…").

  The page behind it is inert and the overlay takes focus. Overlapping blocks are counted, so the first to finish does not hide the second.
- Spinners and the bar appear only after 150ms, so fast requests never flicker. Nothing is delayed to show an animation.
- **Long jobs** (impact analysis, code generation, builds, imports) never block. Their pages show the real state from the server with `ui.status`:
  - queued, in progress, needs review (awaiting approval), done, closed (cancelled) or failed;
  - the live timeline and log where the server has them.

## Navigation

- **Collapse notch:** a round button on the menu's edge beside the logo collapses and expands the menu ("Collapse sidebar" or "Expand sidebar", with `aria-expanded`).
  - The menu's width animates. The icons stay where they are and the labels fade, so nothing jumps, and the page widens or narrows with it.
  - On tablets the menu starts as icons, and the notch opens it.
  - On phones the menu is a drawer from the top bar's menu button, and the notch is hidden.
- **Start screen:** while the app loads, a start screen with the logo and "Loading the factory…" shows instead of the unbound page.

## Carousels and strips

- **Carousels** (`ui.carousel()` with the `.fx-carousel` markup) are for card collections.
  - Previous and Next buttons are disabled at each end.
  - The dots are buttons that jump to their stop.
  - When the track has focus, the arrow keys, Home and End move it.
  - Touch, trackpad and mouse drag all scroll it, and it snaps to a card on release.
  - It re-measures when its width changes (the window, or the menu collapsing).
  - With fewer cards than fit, the buttons and dots disappear.
- **Strips** (tab strips and steppers, `services/strips.js`, applied to every page automatically):
  - they have no native scrollbar;
  - the edge fades while more tabs are hidden past it;
  - a mouse can drag them, and a focused tab scrolls into view.
- **What stays as it is:**
  - chip rows wrap instead of scrolling;
  - tables, code, diffs and logs keep their own scrolling inside their box.

## Illustrations, images and icons

The screen designs (`design/design and implementation plan.docx`) are 23 flattened mockups, 1536 × 1024 pixels. There are no separate illustration, image or icon files in the document or the repository. Two mockups contain illustrations:

| Mockup | Illustration | In the app |
|---|---|---|
| Sign-in (image 3) | A code editor with the OBDX tree, and Analyze → Generate → Validate tiles | `.factory-login-art` on the sign-in page, built from markup and CSS |
| About (image 23) | A laptop and phone showing the factory, with four feature badges | `.factory-ab-art` on the About page, built from markup and CSS |

Both are rebuilt rather than cut out of the mockups. A crop would be a 440-pixel raster: blurred on high-density screens, wrong in the dark theme, and showing sample text that does not match the factory. The other mockups' icons are a single stroke family (1.8px, round caps), which the factory's own mask icons (`factory-ico-*`, in the text colour) follow. The logo and "Powered by AI" come from the design system (`css/images/factory-logo.svg`). No asset was invented or substituted. If the original illustration files are available, `factory-login-art` and `factory-ab-art` are the two places they belong.

## Responsive design

**Breakpoints** (content-driven, in `app.css`):

| Range | Layout |
|---|---|
| Phones, up to 767px | The menu opens over the page from the top bar's menu button. The top bar keeps every control, with the workspace picker on its own full-width row. Grids are one column, rows of controls wrap, and tab strips take a full row and scroll sideways. |
| Tablets, 768 to 1099px | The menu starts as icons, and Expand opens it until the window changes size. The breadcrumb and user name hide, and search becomes its icon. |
| Laptops, 1100 to 1439px | The full menu shows. A list with a detail panel (Integrations, Version Packs) puts the detail under the list. |
| Desktops, 1440px and up | The layouts as designed. |

**Type** is a fluid scale (`--fx-text-*`):
- headings use `clamp()`, so a page title runs from 24px on a phone to 32px on a desktop, and card titles from 16px to 17px;
- body, caption and badge text stay fixed (14, 13, 12 and 11px), so text never gets smaller than 11px and reads the same at any zoom;
- every font size in `app.css` is a token.

**Spacing:** `--fx-gutter`, `--fx-gap` and `--fx-card-pad` scale with the window.

**Touch:** `--fx-touch` (44px) is the minimum size of buttons and fields on touch screens.

**Rules that keep layouts stable:**
- flex and grid children get `min-width: 0` or `minmax(0, 1fr)`;
- wide tables, code and logs scroll inside their own box, never the whole page;
- images, video and canvases never exceed their container;
- dialogs and sheets stay inside the window and scroll inside;
- long names, paths and ids wrap (`overflow-wrap: break-word`).

**Checking:** `npm run check:responsive` (see `docs/DEVELOPMENT.md`) opens every page at:
- 320, 375 and 430px (phones);
- 768 and 1024px (tablets);
- 1280, 1440 and 1920px (laptops and desktops);
- 200% browser zoom.

It reports anything that breaks these rules, with a screenshot of each page at each size.

See also `docs/DESIGN-TOKENS.md` (every token with its light and dark value) and `docs/DESIGN-REFERENCE-AUDIT.md`
(the Linear, Vercel, shadcn/ui and Figma guidance this follows).
