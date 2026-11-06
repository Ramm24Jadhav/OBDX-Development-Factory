# Premium component packs: architecture proposal and plan

Status: decisions agreed (section 13: Angular target pack now, bx- prefix, oldest JET version from a 22.x codebase, pack
builds as their own CI jobs). Built so far: the registry (`target-packs/components/catalogue.json`, `packs.json`), `GET
/api/component-packs`, the premium JET builds chosen from the workspace's detected JET version, the saved component style
and the Component factory page (route `components`). The foundation set (13 components) is built in all four packs: the premium JET pack (bx- elements in
`target-packs/components/jet-premium`, unit and markup checks with every build, previewed live on Component mapping),
React (`components/react`: Radix dialog and tabs, the JET pack's skin unchanged, vitest and axe), React Native
(`components/react-native`: React Native primitives themed from the generated tokens, Jest and role, name and touch
target checks) and Angular (`components/angular`: standalone components with signal inputs and form-control support,
the CDK focus trap, the same skin, vitest with the Angular compiler and axe). Each pack's unit and accessibility gates
pass and run in the `component-packs` CI job; `tools/build-tokens.js` builds the tokens to `tokens/build/tokens.css`
and `react-native/src/tokens.ts` (`--check` in CI). The browser gates (`components/gates`, Playwright in Chromium,
the `component-gates` CI job) run on each web pack's gallery: axe with contrast, light and dark, phone to laptop and
screenshots. Parity runs the premium JET pack beside the JET elements it replaces, in a real JET 6.2 app and the current
release; `gates/record.mjs` writes the results into `packs.json`. The premium JET foundation set passes every gate and
is Available; in React and Angular the card is, and the rest waits for parity with the JET screens. Next: React and
Angular parity, React Native on devices, the starters switching to the packs, then the rest of the catalogue in waves.

The goal: one design system for the bank's channel UI, implemented four times — Oracle JET (the UI path), React,
React Native and Angular (the migration path) — with a metadata registry the factory reads to show, compare, map and
generate with the components.

## 1. What exists today

| Area | What is there | What it means for the packs |
|---|---|---|
| `target-packs/jet` | `target.yml` only: no components; the factory enhances the bank's own JET UI | The premium JET pack is new. It must work with the bank's JET version, which the factory already detects per codebase (`ui.jetVersion` in `profile/UiDetector.java`). |
| `target-packs/react` | Vite + React 19 + TypeScript starter; `src/components` has TextField, NumberField, AmountField, DateField, SelectField, AccountField, RadioGroup, CheckboxGroup, SwitchField, ReadOnlyField, Button, Section, Screen; vitest tests | These are the seed of the React pack. They already share one prop contract (`FieldProps`: testID, label, value, onChange, error, required, readOnly, helpText, placeholder, maxLength). |
| `target-packs/react-native` | Expo 58 + React Native 0.88 starter with the same 13 components, `theme.ts`, jest tests | Seed of the React Native pack, native components with the same contract. Colours are a plain `theme` object, not shared tokens. |
| Angular | The Angular target pack (`target-packs/angular`): starter with the Angular pack's components, templates, `target.yml` | Built: generated screens are standalone components with signal form values; the starter builds and the generated test passes. |
| JET Core Pack | The JET Core Pack target pack (`target-packs/jet-core-pack`): a JET VDOM starter whose components wrap the Core Pack elements, templates, `target.yml` | Built: generated screens are Preact components on the oj-c elements; they typecheck, pass Jest with the JET preset and run in an ojet build. |
| Flutter | The Flutter target pack (`target-packs/flutter`): starter with Bx widgets themed from the bank tokens, templates, `target.yml` | Built: generated screens are StatefulWidgets on a FormModel; a generated screen passes flutter analyze and flutter test. No Flutter component pack in the registry yet. |
| `target.yml` `components:` | Maps a Screen Model type (text, amount, select ...) to a starter component | This is today's mapping. The registry below extends it; generated screens keep working. |
| `modernization/InventoryScanner.java` | `FIELD_TAGS`: `oj-*` tag to Screen Model type | The JET side of the mapping registry starts from these tags and the counts the inventory already finds in the bank's code. |
| `factory-ui/scripts/build-previews.js` | Renders the React and React Native starter components in the designer (React Native Web) | The pack explorer's live previews reuse this: the previews are the real pack components, not drawings. |
| Factory UI tokens (`--fx-*`, `docs/DESIGN-TOKENS.md`) and elements (`fx-input`, `fx-select` ...) | The factory's own look | The bank's packs need their own tokens (the bank's brand), not the factory's. The `fx-` element prefix is taken by the factory UI, see decision 2. |
| Modernization design (canvas artifact) | Component factory page: pack tabs, workspace component next to the new one, live previews, customise and save as copy | The explorer below follows that design; section 9 lists what the design still lacks. |

## 2. Decisions proposed

1. **One design system, four implementations.** Tokens, the component catalogue, the metadata contract and the
   mapping registry are shared; each technology has its own package with its own code and tests. No package imports
   another technology's code.
2. **Tokens generated with Style Dictionary** (Apache-2.0) from one source: CSS custom properties for JET, React and
   Angular; a typed TypeScript object for React Native. A workspace's brand overrides the source values, so the same
   components carry each bank's brand. Token names: `--bank-<role>[-<variant>]`, mirroring the factory's naming rules.
3. **Foundations per technology** (all MIT unless noted):
   - JET: Oracle JET web components (UPL-1.0) built as a JET component pack (`component.json`, `jetVersion` range);
     no other runtime dependency.
   - React: Radix UI primitives for behaviour and accessibility, our own styling from the tokens, in the shadcn/ui
     style (copy-owned components, no runtime theme library). No MUI: a second styling system is not justified, and
     MUI X Pro/Premium is commercial. The data table is our own on top of a headless table if needed.
   - React Native: React Native primitives plus React Native Paper where a control is not worth rebuilding (for
     example menus and dialogs), themed from the tokens so it does not look like stock Material.
   - Angular: Angular CDK for behaviour (overlay, a11y, table), Angular Material only where its look can be fully
     themed from the tokens; standalone components, signals for inputs.
4. **Packs live in `target-packs/components/`**, versioned independently of the factory, with the metadata registry
   next to them. The factory server packages them like the target packs today.
5. **"Available" is earned, not declared.** The explorer shows a component as Available only when its metadata says
   its tests, accessibility checks and compatibility check passed for that pack version; counts come from the
   registry, never typed in.

## 3. Folder structure

```
target-packs/components/
  tokens/                      Style Dictionary source (colour, type, spacing, radius, shadow, motion, breakpoints)
  schema/                      component.schema.json, mapping.schema.json (machine-readable contracts)
  catalogue/<component>.json   one logical component: id, category, purpose, a11y and banking rules
  mappings/jet-to-<target>.json one registry per target: source tag, target, property/event mapping, status, evidence
  packages/
    jet/                        JET component pack (web components, component.json, Knockout-friendly)
    react/                      React + TypeScript package
    react-native/               React Native package
    angular/                    Angular library (ng-packagr)
  docs/                         generated pages per component (props, events, examples) for the explorer
```

The existing starters keep their `src/components` until the matching pack components pass their gates; then the
starters import the pack instead of carrying a copy.

## 4. Reference projects

Checked on 5 Nov 2026 (licence from each repository, latest version from npm).

| Project | Licence | Use |
|---|---|---|
| oracle/oraclejet (JET 21.0 latest) | UPL-1.0 | Component and pack format, `component.json`, theming with CSS variables, Redwood |
| shadcn-ui/ui | MIT | Pattern only: components owned in our repo, variants from tokens |
| radix-ui/primitives (1.3) | MIT | React behaviour and accessibility (dialog, select, menu, tabs, checkbox, radio) |
| mui/material-ui | MIT | Not used (second styling system); MUI X Pro/Premium is commercial |
| react-native (0.88 in our starter) | MIT | Native primitives |
| callstack/react-native-paper (5.15) | MIT | Selected controls, themed from tokens |
| angular/components (Material and CDK 22.2) | MIT | CDK behaviour; Material where fully themeable |
| style-dictionary | Apache-2.0 | Token build |
| storybookjs/storybook | MIT | Optional: component docs for developers outside the factory |
| microsoft/playwright | Apache-2.0 | Web end-to-end and visual tests |
| dequelabs/axe-core | MPL-2.0 | Accessibility checks, test-only dependency (not shipped) |

Licence notes: nothing is copied wholesale. Where a component is adapted from shadcn/ui (MIT), the file keeps the
MIT notice. Paper and Angular Material are dependencies, not copies. A `LICENSES.md` per package lists each
dependency, its licence and attribution.

## 5. Technology compatibility

| Pack | Framework range (initial) | Build and test | Runs where |
|---|---|---|---|
| JET | The bank's JET version, detected per codebase; the pack declares a `jetVersion` range and the factory refuses to install it outside that range | JET CLI pack build; Jest + jsdom for view models; Playwright for rendering | Inside the bank's OBDX UI |
| React | React 19, TypeScript 5.9, Vite 8 (same as the starter) | vitest + Testing Library; Playwright + axe for a11y and visual | New web app |
| React Native | React Native 0.88, Expo 58 (same as the starter) | jest-expo + React Native Testing Library | New Android and iOS app |
| Angular | Angular 22, CDK and Material 22.2 | Angular test runner (vitest builder) + Playwright + axe | New web app |

The oldest JET version is JET 6 (decision 3): the OBDX 22.1 Licensing Guide lists Oracle JET 6.2.0 (with fourth-party
libraries from JET 5.1.0 and Knockout 3.4.2), and the 22.1 UX Extensibility Toolkit points at the JET 6.1.0 cookbook.
The JET pack therefore has builds in `packs.json` (`builds`), each for a range of JET major versions:

| Build | JET | Built on |
|---|---|---|
| Classic JET | 6 to 15 | Classic `oj-*` elements in Knockout composites, only APIs JET 6 has; `elements` gives the JET 6 element for each Core Pack element the catalogue names (`own` means no JET element) |
| JET Core Pack | 16 and later | `oj-c-*` elements in Knockout composites |

The factory picks the build from the workspace's `ui.jetVersion` fact (the Project Profile scan of package.json,
component.json `jetVersion`, `oj/vX.Y.Z` paths and the JET banner, or a value set on the profile) through `GET
/api/workspaces/{id}/component-packs`, and the page says which release it built for and where it was seen. With no
version found it shows the classic build and asks for a scan. The Core Pack start at JET 16 is an assumption (the
elements the pack uses were all production by then); change `jetFrom` in `packs.json` if a bank's release proves
otherwise.

## 6. Initial catalogue

Foundation set (built first, in all four packs): Button, Icon Button, Text Field, Amount Input, Dropdown, Checkbox,
Radio Group, Date Picker, Dialog, Toast, Card, Tabs, Data Table.

Next waves, in this order (each wave passes its gates before the next starts):

1. Forms: Text Area, Password Field, Number Input, Currency Selector, Multi Select, Toggle, Date Range Picker,
   Search Field, Autocomplete, File Upload.
2. Banking: Account Selector, Masked Account Number, Account Balance, Account Card, Beneficiary Selector and Card,
   Amount and Currency Input, Transfer Summary, Payment Confirmation, Payment Status, Transaction Receipt.
3. Security: OTP Input, Authentication Challenge, Session Expiry Warning, Secure Transaction Confirmation,
   Sensitive Information Masking. These render what the server asks for; they never decide or store secrets.
4. Data and feedback: Data Grid (paging, sorting, filtering), Pagination, Status Badge, Progress, Timeline,
   Transaction History and Filter, Empty State, Skeleton, Alert, Notification Panel.
5. Layout: Container, Grid, Stack, Divider, Accordion, Stepper, Breadcrumb, Drawer.

Banking rules every pack follows: account and card numbers masked by default; amounts formatted and validated from
the currency's decimals; no business logic in components (validation rules come from the screen's view model or
spec); no password, OTP or token kept in component state after submit; service paths, session and nonce handling
come from the target pack's API layer and the bank's OBDX release, never from a component.

