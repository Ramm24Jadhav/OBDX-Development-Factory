# UI Design Studio: from BRD to approved screens

The design note for the Design Studio page (`?ojr=studio`), which replaces the Visual Designer as the way into screen
design. The Visual Designer stays for detailed work on one screen.

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

One page, **UI Design Studio**, with a five-step stepper at the top that always shows where the BRD stands and what
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
  - **refine** the selected screen: a plain-language change for the AI, a quick edit of field labels and mandatory
    flags, or "Open in designer" for anything more;
  - a **summary**: channels, screens, fields and the OBDX components used;
  - an **approval bar**: "n of m approved", "Approve all screens of FR-001", and when an initiate screen has no review
    and confirmation screens, "Add review and confirmation screens".

When every screen of the BRD is approved, step 5 becomes the page's primary action: "Generate code".

What we took from the mock-ups: the numbered steps, the requirement ↔ screen mapping with priority, the selected
requirement's description, rules and criteria next to its screens, phone frames of the whole flow, the user-flow strip,
the components used and a short specification. What we left out: Figma export, "OBDX style" and version pickers (the
workspace already fixes the OBDX version and the preview shows the bank's components), screen-variation and
annotation toggles, and the over-dense export panel. None of these has a server behind it.

## Server support

- `GET /api/requirements/{id}/design-flow`: the BRD's screens in flow order (each review and confirmation screen right
  after its initiate screen) with their Screen Models, and per functional requirement its screens, business rules
  and acceptance criteria. Screens are matched to requirements by the screen names the spec lists, and a review or
  confirmation screen follows its initiate screen.
- `POST /api/requirements/{id}/designs/approve` (Approve permission): approves every screen of the BRD that is not
  approved yet, or only the ones listed, in one transaction; returns the flow again.

No new table: the mapping is read from the approved spec and the designs' names and stages.
