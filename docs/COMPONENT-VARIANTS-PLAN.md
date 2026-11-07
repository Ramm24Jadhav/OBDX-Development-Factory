# Component variants, designs and motion: plan

Decided with the user on 7 Nov 2026. Goal: the Component factory offers, for every one of the 245 components in all four
packs (JET, React, Angular, React Native), the style variants that component really has in good design systems, the nine
designs applied to every component (not only buttons), a motion set per component, and new showcase components from
openly licensed sources. Built directly in the Component factory (no separate board); the user reviews it there.

## Decisions

- All 245 components in this round, not a subset.
- Material: the React pack depends on `@mui/material` (MIT core only; never MUI X Pro or Premium) for its Material
  variants; JET, Angular and React Native draw Material-style variants themselves.
- New showcase components from MIT sources (thinking-orbs, Vengeance UI), ported to all four packs with their notices.
- Inspiration only, written from scratch with no source open: React Bits (MIT + Commons Clause forbids bundles and
  ports), Skiper UI (terms forbid copying), Prompt Motion (no licence), libraries.dev `img-fx` (no licence found).
- Quality tools in the build, never shipped: impeccable (Apache-2.0) and taste-skill reviews; designlang to turn reference
  sites into design languages.

## How no gap stays hidden

1. `target-packs/components/variants.json` is the source of truth: per component, its variants (id, name, what it is
   for, the pattern it follows, its source and licence) and its motion (enter, hover, press, change), and per pack
   whether each is built.
2. A coverage check (server test plus a gates spec) fails the build when a variant listed for a pack is missing from
   the pack's source, its gallery (`?only=<id>&variant=<v>`) or the Component factory card.
3. Every variant passes the gates in every pack: axe with contrast in light and dark, phone, tablet and laptop,
   screenshots, and parity re-run so a variant never changes behaviour. Under all nine designs for the design gates.
4. Each component's variants get an impeccable and taste-skill review; findings are fixed before the wave is merged.
5. The progress dashboard counts variants: a row is done only when all its variants pass in all four packs.
6. `packs.json` records the source and licence of every ported or inspired component.

## Phases

| Row | Work | Runs |
|---|---|---|
| V0 | Foundation: split `bx.css` into one file per kind (`styles/<kind>.css`, joined by a script into the four identical copies, checked by a test); the nine designs drive every component through shared settings (radius, border, surface, elevation, density, type weight, focus) so each design changes all 245; React Native's theme the same; `variants.json` schema, coverage check, gallery `?variant=`, the factory card cycling a component's variants (the design stays a separate choice) | first, alone |
| V1 | Actions and inputs: button, iconbtn, text, textarea, password, number, select, chips, check, choice, switch, slider, date, daterange, upload, code, segmented | parallel after V0 |
| V2 | Containers and navigation: card, cards, tiles, kv, tabs, accordion, nav, menu, dialog, crumbs, pages, grid, divider, list, quick, table | parallel after V0 |
| V3 | Feedback and status: alert, toast, tooltip, badges, spinner, skeleton, empty, progress, stepper, timeline, status, timeout, chart, rating | parallel after V0 |
| V4 | Banking and widgets: bills, balance, payees, cardtile, txlist, receipt, form, calc, biometric, locator, chat, avatar, number, board, sensitive | parallel after V0 |
| V5 | Effects and motion: text effects, wrapper, backdrop, marquee, slides, row; motion presets for every kind; reduced motion everywhere | parallel after V0 |
| V6 | New showcase components (thinking-orbs AI loaders; Vengeance UI share sheet, glass dock, aurora and others MIT-licensed) and the React pack's MUI-based Material variants | parallel after V0 |
| V7 | Gates under all designs and variants, impeccable and taste reviews, release | last |

## Variant sets by kind (the starting point; each wave refines per component)