## 7. Component metadata

Every component in every pack has one JSON document that validates against
`target-packs/components/schema/component.schema.json`. It records the identity (id, name, category, technology,
package and versions, framework range), the API (properties with types and defaults, events, slots), the rules
(validation, accessibility, responsive behaviour, theming, banking rules), dependencies, examples, and the quality
gate results with their evidence. The factory reads these documents to fill the explorer and to tell the model which
components exist when it generates code.

## 8. Mapping registry

One registry per target (`mappings/jet-to-jet-premium.json`, `jet-to-react.json`, `jet-to-react-native.json`,
`jet-to-angular.json`), each entry validating against `schema/mapping.schema.json`. An entry records the source JET
element, the target component, how each property, event and binding converts, the validation, accessibility,
styling and lifecycle differences, unsupported properties, what needs a person, and a status:

| Status | Meaning |
|---|---|
| Direct replacement | Same properties and events; only the tag changes. Needs a passing parity test as evidence. |
| Property mapping required | Some properties are renamed or converted |
| Event mapping required | Events differ (for example `on-value-changed` to `onChange`) |
| Custom transformation required | The binding or structure changes (for example Knockout observables to React state) |
| Manual intervention | A person must finish it; the factory says what |
| Unsupported | No target component yet |

A status is never set from names alone: each entry links the evidence (the parity test, or the API comparison) and a
confidence. The inventory's tag counts show, per module, how many elements each status covers.

