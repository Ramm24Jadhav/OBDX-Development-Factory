# Motion, interaction and loading: verification report

What was built is described in `docs/DESIGN-SYSTEM.md` (Motion and interaction, Loading and operation feedback,
Navigation, Carousels and strips, Illustrations). This report says what was checked and how. Checks ran in headless
Edge and in an Edge tab driven over the DevTools protocol, against a test factory with two workspaces. Nothing was
saved or deleted; the request tests used read-only calls.

## Checks that were run

| Area | What was done | Result |
|---|---|---|
| Responsive check (`npm run check:responsive`) | 22 pages at 10 sizes (320 to 1920, and 200% zoom), light theme; dark theme and the second workspace at 375, 1024 and 1440 | 352 page views, 0 defects: no page scrolls sideways, nothing past the edge, no spilling tables, clipped labels, overlaps, popups outside the window, console errors or failed requests |
| Reduced motion | `--reduced-motion 1` (the system setting emulated) on 3 pages at 375 and 1440 | Page animations last 0.01ms; nothing moves |
| Start screen | Reloaded the app | The start screen shows until the page is bound and the session is known, then fades; the unbound page never shows |
| Collapse notch | Clicked it at 1440 | The menu goes 232 → 68px over 240ms (185px midway), the icons stay at the same x (24px) in both states, the label changes between "Collapse sidebar" and "Expand sidebar"; the bottom Collapse button is gone |
| Notch on tablets and phones | 900px and 375px | On tablets the menu starts as icons and the notch opens it; on phones the notch is hidden and the menu is a drawer |
| Drawer swipe | Touch events on the open drawer at 375px | A swipe to the left closes it; a mostly vertical swipe keeps it open (it scrolls) |
| Button feedback | A button wired to a real request, with the network slowed | Spinner and `aria-busy` while open, the progress bar runs, two more clicks are ignored (one request sent), and it clears after success, after an error answer (HTTP 404) and after a network failure |
| Blocking overlay | `busy.block` with two overlapping operations, then a failing one | Shown with the page behind it inert and the overlay focused; the first to finish leaves it up for the second; it clears after both and after a failure |
| Carousel (Version Packs, 20 cards) | Dots, keys, buttons, mouse drag, menu collapse | Previous disabled at the start; dots are labelled buttons and jump; Home, the arrow keys and Next move it; a mouse drag moves it and it settles on a card; it re-measures when the menu collapses; a tab click right after a drag still works |
| Tab strips | Project Profile tabs at 375px | No native scrollbar; the right edge fades, and both edges once scrolled |
| Release build | `npm run build:release`, then the responsive check on 5 pages at 375 and 1440 | Builds; 0 defects |

## Screenshots

Taken during the checks: the menu expanded and collapsed with the notch, the blocking overlay, a busy button with the
progress bar, the Version Packs carousel in the dark theme, and Project Profile tabs at 375px.

## Not covered

- Real phones and tablets, Safari and Firefox: the checks ran in Edge only, with emulated sizes and touch events.
- Screen readers were not run. The markup gives `aria-busy` on busy buttons, `role="status"` on the start screen and
  overlay text, and `aria-expanded` on the notch; how a reader announces them was not heard.
- Delivering a change to SVN (the one page operation that uses the blocking overlay) was not run, because it commits.
  The overlay was exercised with read-only requests instead.
- Cancelling a running job: the server has no cancel for analysis, generation or builds, so the pages offer none.
- Exit animations: popups close at once (no exit animation), so nothing invisible is left blocking clicks or focus.
- Original illustration files: the designs have none (see `docs/DESIGN-SYSTEM.md`, Illustrations); the two
  illustrations stay rebuilt in markup.
