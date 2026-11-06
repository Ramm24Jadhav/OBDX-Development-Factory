# UI audit and baseline (1 Nov 2026, commit cd42457)

Baseline for the declutter work: what the UI is today, what must not break, and the order to simplify screens in.
No code has been changed for this audit.

## 1. Inventory

### Pages
Routes live in `factory-ui/src/js/appController.js` (CoreRouter, `?ojr=<path>`). Each page is `js/views/<path>.html` +
`js/viewModels/<path>.js`. Lines are html + js.

| Page (route) | Nav | Lines | Main job |
| --- | --- | --- | --- |
| Home (`overview`) | Workflow | 409 | Workspace status, recent requirements, changes, builds, activity |
| Workspaces (`workspaces`) | Workflow | 1,304 | Connect a code base (SVN or folder), import, members, Jenkins |
| Code (`code`) | Workflow | 1,286 | Browse and search the imported code, quick checks, index, settings |
| Project Profile (`profile`) | Workflow | 627 | What the factory learned about the code base |
| Requirements (`requirements`) | Workflow | 1,128 | Upload BRD/FSD, spec, open questions, approve |
| Design Studio (`studio`) | Workflow | 940 | BRD to approved screens; Edit mode is the Visual Designer (merged, see DESIGN-STUDIO-MERGE-PLAN.md) |
| Visual Designer (`designer`, now a redirect) | Studio Edit mode | 2,932 | Edit one screen, inside the Design Studio |
| Changes (`changes`) | Workflow | 1,327 | Plan, generate, review, deliver code |
| Impact Analysis (`impact`) | under Changes | 637 | The plan of a change |
| Build, Test & Review (`build`) | Workflow | 866 | Jenkins builds, checks, review |
| Modernization (`modernization`) | Workflow | 766 | Screen inventory and migration plans |
| Models & AI Providers (`models`) | Workflow | 827 | Model servers, routing, policies, learned limits |
| Agent Runs (`agents`) | Workflow | 682 | History of AI runs |
| OBDX Library (`library`) | Workflow | 799 | Oracle and bank documents, notes, Q&A |
| Knowledge Explorer (`knowledge`) | under Code | 909 | Questions across code and documents |
| Administration (`admin`) | Setup, admin only | 553 | Users, roles, audit |
| External Review (`reviews`) | Setup | 555 | Customer review links for designs |
| Integrations (`integrations`) | Setup | 593 | SVN, Jenkins, sign-in, updates |
| Version Packs (`packs`) | Setup | 634 | Rules, templates, checks per OBDX version |
| AI Prompt Library (`prompts`) | Setup | 580 | The factory's prompts |
| Notifications, Account, About, Design System | Setup | 339 / 356 / 247 / 530 | Personal and reference pages |
| Preview, Review (`preview`, `review`) | hidden, `embed=1` | 458 / 177 | Screen preview (JET), customer review link |

### Shell and navigation (`src/index.html`)
- **Sidebar.** Workflow group (12 pages) and a folding Setup group (9 pages). It collapses to a notch, and is a drawer below 768 px. A promo card sits at the bottom.
- **Top bar.** Workspace picker, search (the command palette: Ctrl K, `/`, `g`+letter jumps), theme, notifications bell, help, user menu, progress bar, admin update banner.
- **Page-to-page requests.** `services/pageRequests.js` (requirement, change, design, studio, code search, new workspace) and the `factory-navigate` event.

### Shared components and services
- **Factory elements.**
  - `js/components/fx-elements.js`: `fx-input`, `fx-textarea`, `fx-select`, `fx-date`, `fx-time`, `fx-switch`, `fx-menu-button`.
  - `fx-more.js`: `fx-multiselect`, `fx-radio-group`, `fx-segmented`, `fx-date-range`, `fx-popover`, `fx-sheet`, `fx-resizer`, `fx-markdown`.
- **JET.** Only in `preview.html`, which renders the bank's screens.
- **Services.** `dialog.js` (confirm with focus trap), `toast.js`, `busy.js` (button spinner, top bar, `block()`), `ui.js` (tabs, menu, carousel, pager, status), `strips.js` (tab-strip fades and ink), `assistant.js`, `previewFrame.js`, `markdown.js`, `reveal.js`.

