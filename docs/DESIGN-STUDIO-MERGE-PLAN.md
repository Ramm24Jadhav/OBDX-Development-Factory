# Plan: one Design Studio from the UI Design Studio and the Visual Designer

Status: approved 3 Nov 2026 with the recommended answers in section 6 (1 yes, 2 every approve/group approve/reopen
asks, 3 BRD values only in Edit, 4 drop the quick Edit tab, board and Designer screen list, 5 Edit on phones shows
"use a wider screen", 6 add `?ojr=studio&screen=<id>`). Line numbers are at commit 2e40660.

Status: **done** on branch `design-studio-merge`, one commit per step S0 to S6. Two things moved earlier than the
table says: check-designer opens its screen through the Studio's Edit from S3 (S3 removed the board it opened screens
from) and the redirect check came with S4. Coverage shows "Open the checks" (it opens Edit on the checks) without a
count: the checks are the editor's and run only while it is open. Share stays in the editor's card head, next to its
review link drawer; the Studio's header has Approve or Reopen, Review | Edit and More (share, import, review and
confirmation screens, delete).

## 1. The two pages today

| | UI Design Studio (`studio`) | Visual Designer (`designer`) |
|---|---|---|
| Job | BRD to approved screens: stages, coverage, approval | Expert editing of one screen |
| Layout | Workflow bar (BRD picker, 5 stages, next action); requirements list; flow map; selected screen with Coverage, Refine, Edit, Compare | Title row and drawers (New, Import, Create component, Share); Components, Layers, Screens; canvas; Inspector, Checks, Comments, History, Ask AI; a start "board" when no screen is open |
| Preview data | BRD values only | Invented sample data |
| Checks | Server: criteria coverage, open decisions, values to confirm | Client: fields placed, placeholder options, compatibility |
| Only here | Upload BRD, stages, group approval, Generate code | Blank or imported screens, review links, comments, delete, custom components, code view, undo/redo |
| Permissions | EDIT_DESIGNS, APPROVE, MANAGE_CODE, EDIT_REQUIREMENTS (`studio.js:82-85`) | EDIT_DESIGNS, APPROVE (`designer.js:77-78`) |
| Deep link | In memory: `pageRequests.studio(requirementId)` | In memory: `pageRequests.design(designId)` |
| Linked from | Dashboard, Overview, Requirements, Agent Runs, palette key `d`, landing-page setting | Studio "Open in designer", Reviews, Agent Runs, Dashboard and Overview (screens with no BRD) |

Server: both pages use the same `design` package endpoints, and no server code names either route. **No backend change is needed.**

## 2. What is duplicated or inconsistent

- **Approval exists twice**, each with its own copy of the unsupported-component confirm (`studio.js:677-690`, `designer.js:2204-2212`).
- **Confirmations disagree:**
  - Approving one screen asks only in the Designer.
  - Reopen asks only in the Studio.
  - Group approval never asks.
- **Version compare is written twice:** `studio.js:34` and `services/designDiff.js`.
- **Two screen orders:**
  - The Studio uses the server's flow order: review and confirm screens follow their initiate screen.
  - The Designer's journey strip sorts screens on the client, so it can disagree.
- **Two ways to generate screens and to add review and confirm screens.** The Studio's quick Edit tab is a small subset of the Designer's inspector.
- **Screens without a BRD** (blank or imported) can only be found on the Designer's board.
- **No layout or keyboard checks for `studio`:** neither `check-responsive.js` nor `check-interactions.js` covers it.

## 3. Target: one page, "Design Studio" (route `studio`)

```
┌ Workflow bar: BRD picker (+ "Screens without a BRD") · BRD › Spec › Screens › Approve › Code · next action ┐
├ Library ─────────┬ Flow map ───────────┬ Selected screen ───────────────────────────────────┤
│ FR-001 (3/4 ✓)   │ [Initiate]→[Review] │ Name · status · Approve/Reopen · Share · More      │
│ FR-002 …         │      →[Confirm]     │ ( Review | Edit )                                  │
│ Other screens    │ Uncovered criteria  │ Review: BRD-only preview · Coverage · Refine · Compare│
│ + New screen ▾   │ Open decisions      │ Edit:   the Designer's canvas, inspector, checks,   │
│  Generate/Blank/ │                     │         comments, history (library and flow fold    │
│  Import          │                     │         to "← Flow" and the journey strip)          │
└──────────────────┴─────────────────────┴────────────────────────────────────────────────────┘
```

