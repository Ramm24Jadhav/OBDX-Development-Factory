import 'package:flutter/material.dart';

import '../../components/components.dart';
import '../../i18n/texts.dart';

/// The first page; the generated screens are added beside it in lib/screens and routed in lib/app.dart.
class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return BxScreen(title: t('home.title'), children: [Text(t('home.welcome'), key: const ValueKey('home-welcome'))]);
  }
}
