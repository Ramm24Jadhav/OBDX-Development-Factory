# Modernization: how the two paths are built

The design is the "Modernization two paths" canvas (boards Main, Actions, the eleven screens, Component factory,
Technology settings, the states, phone, tablet and dark boards). This document is how the factory builds it: what each
screen reads and writes, and in what order it was built. The component packs themselves are planned in
[COMPONENT-PACKS.md](COMPONENT-PACKS.md).

A bank keeps OBDX and gives its screens premium components (the **UI path**), or moves the UI to another technology
module by module (the **migration path**). The OBDX server and its services stay as they are on both paths. Both paths
end in an ordinary factory change, so Workspace, Validation, Review and History serve both.

## Screens and routes

The menu has one entry, Modernization, under Modernize. It folds open the four pages that start nothing: Overview,
Component factory, Technology settings and History. The steps of each path are reached from the flow, with a step bar
at the top (UI path: Choose a path, Inventory and mapping, Upgrade plan, Build and validate, Review and deliver;
migration: Choose a path, Technology, Migration plan, Build and validate, Review and deliver).

| Screen | Route | Reads | Writes |
|---|---|---|---|
| Overview | `modernization` | the analysis (inventory), the path choice, the runs | Analyze again |
| Choose a path | `modernization-path` | the analysis, the saved choice | the path choice (draft or started) |
| Component inventory | `modernization-components` | the oj-* counts per screen and module, the pack registry | CSV export, add to the upgrade plan |
| Component mapping | `modernization-mapping` | the JET mapping registry, the affected screens | add to the plan, make the change |
| Upgrade plan | `modernization-upgrade` | the inventory and the saved plan | the plan (waves), start a wave |
| Technology catalogue | `modernization-catalogue` | `target-packs/catalogue.json` and the target packs | the chosen technology |
| Migration planner | `modernization-planner` | the modules, their dependencies and sizes, the saved plan | the plan (order, weeks), start a module |
| Migration workspace | `modernization-workspace` | the run's change: files, source and new code, log | write a file again, run the tests |
| Validation | `modernization-validation` | the change's checks, the 8 OBDX rules, Jenkins | run the failed tests again |
| Review and approval | `modernization-review` | the change's diff, checks and comments | request changes, reject, approve and deliver |
| History | `modernization-history` | the runs | CSV, logs |
| Component factory | `components` | the pack registry, the workspace's JET version | the component style, copies |
| Technology settings | `modernization-settings` | the target pack's settings, the component style | the workspace's settings |

## Records

- **Path choice** (`modernization_choice`, one per workspace): path (`ui`, `migration`), scope (`all`, `some` with the
  chosen modules), how it runs (`agent`: the factory does it end to end; `plan`: plan only, no code), analysis
  (`latest`, `new`), the chosen technology for the migration, state (`draft`, `started`), who saved it and when.
- **Plans** (`modernization_plan`, one per workspace and path): the UI path's waves (components, screens, order,
  components left out) or the migration's modules (order, the team's planned weeks, in or out of the plan). The weeks
  are the team's own: the factory proposes an order from the dependencies, never days or risk scores.
- **Runs** (`modernization_run`): one wave or module being built: path, subject, the screens, the requirement and change it
  made, who started it and when, a rejection's reason and who signed off the security review (V36). Its state comes from
  its change: `starting`, `building` (analysis, plan, generation), `validating` (generated: checks and Jenkins),
  `delivered` (delivered to SVN or closed as merged), `rejected` or `failed`. A module or screen counts as moved only when
  its run's change is delivered to SVN.
- **Technology settings** (`technology_setting`, per workspace and technology): the editable settings of a target pack;
  the OBDX connection settings are not stored, they come from the workspace and stay locked.
- **Component style** (`component_style`, V34) and the component pack registry are described in COMPONENT-PACKS.md.

## The JET mapping registry

`target-packs/components/mapping/jet-premium.json` (written by `target-packs/components/tools/gen-jet-mapping.js`) lists
52 Oracle JET elements, JET 6 classics such as `oj-select-one` included, each with its premium element, its properties,
events and slots part by part, what does not carry over and what a person finishes. The premium elements keep the JET
attribute and event names, so a screen's Knockout bindings stay. Statuses stay proposals (confidence medium) until a
parity test is recorded. Helper elements (`oj-option`, `oj-validation-group`, `oj-form-layout`, `oj-toolbar`) are kept
as they are and not counted in the inventory.

## Review steps

Approve and deliver is enabled once validation passed (every file checked without problems, the last Jenkins build
succeeded, the 8 OBDX rules passed), the technical review is done (the change's plan approved) and the security review is
signed off (a person with Approve). Request changes writes the chosen files again with the reviewer's note; Reject
closes the change as abandoned and keeps the reason.

## Where the numbers come from

- Screens, modules, fields, services and flows: the code analysis (`InventoryScanner`), stored per workspace.
- Components found: every `oj-*` element in each screen's view, counted per screen and module by the analysis.
- Direct replacements, need mapping, custom or not covered: each found element's mapping status in the premium JET
  pack (direct replacement; property or event mapping; custom transformation or manual intervention; unsupported or
  not in the catalogue).
- Progress: screens (UI path) or modules (migration) whose run's change is delivered to SVN.
- Activity: the audit log entries of modernization actions.

Results come from the analysis, Jenkins or the factory's checks, so no panel is called "AI" unless a model wrote it. Only
the conversion and the assistant call a model, through Models & AI.

## How a run makes its change

A run makes an ordinary change, so it gets the impact analysis, plan review, generation, checks, Jenkins build, review
and SVN delivery the factory already has:

1. The factory writes the brief: for the UI path the screens of the wave and, per screen, each `oj-*` element with
   the premium element it becomes and its mapping; for the migration path the module's screens, fields, the services
   they call, the flows and the target pack's rules.
2. It records the brief as an approved requirement (marked as coming from Modernization, so it needs no drafting by a
   model and no screen designs) and starts a change from it.
3. Workspace, Validation and Review show that change; Approve and deliver delivers it to SVN like any change.

Every converted module is checked against the 8 OBDX rules: same digx services, session cookie through OHS, nonce from
`/digx/v1/session/nonce`, server-driven 2FA, masked tokens, password encryption, role menus, labels and validations.

## Build order

| Step | Delivers | State |
|---|---|---|
| 0 | Chart parts: `fx-bar-chart`, `fx-timeline-chart`, `fx-dep-graph` on the Design System page | Built |
| 1 | Menu fold, routes, Overview, Choose a path and its record | Built |
| 2 | oj-* counts in the analysis; the JET mapping registry; Component inventory; Component mapping | Built |
| 3 | Component factory (built); the foundation set in each pack; the rest in waves | Registry, page and the premium JET foundation set built; React, React Native and Angular next |
| 4 | Technology catalogue and Migration planner | Built |
| 5 | Workspace, Validation, Review, History; Upgrade plan; Technology settings | Built |
| 6 | Angular target pack, Flutter for mobile, JET Core Pack | |

Deferred: OBDX version upgrades (22.x to 25.x).
