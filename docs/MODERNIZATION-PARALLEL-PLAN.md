# Modernization: finishing the board in parallel

**The rule for every agent: the approved board is the design.** The boards in the Modernization canvas
(https://claude.ai/artifact/UaNwHAdWVnXZWDtprnzh7p) were approved as they are. A screen is done only when it matches its
board: layout and alignment, sizes and spacing, colours, type, illustrations, chips, charts, icons and the wording. The
numbers and names on a board are examples; the real data replaces them, nothing else changes. Where a board cannot be
followed (it shows data the factory does not have), the agent stops and lists it for the user; it never improvises.

Where it stands (6 Nov 2026): every Modernization screen works, but they were built from the boards' content, not their
look, and differ from them (Overview: the hero has no gradient and a different illustration, the six counts are icon
tiles instead of chips, the path cards lost their titles, icons, Recommended badge and effort row, the ring chart and
legend differ, Recent activity wraps into long rows, and the page adds a "Code analysis" link the board does not have).
The component packs have 23 of 176 components (version 0.2.0).

## What is left

1. **Design fidelity of the built screens** (new, first): 17 boards.
2. **The rest of the catalogue**: 153 components in the premium JET pack and in React, Angular and React Native where
   the catalogue names them.
3. **Target packs the catalogue offers without one**: Vue 3, Capacitor, native Swift and Kotlin.
4. **Missing gates**: React and Angular parity with the JET screens; React Native screenshots and themes.

## Phase 0 · Set up (the integrator, about 1 hour, before any agent starts)

1. **Reference renders.** Render every board from the canvas files with the board runtime, at 1440 px and 1024 px, light
   and dark, into `docs/design/boards/<Board>-<width>-<theme>.png`, with the board source beside it
   (`docs/design/boards/src/*.dc.html`). Agents work from these files and the board source, so none needs the canvas.
2. **The fidelity check.** `tools/fidelity/shoot.mjs` signs in to a test factory, opens a page and screenshots it at the
   same sizes; `tools/fidelity/compare.mjs` puts board and page side by side with a pixel-diff heatmap. The designlang
   plugin's `fidelity` and `extract` commands give the score and the token differences (colour, type, spacing, radius)
   where they can reach the page. A screen passes when the side-by-side review finds no difference other than data.
3. **The shared parts first** (see S0 below), because every screen uses them.
4. This plan and the handoff template committed; the sessions start from that commit.

## Agents

Each agent owns files no other agent touches. Shared files are written only by the integrator, from each agent's
`handoff/<agent>.md`.

### Track S: the screens match their boards

| Agent | Boards | Owns |
|---|---|---|
| S0 | Shared parts first: the path steps bar (Steps), the count chips, the ring chart and legend, the stacked bars, timeline and dependency diagram (Charts), the hero illustration, the path card, the activity list, the screen states (States); then the shell parts the boards change (the Modernization menu fold, Nav board) | `components/fx-*.js` it adds, `css/parts/*.css`, the Design system page entries |
| S1 | 1 Overview, 2 Choose a path, Menu · Technology settings | those views, view models and their CSS sections |
| S2 | 3 Component inventory, 4 Component mapping, 4b Upgrade plan, 5 Technology catalogue | same |
| S3 | 6 Migration planner, 7 Migration workspace, 8 Validation | same |
| S4 | 9 Review and approval, 9b Review decisions, 10 History, Menu · Component factory | same |

S1 to S4 start when S0's parts are merged (about 2 hours in). Each screen is checked at 1440 and 1024 px in light and
dark (the Tablet and Dark theme boards). The Phone board is left out: the factory UI is tablet and up (decided earlier);
say if that should change.

### Track W and N: the catalogue

| Agent | Work | Components |
|---|---|---|
| W1 | Web packs (JET, React, Angular), group 1: rest of foundation, layout, data, feedback | 25 |
| W2 | Web packs, group 2: accounts, payments, deposits | 23 |
| W3 | Web packs, group 3: loans, cards, security | 24 |
| W4 | Web packs, group 4: insights, approvals, liquidity, settings | 26 |
| W5 | Web packs, group 5: service, documents, onboarding, calculators, help | 23 |
| W6 | Web packs, group 6: dashboard widgets | 32 |
| N1 | React Native, groups 1 to 3 | 71 |
| N2 | React Native, groups 4 to 6 | 64 |

The look of a component is the bank design system's (`bx.css`, the tokens, the Component factory board's previews), the
same in every pack. Files: `bx-g<n>.js`, `react/src/G<n>.tsx`, `angular/src/g<n>.ts`, `react-native/src/G<n>.tsx`, and
their tests.

