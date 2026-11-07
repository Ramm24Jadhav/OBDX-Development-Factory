import 'package:flutter/material.dart';

import 'component_style.dart';
import 'tokens.dart';

/// The app's Material theme from the bank's tokens (light, or dark with dark: true) in the design of the component
/// style (component_style.dart): its corners, borders, fills, brand colour and click effect. Glass and Liquid glass
/// surfaces are drawn by BxGlass (sections and secondary buttons).
ThemeData bxTheme({bool dark = false, ComponentStyle? style}) {
  style ??= savedStyle;
  final look = style.look;
  final primary = style.brand ?? (look == BxLook.redwood ? const Color(0xFFC74634) : dark ? BxDarkColors.primary : BxColors.primary);
  final text = dark ? BxDarkColors.text : BxColors.text;
  final surface = dark ? BxDarkColors.surface : BxColors.surface;
  final scheme = dark
      ? ColorScheme.dark(
          primary: primary,
          onPrimary: style.brand != null || look == BxLook.redwood ? Colors.white : BxDarkColors.onPrimary,
          surface: surface,
          onSurface: text,
          error: BxDarkColors.danger,
          outline: BxDarkColors.borderStrong,
        )
      : ColorScheme.light(
          primary: primary,
          onPrimary: BxColors.onPrimary,
          surface: surface,
          onSurface: text,
          error: BxColors.dangerText,
          outline: BxColors.borderStrong,
        );
  final lookTheme = BxLookTheme(look: look, dark: dark);
  final corner = lookTheme.corner;
  final OutlinedBorder shape = look == BxLook.pill ? const StadiumBorder() : RoundedRectangleBorder(borderRadius: BorderRadius.circular(corner));
  final glass = lookTheme.glass ? glassTokens(lookTheme) : null;
  final fieldSide = switch (look) {
    BxLook.soft => BorderSide.none,
    BxLook.brutal => BorderSide(color: text, width: 2),
    BxLook.outline => BorderSide(color: scheme.outline, width: 1.5),
    _ => BorderSide(color: scheme.outline),
  };
  final fieldBorder = OutlineInputBorder(borderRadius: BorderRadius.circular(look == BxLook.pill ? 24 : corner), borderSide: fieldSide);
  return ThemeData(
    colorScheme: scheme,
    scaffoldBackgroundColor: dark ? BxDarkColors.bg : BxColors.bg,
    fontFamily: BxSizes.fontFamily,
    splashFactory: switch (style.click) { 'none' => NoSplash.splashFactory, 'ripple' => InkRipple.splashFactory, _ => null },
    extensions: [lookTheme],
    // Fields stay solid behind their text in every design, glass ones too
    inputDecorationTheme: InputDecorationTheme(
      border: fieldBorder,
      enabledBorder: fieldBorder,
      filled: look == BxLook.soft || glass != null,
      fillColor: look == BxLook.soft ? (dark ? BxDarkColors.surface3 : BxColors.surface3) : surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: BxSizes.spaceM, vertical: BxSizes.spaceM),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(0, BxSizes.controlHeightM),
        shape: shape,
        backgroundColor: look == BxLook.outline ? Colors.transparent : look == BxLook.liquid ? primary.withValues(alpha: 0.88) : primary,
        foregroundColor: look == BxLook.outline ? primary : scheme.onPrimary,
        side: switch (look) { BxLook.outline => BorderSide(color: primary, width: 1.5), BxLook.brutal => BorderSide(color: text, width: 2), _ => null },
        elevation: switch (look) { BxLook.elevated => 2, BxLook.vivid => 6, _ => 0 },
        shadowColor: look == BxLook.vivid ? primary : null,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, BxSizes.controlHeightM),
        shape: shape,
        backgroundColor: glass != null ? Colors.transparent : look == BxLook.soft ? (dark ? BxDarkColors.surface3 : BxColors.surface3) : null,
        side: switch (look) {
          BxLook.soft => BorderSide.none,
          BxLook.brutal => BorderSide(color: text, width: 2),
          BxLook.outline => BorderSide(color: primary, width: 1.5),
          _ when glass != null => BorderSide(color: glass.rim),
          _ => null,
        },
      ),
    ),
  );
}
