import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

/// The nine designs of the factory's Component factory.
enum BxLook { elevated, soft, glass, outline, vivid, pill, brutal, redwood, liquid }

/// The component style saved in the factory's Component factory: a design (look), light or dark, a brand colour and
/// the click effect (phones have no hover; the scroll entrance is left to each screen).
class ComponentStyle {
  const ComponentStyle({this.look = BxLook.elevated, this.dark = false, this.brand, this.click = 'press'});

  /// The style's `defaults` as the factory gives them (the Component factory, or GET /api/workspaces/{id}/component-style).
  factory ComponentStyle.fromJson(Map<String, dynamic> defaults) {
    final look = BxLook.values.where((l) => l.name == defaults['look']).firstOrNull ?? BxLook.elevated;
    final motion = defaults['motion'] is Map<String, dynamic> ? defaults['motion'] as Map<String, dynamic> : const <String, dynamic>{};
    return ComponentStyle(look: look, dark: defaults['mode'] == 'dark', brand: brands[defaults['brand']], click: (motion['click'] as String?) ?? 'press');
  }

  final BxLook look;
  final bool dark;

  /// The brand colour the style picks, or null for the bank's own primary colour ("workspace").
  final Color? brand;
  final String click;

  /// The Component factory's brand swatches.
  static const brands = {'indigo': Color(0xFF4F46E5), 'emerald': Color(0xFF059669), 'burgundy': Color(0xFF9F1239), 'gold': Color(0xFFB45309)};
}

/// The workspace's component style. Replace it with the factory's (ComponentStyle.fromJson of the style's defaults).
const savedStyle = ComponentStyle();

/// The look on the theme, so components can draw it (`Theme.of(context).extension<BxLookTheme>()`).
class BxLookTheme extends ThemeExtension<BxLookTheme> {
  const BxLookTheme({required this.look, required this.dark});

  final BxLook look;
  final bool dark;

  /// Glass and Liquid glass draw their surfaces as glass.
  bool get glass => look == BxLook.glass || look == BxLook.liquid;

  /// The corner radius of controls in this design.
  double get corner => switch (look) { BxLook.pill => 999, BxLook.brutal => 4, BxLook.redwood => 6, _ => 8 };

  @override
  BxLookTheme copyWith({BxLook? look, bool? dark}) => BxLookTheme(look: look ?? this.look, dark: dark ?? this.dark);

  @override
  BxLookTheme lerp(BxLookTheme? other, double t) => t < 0.5 || other == null ? this : other;
}

/// A glass surface (target-packs/components/glass.json): frost and saturation of what is behind (BackdropFilter), a
/// translucent tint and a lit rim. Under high contrast it is a solid surface with a border, the fallback for less
/// transparency and system colours. Text on it keeps the theme's body colour.
class BxGlass extends StatelessWidget {
  const BxGlass({super.key, required this.child, this.radius = 14, this.padding = EdgeInsets.zero});

  final Widget child;
  final double radius;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final look = theme.extension<BxLookTheme>();
    if (look == null || !look.glass) return Padding(padding: padding, child: child);
    final shape = BorderRadius.circular(radius);
    if (MediaQuery.highContrastOf(context)) {
      return DecoratedBox(
        decoration: BoxDecoration(color: theme.colorScheme.surface, borderRadius: shape, border: Border.all(color: theme.colorScheme.onSurface)),
        child: Padding(padding: padding, child: child),
      );
    }
    final g = glassTokens(look);
    return ClipRRect(
      borderRadius: shape,
      child: BackdropFilter(
        filter: ImageFilter.compose(outer: ImageFilter.blur(sigmaX: g.blur, sigmaY: g.blur), inner: ColorFilter.matrix(saturation(g.saturate))),
        child: DecoratedBox(
          decoration: BoxDecoration(color: g.tint, borderRadius: shape, border: Border.all(color: g.rim)),
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

/// The tint, rim, blur and saturation of a glass look, light or dark: Liquid glass from glass.json, Glass a heavier frost.
({Color tint, Color rim, double blur, double saturate}) glassTokens(BxLookTheme look) {
  if (look.look == BxLook.liquid) {
    return look.dark
        ? (tint: const Color.fromRGBO(40, 40, 40, 0.62), rim: const Color.fromRGBO(255, 255, 255, 0.13), blur: 3, saturate: 1.5)
        : (tint: const Color.fromRGBO(255, 255, 255, 0.6), rim: const Color.fromRGBO(255, 255, 255, 0.3), blur: 3, saturate: 1.5);
  }
  return look.dark
      ? (tint: const Color.fromRGBO(17, 24, 39, 0.62), rim: const Color.fromRGBO(255, 255, 255, 0.12), blur: 12, saturate: 1.4)
      : (tint: const Color.fromRGBO(255, 255, 255, 0.62), rim: const Color.fromRGBO(226, 232, 240, 0.9), blur: 12, saturate: 1.4);
}

/// A colour matrix that saturates by s (1 leaves colours as they are).
List<double> saturation(double s) {
  const r = 0.2126, g = 0.7152, b = 0.0722;
  return [
    r * (1 - s) + s, g * (1 - s), b * (1 - s), 0, 0,
    r * (1 - s), g * (1 - s) + s, b * (1 - s), 0, 0,
    r * (1 - s), g * (1 - s), b * (1 - s) + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
}