### Track T and Q

| Agent | Work |
|---|---|
| T1 | Target packs Vue 3 and Capacitor (`target-packs/vue`, `target-packs/capacitor`) |
| T2 | Target pack native Swift and Kotlin (`target-packs/native`) |
| Q1 | React and Angular parity with the JET screens; React Native screenshots and themes |

### The integrator (the main session)

Writes every shared file: `catalogue.json`, `packs.json`, the four `bx.css` copies, element and export lists, the gates
spec list and galleries, `app.css` imports and the Design system page, `PackFiles.java`, `TargetPacks.java`,
Technology settings, the starters and the docs. Merges each branch, runs its checks, records results.

## Definition of done

- **A screen (S):** side by side with its board at 1440 and 1024, light and dark, nothing differs but data; the
  fidelity heatmap is reviewed; the actions on the Actions and links map work; the factory's UI tests pass. Every screen
  built later follows the same check, and a board change comes before a screen change.
- **A component (W, N):** the forms wave recipe (commit `89cd356`): the same props, markup and `bx-` classes on the web,
  the JET attribute and event names in the JET pack (JET 6 bindings only), banking rules (masked numbers, the currency's
  decimals, no business logic, nothing secret kept, no service calls), unit tests with an accessibility check. Browser
  gates and screenshots run once per merge on the integrator's branch and in CI.
- **A target pack (T):** the same parts as the Flutter and JET Core Pack packs: rules, templates, starter, scaffolder
  output, its own CI job.
- Plain, short English for everything a person reads; errors say what to do next; no model names anywhere.

## Running locally (decided 6 Nov 2026)

Three sessions at once on the laptop. Only the main session runs heavy jobs (the 8081 test factory, Maven builds,
Playwright and the browser gates), one at a time, because the laptop crashes when several run together (7.8 GB RAM).
The other two write code and run only their pack's unit tests (`node jet-premium/test/run.js`, vitest, jest), never a
factory, a Maven build or a browser.

| Session | Runs, in order | Heavy jobs |
|---|---|---|
| Main (this one) | Phase 0, then S0, S1, S2, S3, S4 (8081 serves this worktree), and every merge with its gates | yes, one at a time |
| Catalogue (web) | W1, W2, W3, W4, W5, W6, one group per commit on its own branch | no |
| Catalogue (phone) and packs | N1, N2, then T1, T2, then the code of Q1's gates (the main session runs them) | no |

Each group or pack ends in a commit with its `handoff/<agent>.md`; the session messages the main session, which
merges it, applies the shared files, runs the browser gates and records the results.

## Phases

| Phase | When | Done when |
|---|---|---|
| 0 · Set up | day 1, first hour | reference renders and fidelity tools in the repo; the two catalogue sessions started |
| 1 · Screens | day 1 | S0 shared parts, then the 17 screens match their boards (1440 and 1024, light and dark) |
| 2 · Catalogue and packs | days 1 to 3, alongside | W1–W6, N1, N2, T1, T2 merged with their gates |
| 3 · Gates | day 3 | React and Angular parity, React Native screenshots and themes |
| 4 · Ship | after each phase | full build with the database tests, one push, CI green, the 8081 test factory updated for your review |

Merge order: S0 first, then W1 (layout and feedback parts other components reuse), then the rest as they finish.

The Estimated effort on the Overview path cards is derived from the analysis: low, medium or high from the share of
components with a direct replacement (UI path) and the number of modules chosen (migration), with the rule shown on
hover.

## Plugins and skills used

- **designlang** (`fidelity`, `extract`, `verify`): the score, the heatmap and the token differences between a board and
  its page.
- **Built-in browser and Playwright**: the board renders, the page screenshots and the gates.
- **dataviz**: only for how the chart parts behave (hover, labels, accessibility); their look comes from the Charts board.
- Not used: taste-skill (it is for marketing websites and would restyle the approved design, and it is not enabled),
  walkabout and remotion (tours and videos), ponytail (turned off).

## The ids of each component group

- **G1** secondary-button, danger-button, savings-slider, segmented, filter-chips, action-menu, accordion, stepper,
  breadcrumb, side-nav, sheet, grid, divider, avatar, pagination, status-badge, timeline, spinner, skeleton, empty-state,
  tooltip, alert-banner, error-message, success-message, notification-panel
