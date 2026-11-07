# bx.css sources

`bx.css` is the one stylesheet the JET, React and Angular premium packs share (and the Angular starter's copy). Edit the
files here, never a copy, then run `node target-packs/components/tools/join-styles.mjs` (Node 22). It writes the four
identical copies; `--check` (and the server test `ComponentStylesTest`) fails when a copy is out of date.

Join order (later rules win a tie):

1. `base.css`: tokens, the dark theme, the shared settings the designs drive, keyframes several kinds use.
2. `kinds/*.css` in name order: one file per catalogue `kind` (`button.css`, `tabs.css` ...). `_field.css`, `_panel.css`
   and `_card.css` are parts several kinds build on; the `_` puts them first so a kind can refine them.
3. `designs.css`: the nine designs (`bx-look-*`). A design sets the shared settings; only what a setting cannot say
   (Liquid glass's frost, Outline's hollow call to action) is a rule here.
4. `end.css`: utilities that must win (bar widths), reduced motion, touch sizes.

Rules for a kind file: read the shared settings (`--bx-radius*`, `--bx-bw`, `--bx-border*`, `--bx-fill`, `--bx-card`,
`--bx-raised`, `--bx-shadow-*`, `--bx-pad*`, `--bx-weight*`, `--bx-focus`, `--bx-gradient`), not fixed values, so every
design reaches the component. A variant is a class on the component's root, `bx-v-<variant id>` (see
`target-packs/components/variants.json` and its README section in `docs/COMPONENT-VARIANTS-PLAN.md`), written in the
kind's own file.