## 9. Explorer in the factory

The Component factory page in the Modernization design becomes the pack explorer, filled from the registry:
overview (packs, versions, components per technology, readiness from the gates), technology tabs, categories, live
previews of the real pack components, the workspace's JET component beside the new one, customise and save as a
copy. The design still lacks, and will gain before it is built:

- search, and filters for compatibility status and version;
- a component detail panel: properties, events, variants, accessibility notes, code example, dependencies, the
  mapping entry with its evidence;
- a four-way comparison of one logical component across the technologies;
- pack management: install or upgrade in a workspace, release notes, compatibility check, dependencies, export the
  documentation.

## 10. Quality gates

A component is Available in a pack version only when all of these pass and are recorded in its metadata:

- unit tests for default, focus, disabled, error, loading and validation states;
- keyboard navigation and screen-reader names (axe on web, accessibility props on React Native);
- responsive behaviour at phone, tablet and laptop widths (web packs);
- light and dark themes from the tokens;
- a visual snapshot per state (Playwright on web);
- for mapped components, a parity test against the JET element it replaces.

Each pack build writes a compatibility report (component, version, gates, framework range) that the explorer reads.

## 11. Risks

- **Build weight.** Angular and React Native toolchains in the factory's Maven build make it much slower and heavier
  (and the development laptop is limited). Proposed: pack builds run as their own CI jobs, the factory build only
  validates metadata and packages the built packs.