- **G2** account-picker, account-summary, balance-card, account-card, account-details, iban, quick-actions, payee-list,
  beneficiary-card, payment-form, transfer-summary, payment-status, transaction-list, transaction-filter,
  transaction-details, repeat, receipt, upcoming-bills, td-summary, new-td, maturity-instructions, td-topup, td-redemption
- **G3** loan-summary, loan-repayment, loan-schedule, promise-to-pay, disbursement, card-tile, card-list, activate-card,
  convert-emi, redeem-points, spend-limit, card-controls, block-card, reset-pin, raise-dispute, add-on-card,
  card-statements, otp, biometric, session-timeout, secure-confirmation, sensitive, kyc-steps, fraud-alert
- **G4** spending-chart, budget-progress, savings-goal, spend-categories, approval-queue, approval-detail,
  approval-journey, reroute, modification-requested, pending-release, structure-type, account-structure,
  structure-simulation, intercompany-limits, sweep-monitor, profile, sign-in-options, otp-delivery, devices, appearance,
  language, alerts-subscription, do-not-disturb, consents, transaction-limits, session-summary
- **G5** raise-request, track-requests, mailbox, compose-mail, e-receipts, certificates, statement-request,
  statement-format, self-register, fatca-crs, product-showcase, application-tracker, terms-consent, loan-calculator,
  eligibility-calculator, td-calculator, currency-converter, goal-calculator, locator, live-chat, feedback, nominations, faq
- **G6** overview, quick-insights, recent-transactions, bills-widget, spend-analysis, goals, budgets, calculators,
  credit-score, rewards, financial-advisor, special-offers, credit-cards-overview, loans-overview, delinquency-notice,
  financial-overview, position-by-currency, credit-line-usage, bills-receivable-payable, trade-instruments, reports,
  accounts-corp, corporate-limits, transactions-widget, last-5-payments, bulk-file-upload, quick-links-corp,
  work-snapshot, notifications-widget, pending-for-action, my-limits, pending-approvals

A component a pack's `names` leaves out is not built in that pack.

## Motion and effects (added 6 Nov 2026)

Three parts, in every component pack and the target packs' starters.

**The rule: our own code, written clean-room.** React Bits and Vue Bits are MIT with the Commons Clause, which forbids
redistributing their components in a bundle or as a port, and a pack is both. So nothing is copied, ported or translated
from them, and the agent does not work from their source; we take only the idea of an effect and the shape of their
categories. MIT libraries (Magic UI, Motion Primitives, Inspira UI) may be read for ideas, but we still write our own
code, because they need Tailwind and a motion library. No new dependency: CSS and the Web Animations API on the web,
React Native's `Animated`, Flutter's own animation classes (flutter_animate, BSD-3, only if approved), plain canvas for
backdrops. Every effect shows its end state under reduced motion, keeps text readable to screen readers, follows the
`--bx-dur-*` and `--bx-ease-*` tokens and the component style saved in the Component factory, and works on JET 6.

### M1 · A motion layer on every component

Each component, the 23 built ones first, gets the motion its kind calls for, from the component style's options:
enter (fade up, scale, slide, blur), hover (lift, glow, shine), press (press, ripple, bounce), value change (a number
rolls, a chip pops, a row settles), open and close (sheets, dialogs, menus, accordions spring), error (a field shakes
once), and loading (shimmer). One motion spec per component in `target-packs/components/motion.json`; the same in JET,
React, Angular, React Native, and the Flutter and JET Core Pack starters (Vue when T1 builds it). From then on, every
component of every wave ships with its motion.

### M2 · Five new catalogue categories, after React Bits' categories, with our own components

