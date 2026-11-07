import 'package:flutter/material.dart';

import 'component_style.dart';

/// primary: the screen's main action; secondary: another action; link: a quiet one (Cancel, Back).
enum BxVariant { primary, secondary, link }

/// A button; while busy it shows a spinner and does not react.
class BxButton extends StatelessWidget {
  const BxButton({super.key, required this.label, this.onPressed, this.variant = BxVariant.secondary, this.busy = false});

  final String label;
  final VoidCallback? onPressed;
  final BxVariant variant;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final onTap = busy ? null : onPressed;
    final child = busy
        ? Row(mainAxisSize: MainAxisSize.min, children: [
            const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
            const SizedBox(width: 8),
            Text(label),
          ])
        : Text(label);
    return Semantics(
      button: true,
      label: busy ? '$label, working' : null,
      child: switch (variant) {
        BxVariant.primary => FilledButton(onPressed: onTap, child: child),
        // on Glass and Liquid glass a secondary button is a glass surface (BxGlass draws nothing extra on the other looks)
        BxVariant.secondary => BxGlass(radius: Theme.of(context).extension<BxLookTheme>()?.corner ?? 8, child: OutlinedButton(onPressed: onTap, child: child)),
        BxVariant.link => TextButton(onPressed: onTap, child: child),
      },
    );
  }
}