### Design tokens and themes (`src/css/app.css`, 9,411 lines)
- **Colour.** `--fx-primary*`, status (`--fx-success|warning|danger|info` + `-text`, `-soft`), neutrals (`--fx-bg`, `--fx-surface*`, `--fx-border*`, `--fx-text*`), nav.
- **Type.** Fluid `--fx-text-display/h1/h2/h3/lg`, fixed sizes from h4 down.
- **Space.** `--fx-space-1..6`, fluid `--fx-gutter`, `--fx-gap`, `--fx-card-pad`.
- **Radius, shadow, control heights.**
- **Motion.** `--fx-ease-*`, `--fx-dur-*`.
- **Themes.** Dark is `:root[data-theme="dark"]`, set by `services/preferences.js` (light, dark or system). Density (`fx-compact`) and large text are body classes.
- **Accessibility.** `prefers-reduced-motion` turns animation off; `prefers-contrast: more`, `pointer: coarse` (44 px targets) and `hover: none` are handled. A global `:focus-visible` ring is used.
- **Build check.** `scripts/check-tokens.js` runs on every build and fails it on an undefined token.

### Responsive breakpoints
- **Documented.** ≤767 phone, 768–1099 tablet, 1100–1439 laptop, ≥1440 desktop.
- **In practice.** About 25 different max-width values are used per page (1280, 1000, 767, 1200, 1100, 600, 900, 1400, …). The breakpoints are inconsistent, but nothing overflows (see 3).

### State
- **Shared services.** `session` (user, permissions, `can()`), `workspaceSelection`, `preferences` (localStorage `factory.preferences`), `dashboard` (per-workspace data, attention items), `notifications`, `palette`, `busy`, `updates`, `pageRequests`.
- **Per-page state.** Knockout observables; designer, changes, studio, build and requirements have the most computed state.
- **Other localStorage keys.** Sidebar collapse, Setup group open, notification read flags, resizer widths, designer settings.

### API client (`services/api.js`)
- **Calls.** `get`, `post`, `put`, `del`, `upload`, `stream`; relative `api/`, same-origin cookies.
- **CSRF and errors.** CSRF goes through the `XSRF-TOKEN` cookie and the `X-XSRF-TOKEN` header. Errors come from `detail` or `title`, and a 401 signs the user out.
- **Busy feedback.** Every call drives the busy feedback.
- The declutter work must keep every call a page makes. The per-page list is in the inventory notes and stays as it is.

### Data the UI shows
- **Requirements.** Requirement summary and detail (with `RequirementSpec`: requirements with their original IDs, acceptance criteria, business rules, screens, APIs, open questions, decisions, scope).
- **Designs.** Design summary and detail (`ScreenModel`, versions, comments, approval), `DesignFlow`.
- **Changes.** Change summary and detail (plan items, files with status and checks, builds, delivery).
- **Workspaces and sign-in.** Workspace, `Me` with its memberships.

### Sign-in, permissions and approval gates
- **Sign-in.** Local, LDAP (factory form), OIDC or SAML (single sign-on button).
- **Roles per workspace.**

  | Role | Permissions |
  | --- | --- |
  | Analyst | VIEW, COMMENT, EDIT_REQUIREMENTS, EDIT_DESIGNS |
  | Developer | VIEW, COMMENT, MANAGE_CODE, EDIT_DESIGNS |
  | Lead | all |
  | Admin (a user flag) | everything, everywhere |

- **Enforcement.** The server enforces everything (`AccessGuard`). The UI hides or disables with `session.can()`.

Approval gates (all must stay):

| Gate | Where | Confirmation today |
| --- | --- | --- |
| Approve spec | Requirements | **None** (toast only); the spec is locked afterwards |
| Approve one screen | Design Studio (Review and Edit) | "Approve this screen?" |
| Approve all screens | Design Studio | "Approve every screen?" |
| Approve a group of screens | Design Studio | "Approve n screens?" (added with the merge) |
| Approve plan | Changes, Impact | "Approve this plan?" |
| Submit for review / deliver | Changes, Build | "Submit for review?" |
| Incomplete delivery or patch | Changes | Danger dialog listing unwritten files |
| Customer approval | Review link | Dialog |
| Close, abandon, delete change | Changes | Dialogs |

Spec approval is the one gate without a confirmation now: the Design Studio merge added the group approval's (every approve,
group approve and reopen asks first, `services/designActions`). Adding the spec approval's is a small separate decision (see 5).

