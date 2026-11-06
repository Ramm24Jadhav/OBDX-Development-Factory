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
