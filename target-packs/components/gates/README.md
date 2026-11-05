# Browser gates of the premium packs

The gates a component must pass before the Component factory shows it as Available, run in Chromium with Playwright on
each web pack's gallery. Every foundation component sits in its own `<section data-component="id">`.

| Gate | What it checks |
|---|---|
| Accessibility | axe with every rule, colour contrast included, in the light theme |
| Themes | the dark theme changes the component, and axe (contrast included) still passes |
| Responsive | at 375, 768 and 1280 px nothing runs past the section or makes the page scroll sideways, and controls are at least 24 by 24 px on a phone (WCAG 2.5.8) |
| Visual | light and dark screenshots match the accepted ones in `snapshots/<platform>/` |
| Parity (premium JET) | the JET element and the `bx-` element that replaces it are driven the same way in one JET app, and the screen's view model must see the same values, events and methods |

The galleries:

- `../react/gallery` and `../angular/gallery`, served by each pack's Vite.
- `jet-gallery.html` and `jet-parity.html`, real JET apps served by `serve.mjs`:
  - `?jet=6` runs JET 6.2, what OBDX 22.1 ships (from `jet6/`).
  - `?jet=21` runs the current release (from `jet21/`).

## Run

```bash
cd target-packs/components
for d in react angular gates gates/jet6 gates/jet21; do (cd $d && npm ci); done
cd gates && npx playwright install chromium
npm run gates          # all gates; npm run gates:update to accept new screenshots
node record.mjs        # writes the results into ../packs.json
```

Use Node 22, the version the factory build downloads. CI (`component-gates`) runs the same on Linux. Linux is the
reference platform for screenshots: when `snapshots/linux` is missing, the job writes the screenshots and uploads them
as an artifact, ready to commit.

## Known differences from JET

`bx-select` never picks an option by itself. With no value and no placeholder, JET's `oj-select-one` and
`oj-select-single` choose the first option, which could choose an account the customer did not pick. Screens that
relied on this set the value or a placeholder (the parity test uses a placeholder).
