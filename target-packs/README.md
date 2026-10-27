# Target packs

A target pack teaches the OBDX Development Factory how to turn an approved, target-neutral Screen Model into code
for one UI technology. A workspace uses one version pack (OBDX release) and one target pack at a time.

| Pack | For | Preview in the designer |
|---|---|---|
| `jet` | Enhancing the bank's existing Oracle JET UI (the default) | Real JET components |
| `react-native` | A new iOS/Android app on the OBDX REST services (Expo) | The starter's components with React Native Web |
| `react` | A new web app on the OBDX REST services (Vite) | The starter's components with React |

Each pack folder holds:

- `target.yml`: the component mapping (Screen Model type to starter component), where files go, guidance for the
  model, quick-check rules and recipes (same formats as the version packs).
- `templates/`: the screen, test and API templates the factory fills from a Screen Model (`{{placeholders}}`).
- `starter/`: the starter project: navigation, API client, texts, form handling and the form components. The
  designer's preview renders these same components, so customers review what the app will use. Restyle the
  components or rebuild them with the bank's design system; generated screens keep working.

This folder is packaged into the factory server and also read by the UI build (for the previews). Teams can override a
pack without rebuilding by putting a `targets/<id>/target.yml` in `FACTORY_PACKS_DIR` (see docs/DEVELOPMENT.md).
