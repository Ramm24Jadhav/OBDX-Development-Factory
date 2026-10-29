# Final UI/UX verification report

Run against a test factory with two workspaces, in headless Edge, with real keyboard, mouse and touch input over the
DevTools protocol. Nothing was saved or deleted. The two checks are in the repository and can be rerun:
- `npm run check:responsive`: layout at 10 sizes;
- `npm run check:interactions`: transitions, loading, keyboard, the shell and operations.

## Route by route

Each cell is checks passed / run, from the final runs on the final build:
- **Layout:** 320×568, 375×667, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, 1920×1080, and 200% zoom at 1280 and 1440.
- **Interaction columns:** the 8 device sizes.
- **Keyboard:** two checks per size:
  - Tab moves through visible controls and never gets stuck;
  - every stop shows a visible focus change.
- **Reduced motion:** 1440 and 375.

| Route | Layout, 10 sizes | Transition | Nothing left busy | Keyboard (Tab, focus visible) | Console clean | Reduced motion |
|---|---|---|---|---|---|---|
| Home (Overview) | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| Workspaces | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| Code | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| Project Profile | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| Requirements | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| Visual Designer | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| Changes | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| Impact Analysis | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| Build, Test & Review | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| Models & AI Providers | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| Modernization | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| Agent Runs | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| Administration | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| External Review | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| Integrations | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| Version Packs | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| Knowledge Explorer | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| AI Prompt Library | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| Notifications | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| Account & Preferences | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| About | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |
| Design System | 10/10 | 8/8 | 8/8 | 16/16 | 8/8 | 2/2 |

## Shell, operations and assets (1440×900 and 375×667)

| Check | Result |
|---|---|
| Collapse notch: Enter collapses (232 → 68px, label "Expand sidebar", focus kept), Space expands | pass |
| The notch overlaps neither the logo nor the workspace picker; it is hidden on phones | pass |
| Phone drawer: the menu button opens it; Escape closes it with focus back on the button; a left swipe closes it | pass |
| Command palette: Ctrl K opens it with focus inside; Escape closes it and returns focus; typing a page name and Enter opens that page | pass (both sizes) |
| User menu: Enter opens it with focus on an item, the arrows move, Escape closes it and returns focus | pass (both sizes) |
| Notification panel: opens inside the window; Escape closes it and returns focus | pass (both sizes) |
| Dialog: takes focus; Escape closes it and returns focus | pass (both sizes) |
| Switching workspace by keyboard on a slow network: the progress bar runs, then everything clears | pass (both sizes) |
| Workspaces refresh, Code search, Knowledge search on a 900ms-latency network: button busy and bar while running, all clear after | pass |
| The same three offline: all clear, and a message says what went wrong | pass |
| Session check with two server errors (503): the app retries and opens signed in | pass |
| Session check with the server never answering: after 4 tries the sign-in page says the factory did not answer | pass |
| Overlays: with two overlapping blocking operations and a failing one, the overlay never stays stuck (run in the earlier interaction test) | pass |
| Carousel (Version Packs): the arrow key moves it; also when its page draws late (1.5s network latency, no cache) | pass after the fix below |
| Logo and "Powered by AI"; the About and sign-in illustrations show | pass |

## Defects found and fixed (root causes)

| Defect | Root cause | Fix |
|---|---|---|
| The sign-in page appeared for a signed-in user when the server was slow or answered with an error | The session check treated any failure of `auth/me` as signed out | Only 401/403 means signed out; other failures retry after 1, 2 and 4 seconds, then the sign-in page says the factory did not answer |
| Typing "Agent Runs" in the palette and pressing Enter ran a code search | Groups were in a fixed order with "Search the code" first | Groups follow their best match; code search comes first only when nothing matches the words |
| Escape did not close the notification panel or the phone drawer | The shell had no Escape handling for its own popovers | One handler closes the panel, then the drawer, and returns focus (dialogs, the palette and menus keep their own) |
| The notification panel ran off the left edge on phones | 360px wide, anchored to the bell's right edge | Full width under the top bar on phones |
| A failed Workspaces refresh showed nothing | The dashboard service kept the error, and the page never showed it | The refresh shows the error with what to do |
| Sign-in: the illustration covered the end of the lead paragraph | A fixed `margin-top: -70px` that assumed a narrow paragraph | Removed; the illustration starts level with the feature list |
| Sign-in: the fourth benefit ("Team Collaboration") wrapped to a second line | A wrapping row of fixed-width items wider than the column | Four equal grid columns (two on phones) |
| Resizer handles had no clear focus indicator | `outline: none`, and only the 2px grip changed colour | The standard focus ring and a wider grip |
| The carousel sometimes did not respond (arrows, buttons, dots) | It was attached with `setTimeout(0)` and `getElementById`, which found nothing when the page drew late | `attach` takes the track's id and waits for it (up to 2s); attaching twice is harmless |

Test problems that were not app defects:
- **Focus read too early:** the focus ring eases in over 140ms.
- **Duplicate labels:** cards with identical labels looked like one stuck stop.
- **Smooth-scrolling tab strips:** the check read a tab's position before the strip finished scrolling to it.
- **Harness not waiting:** the test helper didn't wait for the start screen to close.
- **Slow request:** a model-status request on a busy server finished after 3.4s, so the bar was still running. It is not stuck: it clears, and the check now waits up to 20s.

The harness was fixed, and the affected pages were rerun at all sizes.

## Not verified

- **Real devices and browsers:** real phones and tablets, Safari and Firefox were not tested. Edge only, with emulated sizes and touch events.
- **Screen readers:** not run. `aria-busy`, `role="status"`, `aria-expanded` and the focus order were checked in the page, but how a screen reader announces them was not heard.
- **Committing a change to SVN:** the blocking overlay's real operation was not run, because it writes to SVN. The overlay was exercised with read-only requests.
- **The palette after the fix:** the latest full interaction pass ran before the carousel fix; that fix was verified on its own (above).
- **Real browser zoom:** checked through the equivalent CSS widths (640 and 720 pixels at scale 2), not the browser's zoom control.
- **The sign-in fields in the test browser:** they showed the test account. Chromium's password manager in that browser profile previews saved logins (`:autofill`, with the page reading the fields as empty). The app never fills them.
