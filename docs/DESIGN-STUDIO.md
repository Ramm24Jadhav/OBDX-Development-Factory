# Design Studio: from BRD to approved screens

The design note for the Design Studio page (`?ojr=studio`), the one page for screen design: from a BRD to approved
screens, with the Visual Designer as its Edit mode for detailed work on one screen (see "One Design Studio" below).

## Today's journey (before)

From a BRD to code, a user went through two pages and up to 9 + 3n clicks for a requirement with n screens:

1. **Requirements page**: upload the BRD (BRD/FSD Upload tab), wait for the draft, answer open questions, "Update the
   spec", approve.
2. **Visual Designer**: open the "New" drawer, pick the approved requirement in a select, "Create designs". The start
   page lists screens per document, without saying which functional requirement (FR-001 ...) each screen serves.
3. Open each screen on its own. The canvas shows one screen at a time; the journey strip shows its neighbours, but the
   flow (list → add → review → confirmation) cannot be seen as a whole.
4. Review and confirmation screens: "More" menu → "Make review and confirmation screens", per initiate screen.
5. Approve each screen on its own (approval group in the title row), with a save first if anything changed.
6. **Changes page**: start a change for the requirement. Nothing in the designer says that this is the next step, or
   that all screens must be approved first (the server refuses with "Approve the screen designs first").

Where it confuses:

- Two names for one thing: "requirement" means the uploaded document, and also its FR-001 items. The designer only
  knows documents, so the BRD's functional requirements and their screens are not connected anywhere in the UI.
- The designer opens on an expert tool (palette, layers, inspector, code mode, zoom, screen sizes) even when the user
  only wants to look at what the AI drafted and approve it.
- No overview of progress: which screens are approved, which are left, what blocks code generation.
- Approval is per screen: a flow of six screens is six approvals.
- The hand-off to code generation is on another page, found by knowing it is there.

## The simplified flow (after)

One page, **Design Studio**, with a five-step stepper at the top that always shows where the BRD stands and what
to do next:

| Step | Done when | Action on the page |
|---|---|---|
| 1 BRD | a document is uploaded or picked | pick a BRD, or upload one here |
| 2 Spec | the spec is approved | "Review the spec": opens it on the Requirements page (questions and approval stay there) |
| 3 Screens | designs exist | "Generate screens" |
| 4 Approve | every screen is approved | "Approve all screens", per functional requirement or for the whole BRD |
| 5 Code | a change exists | "Generate code": starts the change and opens it on the Changes page |

Below the stepper, when screens exist, two columns:

- **Left: functional requirements** of the BRD (FR-001 ...) with priority, the number of screens and how many are
  approved; a search box and priority filter. "All screens" lists every screen; "Other screens" holds screens no
  functional requirement names (for example, renamed ones).
- **Right: the selected requirement**:
  - its description, business rules and acceptance criteria (folded to one line each, expandable);
  - the **user flow** strip: the screens in order, each with its status; clicking one selects it;
  - the **flow preview**: every screen side by side in phone frames, or one at a time in a desktop frame;
  - **refine** the selected screen: a plain-language change for the AI, or Edit (the Visual Designer) for anything
    more (a quick edit of labels and mandatory flags was here until the merge);
  - a **summary**: channels, screens, fields and the OBDX components used;
  - an **approval bar**: "n of m approved", "Approve all screens of FR-001", and when an initiate screen has no review
    and confirmation screens, "Add review and confirmation screens".

When every screen of the BRD is approved, step 5 becomes the page's primary action: "Generate code".