| Category | Components (our names) |
|---|---|
| Text effects | rolling-digits (balances and rates), count-up, split-flap-board (exchange rates), reveal-digits (an account number unmasking), blur-in-text, text-reveal, rotating-text, shimmer-text, gradient-text, typed-text (the assistant), focus-word, scroll-float-text |
| Motion | fade-in-content, scroll-reveal, scroll-expand, edge-blur, glare-hover, magnetic-button, highlight-border, click-burst, marquee |
| Showcase components | animated-list, spotlight-card, tilt-card, flip-card, card-stack, glow-border-card, bento-grid (a dashboard of tiles), carousel, elastic-slider (an amount), option-wheel (a picker), pill-nav, dock-nav, card-nav, staggered-menu, document-folder, scroll-stack, profile-card, glass-panel |
| Backdrops | gradient-backdrop, soft-aurora, silk-backdrop, dot-grid, line-waves, light-beams, topography, particle-backdrop |
| Micro interactions | slide-to-confirm (pay), hold-to-confirm, otp-slots, receipt-tear, success-check, swipe-row (actions on a transaction), swipe-toast, bell-toggle (alerts), squish-switch, jelly-radio, glide-select, rubber-segment, scrub-field (an amount), budget-gauge, status-mark, favourite-heart (a payee), peek-rating, warm-tooltip, prompt-bar (the assistant), voice-pill, call-chip, lattice-loader |

69 components (the 16 of the first motion list are among them). Left out, as not fitting a bank's screens: cursor
effects (trails, blobs, crosshairs), glitch, ASCII and distorted text, 3D galleries and models, physics toys, and the
loud backdrops (galaxy, hyperspeed, lightning, ball pit and the like). They are listed in the catalogue as "not for
banking" so the choice is visible; any can be built on request.

### M3 · The same motion in the other technologies

The Flutter, JET Core Pack, Angular and (with T1) Vue 3 and Capacitor target packs' starter components use the same
motion spec, so a screen moved to any technology moves the same way.

### Who does it

| Agent | Work |
|---|---|
| M1 (catalogue web session, first) | The motion spec and the motion layer on the 23 built components, in JET, React and Angular; then every later group ships with it |
| W7 (catalogue web session, after W6) | The five new categories in the web packs |
| N3 (phone session, after N2) | The motion layer and the five categories in React Native |
| T1, and the main session for the starters | The same motion in Flutter, JET Core Pack, Vue 3 and Capacitor |

## Liquid glass (added 6 Nov 2026)

A new look for the components, after Apple's Liquid Glass: glass surfaces that bend and tint what is behind them, with
a bright rim. It is a **design in the Component factory** ("Liquid glass", next to the eight there), so a bank turns it
on for the workspace's component style; it is not the default, because a bank's forms must stay readable.

**Glisse** (`glisse` on npm, 0.5.0, MIT, by Kelvin Zhang) does this for React: Button, TabBar, SegmentedControl, Menu,
Input, Slider, Switch and a `Glass` surface over a `data-glisse-backdrop` area, tuned with `--lg-glass-bend`,
`--lg-glass-dispersion`, `--lg-blur` and `--lg-rim-shine`. It is React only (react and react-dom 18 or later as peers,
no other dependency). MIT allows using it and adapting its code, with its licence notice kept. Its documentation does
not say how it renders, which browsers it supports or how it falls back; LG0 settles that from its source first.

| Step | Work |
|---|---|
| LG0 · Research and spec | Read Glisse's source: how it draws (SVG displacement in backdrop-filter, canvas or WebGL), what Safari and Firefox show, its cost on a slow laptop. Write the glass spec into the component style (`look: "glass"`: bend, dispersion, blur, rim, tint per theme) and which components take glass: buttons, segmented, tabs, switch, slider, search, menus, cards, sheets, dialogs, toasts, the nav bars; fields keep a solid fill behind their text. Add Glisse to the React pack's dependencies and packs.json with its licence. |
| LG1 · React | The "Liquid glass" design on every React component: Glisse's own components where it has one, its `Glass` surface for the rest. |
| LG2 · JET and Angular | The same glass in CSS and SVG in `bx.css` (adapted from Glisse under its MIT licence, the notice kept), on the same `--lg-*` tokens, so JET 6, JET 21 and Angular look the same as React. |
| LG3 · React Native | React Native has no CSS backdrop, so Glisse does not run there: glass from a blur view (expo-blur, MIT, if approved) with a rim gradient and the same tokens; iOS 26's own Liquid Glass view where the device has it. |
| LG4 · Other technologies | The starters of Vue 3 and Capacitor use the CSS glass from LG2; JET Core Pack the same CSS; Flutter with its BackdropFilter. |
| LG5 · Gates | Text on glass passes contrast (axe) in both themes over a busy backdrop; reduced transparency and forced colours fall back to a solid surface; reduced motion keeps the glass still; screenshots per browser; no page drops frames on a slow laptop. |

Who: the catalogue web session does LG0 to LG2, the phone session LG3, the main session LG4, the gates and the merges.
It starts after this round ships (SHIP), so the current gates are not run twice.
