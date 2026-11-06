import 'package:flutter/material.dart';

import 'components/components.dart';
import 'screens/home/home_page.dart';

/// The app's pages by route name; each generated screen gets one line here.
final Map<String, WidgetBuilder> routes = {
  '/': (context) => const HomePage(),
};

class ObdxApp extends StatelessWidget {
  const ObdxApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'OBDX',
      theme: bxTheme(),
      darkTheme: bxTheme(dark: true),
      routes: routes,
    );
  }
}