- **One header and one approval service** for a single screen, a group, all screens and reopen, with the same confirmation rules everywhere.
- **Review** is the default mode. Its Coverage tab shows "N open checks", which opens Edit.
- **Edit** keeps the Designer's tools as they are. Approve asks you to save any unsaved changes first. Switching screen or mode, or leaving the page, warns about unsaved changes.
- **Empty states:**
  - no workspace
  - no BRD (upload)
  - spec not approved (link to Requirements)
  - no screens (Generate, Blank)
  - nothing selected ("Pick a screen in the flow")
- **Keyboard:**
  - Arrow keys work on nodes, tabs and the Review/Edit toggle.
  - Esc leaves Edit when nothing is selected.
  - Undo and redo work only while Edit is open; today they are bound to the whole document.
- **390 px:** the page stacks as it does today. For Edit, see decision 5.

## 4. Steps (each builds, passes the checks and ships on its own)

| Step | Work | Main files | Effort |
|---|---|---|---|
| S0 Baseline checks | Add `studio` to check-responsive and check-interactions; new `check-studio.js` (stages, node keys, tabs, approve confirm) | `factory-ui/scripts/*` | 0.5 d |
| S1 Shared design actions | New `services/designActions.js`: approve (one/group, with the unsupported confirm), reopen, versions. Both pages use it; Studio compare uses `designDiff` | studio.js, designer.js, new service | 1 d |
| S2 Editor inside the Studio | `DesignerViewModel({designId, embedded})` rendered in `studio.html` via `oj-module`; hide its own title, Screens tab, board and New drawer when embedded. Unsaved-changes guard shared. Scope its key handler, ResizeObserver and preview iframe id to the module; one live preview at a time | designer.js/html, studio.js/html, app.css | 2–3 d |
| S3 Designer-only entry points | "Screens without a BRD", Blank, Import, Delete in the library and header; remove the board and the "from requirement" New drawer; journey strip uses the server's flow order | designer.*, studio.* | 1.5 d |
| S4 Routes and links | Label "Design Studio"; `designer` becomes a hidden redirect to `studio` (keep a `detail` object: `visibleRoutes()` reads it). The Studio honours `pageRequests.design(id)` (open its BRD or "Screens without a BRD", select it, open Edit). Repoint links in reviews, agents, dashboard and overview; update wording ("in the designer") and page titles | appController.js, reviews.js, agents.js, dashboard.js, overview.js, requirements.js, account.js | 1 d |
| S5 Checks and docs | check-designer opens `studio` and enters Edit; redirect check; DEVELOPMENT.md (two sections into one), DESIGN-STUDIO.md, ARCHITECTURE.md, UI-AUDIT.md, HANDOFF.md | scripts, docs | 1 d |
| S6 Clean-up | Remove the Studio's quick Edit tab, the duplicate catalog/target loading, and the page-title and board CSS; `designer.html` stays only as the Edit module | studio.*, designer.*, app.css | 1 d |

Total about 8–9 working days. After each step:
- `mvn clean verify`
- check-responsive at 1440/1024/768/390 in light, dark and reduced motion
- check-interactions
- check-designer and check-studio
- a code review

## 5. Risks

- **The Designer assumes it owns the page** (document keys, `.factory-dz-*` full-page CSS, a fixed iframe id). S2 has to scope all of these; this is the main risk.
- **Unsaved edits** can be lost on a mode or screen switch unless the guard is shared. S2 covers this, and check-studio tests it.
- **Two preview iframes** at once cost memory. Detach the Review preview while Edit is open.
- **Blank screens have no requirement context** in the Studio's view model today, so S3 needs a "no BRD" state.

## 6. Decisions for you

1. **Name.** "Design Studio" in the menu, route `studio`, old `designer` links redirect. Keep "Design System" as it is?
2. **Confirmations.** Should every approve, group approve and reopen ask first? (Recommended; it closes the UI-AUDIT open item.)
3. **Preview data in Edit.** BRD values only, as in Review (recommended for consistency), or keep the invented sample data?
4. **What goes.** The Studio's quick Edit tab, the Designer's board and its own "All screens" list, all replaced by the library and Edit mode.
5. **Edit on phones (390 px).** Full editing in drawers, or Review only with "use a wider screen for editing" (recommended, smaller)?
6. **Real links.** Add `?ojr=studio&screen=<id>` so a copied URL opens a specific screen? Today links work only within the app.
