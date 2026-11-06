import 'package:flutter/material.dart';

import 'tokens.dart';

/// The app's Material theme from the bank's tokens (light, or dark with dark: true).
ThemeData bxTheme({bool dark = false}) {
  final scheme = dark
      ? const ColorScheme.dark(
          primary: BxDarkColors.primary,
          onPrimary: BxDarkColors.onPrimary,
          surface: BxDarkColors.surface,
          onSurface: BxDarkColors.text,
          error: BxDarkColors.danger,
          outline: BxDarkColors.borderStrong,
        )
      : const ColorScheme.light(
          primary: BxColors.primary,
          onPrimary: BxColors.onPrimary,
          surface: BxColors.surface,
          onSurface: BxColors.text,
          error: BxColors.dangerText,
          outline: BxColors.borderStrong,
        );
  final radius = BorderRadius.circular(BxSizes.radiusM);
  return ThemeData(
    colorScheme: scheme,
    scaffoldBackgroundColor: dark ? BxDarkColors.bg : BxColors.bg,
    fontFamily: BxSizes.fontFamily,
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: radius),
      contentPadding: const EdgeInsets.symmetric(horizontal: BxSizes.spaceM, vertical: BxSizes.spaceM),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(minimumSize: const Size(0, BxSizes.controlHeightM), shape: RoundedRectangleBorder(borderRadius: radius)),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(minimumSize: const Size(0, BxSizes.controlHeightM), shape: RoundedRectangleBorder(borderRadius: radius)),
    ),
  );
}