## 2. Where the clutter is

Counts come from the views: buttons, tab sets, conditional blocks (`oj-bind-if`), side panels.

| Page | Evidence | What a user faces |
| --- | --- | --- |
| Visual Designer | 83 buttons, 97 conditional blocks, 4 drawers, tabs in tabs (inspector 4 → Style 3; context 7) | Title row with 12 buttons, two rails, inspector, context strip, AI panel |
| Changes | 38 buttons, 6 main tabs + 5 build tabs + 3 assistant tabs; "Build & Test" twice | Toolbar of 5, stepper with raw model error, summary card, two tab rows, full-height assistant with chat, chips and buttons; at 390 px the change starts below the first screen |
| Prompts | 22 tabs (10 categories, 6, 2, 4), 30 buttons, carousel | Four layers of tabs |
| Knowledge Explorer | 16 tabs (7 + 5 + 4), 26 buttons, 2 resizers | Three tab layers |
| Build, Test & Review | 5 tab sets (7, 4, 4, 4, 2), 4 status cards | Overlaps Changes' build tabs |
| Requirements | 5 page tabs + 8 detail tabs; Open Questions and Traceability at both levels | The same thing in two places |
| Workspaces | Two screens in one view; 5 + 5 tabs in the registry | Hard to know where you are |
| Code | 6 tabs, the Repository tab alone is ~300 lines, 13 cards | Long scroll of panels |
| Packs, Integrations, Modernization, Reviews, Agents, Admin | 2–3 tab layers each, KPI rows, carousels | Setup pages dressed as dashboards |
| Home | 5 number tiles, 2 tables, a workspace-setup form, 2 more lists | Setup form competes with status |
| Shell | Promo card in the sidebar, AI assistant panels on 6 pages | Permanent chrome on every page |

The lighter pages are Notifications, Account, About, Review and Preview.

## 3. Baseline checks

| Check | Result |
| --- | --- |
| Screenshots at 1440×1000, 1024×768, 390×844 | 72 page views, saved as the baseline (24 pages × 3 widths) |
| Responsive check (`factory-ui/scripts/check-responsive.js`): page overflow, clipped labels, overlaps, small text, popups, console errors | 0 defects in 72 views |
| Interaction check (`check-interactions.js`): focus, drawer, palette, dialogs, slow/offline | 299 checks, 0 failed |
| Server build and tests (`mvn clean verify`) | 433 tests; 1 known failure before any UI work: `ScreenScaffolderTest.scaffoldsAReactNativeScreenTestAndTexts` (Windows only; passes on CI) |
| CI on the branch | Green at cd42457, 7d18a1d, 067b431 |
| Token check (`check-tokens.js`, part of the build) | Passes |
| Automated accessibility or visual-regression tests | None exist (stated in `docs/DESIGN-SYSTEM.md`) |

New failures in the declutter work are those that are not in this table.

### 3a. Interaction check
299 checks passed:
- every page's transition and heading;
- Tab focus visible;
- the phone drawer (button, Escape, swipe);
- the palette, user menu and bell (open, keys, Escape returns focus);
- dialogs;
- switching workspace by keyboard;
- the carousel by keyboard;
- Workspaces refresh, Code search and Knowledge search on slow and offline networks (busy clears every time).

Fixed: offline, Code search and Knowledge search now say "Could not reach the factory. Check your connection, then try again." instead of "Failed to fetch".

## 4. Rules for every screen task

1. One screen per task. Keep the route, its API calls, its data, its permissions and its approval gates. Do no rewrite and use no mock data.
2. Reduce what is on screen at once, for example:
   - one primary action per area;
   - secondary actions in a "More" menu;
   - one level of tabs;
   - details on demand (drawer, expandable row);
   - side panels closed by default and opened by the user;
   - plain status lines instead of raw error dumps, with the details available.
3. Use the existing `fx-*` elements and `--fx-*` tokens. Light, dark, keyboard, focus and reduced motion keep working. No page-level horizontal scroll at 390–1920 px; code and wide tables scroll inside their own panel.
4. Keep the BRD's own wording and IDs as they are. AI-drawn text stays linked to its source.
5. Nothing new about OBDX that the repository or the workspace's version pack does not show; unknowns are marked as unresolved.
6. Secrets stay masked; external-model privacy policies stay enforced.
7. Before and after each screen task:
   - responsive check and interaction check on that page;
   - build and tests;
   - screenshots at the three widths, light and dark;
   - a report of the changed files, routes, APIs touched and any regressions.