- **JET version spread.** Banks run different JET releases; a JET pack built for one may not load on another. The
  pack declares its range and the factory checks the workspace's detected version before installing.
- **Look of Material and Paper.** Stock Material would make banks' apps look alike; everything is themed from the
  bank's tokens, and controls that cannot be themed are built from primitives instead.
- **Element names.** `fx-` is already the factory UI's prefix; using it for the bank's JET elements could clash when
  both load on one page (for example in the designer preview).
- **Scope.** The full catalogue is about 80 logical components times four packs. The waves keep each step small and
  tested; the explorer only ever shows what passed.

## 12. Implementation sequence

| Step | Delivers | Done when |
|---|---|---|
| 1 | Token source and build; schemas; registry format; this document agreed | Tokens build to CSS and TS; schemas validate an example component and mapping |
| 2 | Angular target pack (starter, templates, `target.yml`), matching the React one | Done: a generated screen builds (`ng build`, strict templates) and its test passes (`ng test`) |
| 3 | Foundation set in React and React Native, starting from the starters' components | Gates pass; starters use the pack |
| 4 | Foundation set in Angular | Gates pass |
| 5 | Foundation set in JET (component pack) | Loads in a JET app of the agreed oldest version; gates pass |
| 6 | Mapping registries for the foundation set, with parity tests | Each entry has a status with evidence |
| 7 | Explorer page in the factory, read from the registry | Counts and readiness come from the metadata |
| 8 | Waves 1 to 5 of the catalogue | Each wave's gates pass |

## 13. Open decisions

1. Build the Angular target pack (step 2) now, or keep Angular as a preview pack until a bank asks for it?
2. Element prefix for the bank's JET elements: keep `fx-` (as in the design) or use a distinct one such as `bx-`?
3. Oldest JET version the JET pack must support: decided, JET 6 (OBDX 22.1 ships JET 6.2); see section 5.
4. Pack builds as separate CI jobs (recommended) or inside the factory's Maven build?
