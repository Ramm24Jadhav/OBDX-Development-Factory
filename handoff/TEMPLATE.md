# Handoff: <agent> · <group or pack>

Commit: <hash> on branch <branch>

## Built

| Component | JET element | React | Angular | React Native | Unit tests |
|---|---|---|---|---|---|

## For the shared files (the main session applies these)

- **bx.css** (one section, `/* ---------- <group> ---------- */`, `bx-` classes only):
- **Exports** (`react/src/index.ts`, `angular/src/index.ts`, `react-native/src/index.ts`, `bx.js` elements):
- **Galleries** (a section per component, `data-component="<id>"`, in the states it has):
- **catalogue.json** (an `api` block per component and its `builtOn` per pack):
- **Anything else** (PackFiles, TargetPacks, starters, docs):

## Checks run

- Unit tests: <command> → <passed>/<total>

## Open questions for the user