- button: filled, tonal, outlined, text, elevated, gradient, glass, pill; sizes s/m/l; with icon, loading, split
- iconbtn: filled, tonal, outlined, standard, circular, square
- text, number, password, textarea: outlined, filled, underlined, floating label, inline label, with prefix/suffix, search pill
- select, chips: outlined, filled, chips-in-field, segmented picker, sheet picker (phones), combobox with avatars
- check, choice: classic, cards (tile choices), toggle chips, list rows with descriptions
- switch: classic, iOS, Material 3 with icon, labelled on/off, squish
- slider: classic, range, stepped with ticks, value bubble, thick track
- segmented, tabs: underline, pill, enclosed, segmented control, vertical, scrollable with fades
- card, tiles, cards: elevated, outlined, filled, glass, gradient border, bento, spotlight, interactive lift
- kv: list rows, two columns, cards, compact table, receipt style
- dialog: centred, sheet (bottom), side panel, full screen (phones), alert dialog
- toast, alert: snackbar, stacked (sonner-style, written from scratch), banner, inline, toast with action
- progress, stepper, timeline: bar, ring, segmented steps, vertical timeline, dotted
- spinner, skeleton: ring, dots, orbs (thinking-orbs), shimmer, pulse
- nav, menu: side nav, rail, bottom bar, dock, pill nav, command menu
- table: plain, striped, cards on phones, dense, with sticky header
- banking widgets: compact, detailed, card, list, glass; each with its empty and loading states
- effects and backdrops: their own parameters (speed, density, palette) rather than visual variants

## Order and size

V0 is about a day. V1 to V6 run in parallel sessions (about 3 to 5 days, with the one-heavy-job-at-a-time rule on the
laptop: browser gates run on GitHub). V7 about a day. One release per merged wave, so the user can follow progress on
8080.

## How a wave adds a variant (set up in V0)

Worked example, built in all four packs: Card · Outlined (search `bx-v-outlined` and `variant="outlined"`).

1. `target-packs/components/variants.json`: in the component's entry (entries are grouped by wave, so waves edit
   separate parts of the file), refine the variant (`name`, `purpose`, `pattern`, `source`, `licence`) and add the packs
   to `built` as each is done. A new variant id is lowercase with hyphens; `default` stays first and is never renamed.
2. Web packs: the style goes in the kind's own file, `target-packs/components/styles/kinds/<kind>.css`, as
   `.bx-<part>.bx-v-<id>`, reading the shared settings (`--bx-radius*`, `--bx-bw`, `--bx-fill`, `--bx-card`,
   `--bx-shadow-*` ... see `styles/README.md`) so all nine designs still reach it. Run
   `node target-packs/components/tools/join-styles.mjs` to write the four bx.css copies; never edit a copy.
3. Each pack takes a `variant` prop: JET a `variant` string property (the class from `bx.variantClass(variant)`),
   React and Angular `variant` (a union of the ids), React Native `variant` drawn from the theme's settings.
4. Galleries: after the default instance in the component's section, add the variant wrapped in
   `<div data-variant="<id>">` (JET `gates/jet-gallery.html`, React `react/gallery/gallery.tsx`, Angular
   `angular/gallery/main.ts`) or `<Variant id="<id>">` (React Native `react-native/gates/gallery.tsx`), passing
   `variant="<id>"`. `?only=<component>&variant=<id>` then shows it alone, and the Component factory card cycles it.
5. Checks: `VariantsCoverageTest` (server) fails while a pack listed in `built` lacks the class, the prop value or the
   gallery element; the design gates (`GATES_DESIGN=all`, specs/designs.spec.ts in both gate folders; CI's
   design-gates job runs one design per runner) check every component and built variant under all nine designs.
   Motion: `motion` in the entry, effect names from `motion.json`.
6. Effects (wave V5: text and number effects, wrappers, backdrops, marquee, carousel, swipe row) have parameter
   presets rather than visual styles: the entry has a `css` root and each variant `params` (speed, intensity, density,
   sensitivity, palette, direction, effect, easing) and `motion` per phase (enter, hover, press, change, exit: a preset of
   `motion.json`'s `presets`, the motion library every kind can use as the `bx-m-<phase>-<name>` classes and `play()`).
   `node target-packs/components/tools/gen-motion.mjs` writes each pack's `presets` table, the library's block in
   `styles/base.css` and `styles/kinds/_fx.css` (each variant's settings as `--bx-fx-*` on `<css>.bx-v-<id>`, which the
   kind files read with today's values as fallbacks); then run join-styles.mjs.
