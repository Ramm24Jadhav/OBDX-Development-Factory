import 'package:flutter/material.dart';

import 'component_style.dart';
import 'tokens.dart';

/// A page: its title, the sections, a failure message and the actions at the end.
class BxScreen extends StatelessWidget {
  const BxScreen({super.key, required this.title, required this.children, this.actions = const [], this.failure});

  final String title;
  final List<Widget> children;
  final List<Widget> actions;

  /// A message shown above the actions when sending failed.
  final String? failure;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SafeArea(
        // Not a lazy list: every field is built, so tests and screen readers find all of them
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(BxSizes.spaceL),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ...children,
              if (failure != null)
                Padding(
                  padding: const EdgeInsets.only(top: BxSizes.spaceM),
                  child: Semantics(liveRegion: true, child: Text(failure!, style: TextStyle(color: colors.error))),
                ),
              if (actions.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: BxSizes.spaceL),
                  child: Wrap(spacing: BxSizes.spaceS, runSpacing: BxSizes.spaceS, alignment: WrapAlignment.end, children: actions),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A group of fields with an optional title; side by side in columns when the screen is wide enough.
class BxSection extends StatelessWidget {
  const BxSection({super.key, this.title, this.columns = 1, required this.children});

  final String? title;
  final int columns;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final glass = Theme.of(context).extension<BxLookTheme>()?.glass ?? false;
    return Padding(
      padding: const EdgeInsets.only(bottom: BxSizes.spaceL),
      // a glass panel on Glass and Liquid glass; the fields inside keep their solid fill
      child: BxGlass(
        padding: glass ? const EdgeInsets.all(BxSizes.spaceL) : EdgeInsets.zero,
        child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null)
            Padding(
              padding: const EdgeInsets.only(bottom: BxSizes.spaceS),
              child: Semantics(header: true, child: Text(title!, style: Theme.of(context).textTheme.titleMedium)),
            ),
          LayoutBuilder(builder: (context, size) {
            final perRow = size.maxWidth >= 600 ? columns.clamp(1, 3) : 1;
            final width = (size.maxWidth - BxSizes.spaceM * (perRow - 1)) / perRow;
            return Wrap(
              spacing: BxSizes.spaceM,
              runSpacing: BxSizes.spaceM,
              children: [for (final child in children) SizedBox(width: width, child: child)],
            );
          }),
        ],
      ),
      ),
    );
  }
}
