# The bank's mobile app (Flutter)

A Flutter app for Android and iOS on the bank's OBDX REST services, written by the OBDX Development Factory. The
OBDX services stay as they are.

- `lib/components`: the only widgets screens are built from (fields, choices, buttons, screen and section), themed
  from the bank's tokens (`tokens.dart` is generated from `target-packs/components/tokens/tokens.json`).
- `lib/api`: `client.dart` keeps the OBDX session cookie, sends a fresh nonce with every call that changes something
  and can pin the bank's certificate (`config.dart`); one `<module>_api.dart` file per module.
- `lib/forms/form_model.dart`: a screen's values, rules (required, maximum length, the spec's checks) and messages.
- `assets/i18n/en.json`: every visible text, read with `t('screenKey.name')`.
- The design: `savedStyle` in `lib/components/component_style.dart` is the factory's component style
  (`ComponentStyle.fromJson` of the `defaults` the Component factory or `GET /api/workspaces/{id}/component-style`
  gives). `bxTheme` draws the nine designs (Elevated, Soft, Glass, Outline, Vivid, Pill, Neo-brutalist, Redwood and
  Liquid glass) in corners, borders, fills, the brand colour and the click effect; `BxGlass` frosts sections and
  secondary buttons on Glass and Liquid glass with a BackdropFilter, a tint and a lit rim, and turns solid under the
  phone's high contrast setting. Fields stay solid behind their text.
- `lib/app.dart`: the routes; `lib/screens/<module>/<screen>_page.dart`: the screens, each with a widget test in
  `test/screens/<module>/`.

Run it against the bank's server:

    flutter pub get
    flutter run --dart-define=OBDX_BASE_URL=https://digital.bank.example

Check it: `flutter analyze` and `flutter test`.