## 5. Agreed order

The order agreed with the product owner (1 Nov 2026), mapped to routes:

| # | Screen | Route | Note |
| --- | --- | --- | --- |
| 1 | Application shell, navigation, global search | `index.html`, `appController.js`, `services/palette.js` | Affects every page |
| 2 | Sign-in | sign-in view in `index.html` | Local, LDAP and SSO modes stay |
| 3 | Home dashboard | `overview` | |
| 4 | Workspaces | `workspaces` | |
| 5 | Code | `code` | |
| 6 | Project Profile | `profile` | |
| 7 | Requirements list | `requirements` (list part) | Same route as 8 |
| 8 | Requirement detail | `requirements` (detail part) | |
| 9 | Design Studio | `studio` | Done by the Design Studio session, merged here; one page with the Visual Designer since the merge |
| 10 | Visual Designer | `designer` (redirects to `studio`) | The Design Studio's Edit mode since the merge |
| 11 | Impact Analysis | `impact` | |
| 12 | Changes Workbench | `changes` | |
| 13 | Build, Test & Review | `build` | |
| 14 | Agent Runs | `agents` | |
| 15 | Knowledge Explorer | `knowledge` | |
| 16 | OBDX Library | `library` | |
| 17 | Version Packs & Bank Standards | `packs` | |
| 18 | AI Prompt Library | `prompts` | |
| 19 | Models & AI Providers | `models` | |
| 20 | Integrations | `integrations` | |
| 21 | Administration | `admin` | |
| 22 | External Review | `reviews` (and the `review` customer link if asked) | |
| 23 | Design System | `design` | |
| 24 | Modernization & Migration | `modernization` | |

Not in the list and left as they are unless asked: Notifications, Account, About, Preview.

### Earlier proposal (superseded by the order above)

Ordered by how much a user's daily work suffers, and by keeping each step small and testable.

1. **Shell.**
   - Remove the sidebar promo card.
   - Make the AI assistant panel a closed-by-default side drawer opened from one button, instead of a permanent column on 6 pages.
   - Unify the breakpoints into the four documented ranges as each page is touched.

   This affects every page.
2. **Changes workbench.**
   - One toolbar: a primary action that follows the stage, the rest under More.
   - The stepper with a one-line status; the error details sit behind "Show details".
   - One tab row (Files, Plan, Checks & Build, Review, History). The duplicated "Build & Test" goes.
   - The assistant becomes the drawer from step 1.
   - At 390 px the change content comes first.
3. **Requirements.**
   - One tab level.
   - Open Questions and Traceability only inside a requirement.
   - Upload as an action, not a tab.
4. **Home.**
   - Status first.
   - The workspace-setup form moves to Workspaces, with a "Connect a code base" button left on Home.
   - Fewer tiles.
5. **Build, Test & Review.** Merge with what Changes shows, or reduce it to builds across changes, with a single tab level.
6. **Code and Knowledge Explorer.** One tab level each; the Repository tab is split into what is needed first versus settings.
7. **Workspaces.** One screen at a time (list, then one workspace with its tabs).
8. **Visual Designer.**
   - Title row of 3–4 actions plus More.
   - One inspector tab level.
   - Context items in one drawer.

   This is the largest page. It is coordinated with the Design Studio session, which owns the Studio side.
9. **Setup pages.** Prompts, Packs, Integrations, Modernization, Reviews, Agents, Admin: one tab level, no KPI rows unless they are the point of the page.
10. **Design Studio.** Already simplified by its own session, and merged with the Visual Designer into one page (Review | Edit; `docs/DESIGN-STUDIO-MERGE-PLAN.md`).

Separate small decisions (not part of decluttering, need your yes):
- add a confirmation to spec approval, so every approval gate asks before it acts (approving a group of screens asks since the Design Studio merge);
- move `check-responsive.js` and `check-interactions.js` runs into the declutter task reports as standard.

## 6. Prompt-pack mapping

Mapping to "the screen list in this prompt pack" waits for that list. The table in section 1 is the current set of screens, and each
prompt will be mapped to its route there before work starts.
