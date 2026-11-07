# Responsive QA report

All 22 pages of the factory were checked with `npm run check:responsive` (`factory-ui/scripts/check-responsive.js`)
against a running test factory with two workspaces: bank-a-22 (OBDX 22.x, with a requirement, designs and a change)
and bank-b-25 (OBDX 25.x). The check signed in and only read: nothing was saved or deleted.

Pages: Home, Workspaces, Code, Project Profile, Requirements, Visual Designer, Changes, Impact Analysis, Build, Test &
Review, Models & AI Providers, Modernization, Agent Runs, Administration, External Review, Integrations, Version
Packs, Knowledge Explorer, AI Prompt Library, Notifications, Account & Preferences, About and the Design System. The
sign-in page and the screen preview (it renders the bank's OBDX screens) are outside the signed-in run.

## What is checked on each page at each size

- The page itself scrolls sideways (document wider than the window).
- An element runs past the window edge, outside a box that scrolls on purpose (tables, code, tab strips).
- A table is wider than its card and does not scroll inside it, so it spills over what is next to it.
- A button, link, tab, heading or badge label is cut off without an ellipsis.
- Two controls overlap (only the parts that show; a field's own buttons, such as show the password, are allowed).
- The page heading is missing or past the window.
- The menu drawer (phones), the user menu and the command palette open inside the window and close again.
- Console errors, uncaught exceptions and failed API requests.
- For information: text smaller than 11px, and buttons under 32px on phones.

## Results

| Size | Before: views with defects | After |
|---|---:|---:|
| 320 x 568 (small phone) | 22 of 22 (every page scrolled sideways) | 0 of 22 |
| 375 x 667 (phone) | 2 | 0 |
| 430 x 932 (large phone) | 0 | 0 |
| 768 x 1024 (tablet) | 3 | 0 |
| 1024 x 768 (tablet landscape) | 1 | 0 |
| 1280 x 800 (laptop) | 2 | 0 |
| 1440 x 900 (desktop) | 0 | 0 |
| 1920 x 1080 (large desktop) | 0 | 0 |
| 1280 x 800 at 200% zoom (640 CSS pixels) | 0 | 0 |
| 1440 x 900 at 200% zoom (720 CSS pixels) | 0 | 0 |
| **All, light theme, bank-a-22** | **30 of 220** | **0 of 220** |
| Dark theme, 375 / 1024 / 1440 | not run | 0 of 66 |
| bank-b-25, 375 / 1024 / 1440 | not run | 0 of 66 |

Text under 11px: 1,222 elements before, 44 after. The 44 are the menu section labels, which shrink to zero on purpose
and become thin dividers when the menu shows only icons. No console errors or failed requests in any run. The release
build (`npm run build:release`) was checked again on five pages at 320, 768 and 1440 (0 defects).

## Main defects found and their causes

| Defect | Cause | Fix |
|---|---|---|
| Every page scrolled sideways at 320px | The top bar kept the workspace picker, search, three icons and the user menu on one 60px row | Phones: the workspace picker gets its own full-width row, gaps shrink, search is its icon |
| Workspace picker squeezed to a sliver on phones | Same row, `flex: 1 1 auto` with nothing left to share | Same |
| Tabs squeezed to nothing next to other controls (Changes, Agent Runs, Integrations) | Rows of tabs plus buttons did not wrap; the tab strip shrank to zero width | Phones: those rows wrap and the tab strip takes a full row, scrolling on its own |
| Header actions past the edge (Code, Project Profile, Impact, Build, Agent Runs) | Header rows with `nowrap` tool groups; `min-width: 320px` on the Profile header | Header rows wrap on phones; the minimum width is removed |
| Requirement stepper labels broke mid-word ("Requi rement") and ran past the edge | Six steps with `min-width: 300px` squeezed into 290px | Phones: the stepper scrolls sideways with 74px steps and whole words |
| Integrations list overlapped its detail panel at 1100 to 1439px (Workspace and Description columns on top of each other, row menus over the panel) | Fixed column widths (about 656px) in a 540px column next to a 410px panel, in a wrapper left unclipped for the row menus | The detail panel goes under the list below 1440px (same for Version Packs) |
| Changes actions ran past the edge at 768px | The action row was sized to its widest line (`flex: 0 0 auto`) | It may shrink and wrap |
| Account theme and density choices ran past the edge on phones | A two-column label/value grid with a 120px label column | Phones: labels above values |
| Prompt Library detail buttons past the edge | A `1fr 1fr 40px` grid with buttons that cannot wrap | `minmax(0, 1fr)` columns and wrapping labels on phones |
| 25 different hard-coded font sizes, down to 9px | Sizes set per page over time | Every font size is a token of the fluid scale; the smallest text is 11px |
| Tablets gave the page only 536px | The full 232px menu at 768px | The menu starts as icons on tablets (768 to 1099px); Expand opens it |

## Changes

- `factory-ui/src/css/app.css`:
  - the fluid type scale (tokens at the top);
  - all 769 rem font sizes mapped to it;
  - the responsive foundations section: gutters, gaps, card padding, the touch size, dialogs inside the window, image and media limits, and the phone top bar;
  - the phone wrap and stacking rules;
  - the Integrations, Version Packs and Changes layout fixes.
- `factory-ui/src/js/appController.js`: the menu starts collapsed on tablets.
- `factory-ui/scripts/check-responsive.js` (new) and `npm run check:responsive` in `factory-ui/package.json`.
- Docs:
  - `docs/DESIGN-SYSTEM.md` (Responsive design);
  - `docs/DEVELOPMENT.md` (how to run the check);
  - `docs/DESIGN-TOKENS.md` (regenerated);
  - this report.

Nothing on the server changed. Pages keep their features, data, routes and permissions; no control was removed or
hidden to make a layout fit. The only content that now moves is the workspace picker (second row on phones) and, on
Integrations and Version Packs below 1440px, the detail panel (under the list).

## Not covered

- The checks were made in Edge in Chromium's device mode (headless Edge, with the mobile flag set below 768px). They
  were not repeated on real phones or tablets, or in Safari or Firefox.
- Touch targets: buttons and fields are 44px high on touch screens (`pointer: coarse`), but the check runs with a
  mouse, so it does not measure that.
- Real browser zoom was checked through the equivalent CSS width (640 and 720 pixels at a device scale of 2), not with
  the browser's zoom control.
- Screenshots show the first screen of each page. Lower parts of a page were checked by the measurements, not looked
  at one by one.
- Dialogs are not opened by the check; one long confirmation dialog was checked by hand at 320px (it fits and its
  buttons fill the row).
- Empty states, loading states and validation errors were covered only where the test data shows them.