What we took from the mock-ups: the numbered steps, the requirement ↔ screen mapping with priority, the selected
requirement's description, rules and criteria next to its screens, phone frames of the whole flow, the user-flow strip,
the components used and a short specification. What we left out: Figma export, "OBDX style" and version pickers (the
workspace already fixes the OBDX version and the preview shows the bank's components), screen-variation and
annotation toggles, and the over-dense export panel. None of these has a server behind it.

## The design workspace (UI declutter step 9)

The Studio became the central design workspace. The stages, the order of the flow and every approval stay as they were
(approve one screen, approve a requirement's screens, approve all with a confirmation, reopen with a confirmation).

- **Layout:** a compact workflow bar that stays at the top; requirements on the left; the selected requirement's
  screen flow as a map of nodes in the middle; the selected screen's preview on the right. Below 1440 px the flow runs
  across above the preview; below 1100 px everything stacks. The page title is the breadcrumb's, so the page has no
  heading line of its own.
- **One preview** instead of a phone frame per screen: phone, tablet (the preview has tablet layouts) or desktop.
  It never shrinks below 80%; a wider page scrolls inside it.
- **Coverage:** each screen helps meet the acceptance criteria of the requirements it serves; a criterion that names
  some of those screens belongs to them only. Criteria linked to no requirement, or only to requirements without
  screens, are listed as not covered.
- **Open items, each with its own colour and mark:** criteria not covered (red, warning sign), design decisions still
  open (violet, diamond) and values to confirm (amber, dashed outline in the preview). A spec cannot be approved with
  open questions, so after approval the open decisions are what the BRD does not say: whether a captured field is
  mandatory, and whether a screen is new or a change to an existing one.
- **BRD values only:** the Studio's preview no longer invents sample names, amounts or options. A choice or table
  without values from the BRD reads "To be confirmed by the analyst"; accounts and lists loaded from an API say so.
  Edit (the Visual Designer) shows the BRD's values only too.
- **Regenerate** saves the version generated from the approved spec again as a new version. Generation from a spec is
  deterministic, so this is the screen the generator makes from that spec; changes stay in the version history.
- **Compare versions** lists what changed between two versions (title, sections, fields and their label, type,
  mandatory flag, values, default, length and checks, buttons) and can show the earlier one in the preview.
- **Keyboard:** arrow keys, Home and End move through the flow nodes and the tabs; the preview can be scrolled with the
  keyboard.

## One Design Studio (the merge with the Visual Designer)

The UI Design Studio and the Visual Designer were two pages for one job, with two approvals that asked differently,
two version compares and two screen orders. They are one page now (`docs/DESIGN-STUDIO-MERGE-PLAN.md`, done):

- **Review | Edit** on the selected screen. Review is the default (the BRD-only preview, Coverage, Refine, Compare);
  Edit draws the Visual Designer for that screen in the page (`viewModels/designer` with
  `{ embedded: true, designId, host }` in an `oj-module`). In Edit the requirements and the flow fold away behind
  **← Flow**, and the designer's journey strip shows the flow in the server's order. The designer has no title, board,
  Screens tab or New drawer of its own there.
- **One approval service** (`services/designActions`): approve one screen, a requirement's screens or all of them, and
  reopen, each asking first; the unsupported-component confirm (`?unsupported=true`) is written once. Approving with
  unsaved changes offers to save them first.
- **Unsaved changes** are asked about on switching to Review, another screen (the flow, the journey strip, the BRD
  picker, a requirement) and leaving the page.
- **Scoped to the editor:** Ctrl+Z and Ctrl+Y count only inside it, its element lookups, size observer and preview
  frame are found inside its own element, and only one preview is live at a time (Review's frame is not drawn in Edit).
  Esc with nothing selected goes back to Review.
- **Entry points** that were the designer's: **+ New screen** (generate, blank, import), **Screens without a BRD** in
  the BRD picker (blank and imported screens, approved one at a time), and the screen's **More** menu (share, import,
  review and confirmation screens, delete).
- **Phones:** below 768 px Edit says "Use a wider screen to edit this screen"; Review works.
- **Links:** the `designer` route redirects to `studio`; `pageRequests.design(id)` opens the screen in Edit;
  `?ojr=studio&requirement=<id>&screen=<id>` opens that screen, and the address follows the selection.

## Server support

- `GET /api/requirements/{id}/design-flow`: the BRD's screens in flow order (each review and confirmation screen right
  after its initiate screen) with their Screen Models, and per functional requirement its screens, business rules
  and acceptance criteria. Screens are matched to requirements by the screen names the spec lists, and a review or
  confirmation screen follows its initiate screen.
- `POST /api/requirements/{id}/designs/approve` (Approve permission): approves every screen of the BRD that is not
  approved yet, or only the ones listed, in one transaction; returns the flow again.

No new table: the mapping is read from the approved spec and the designs' names and stages.
