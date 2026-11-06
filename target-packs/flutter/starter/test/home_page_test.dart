import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:obdx_app/components/components.dart';
import 'package:obdx_app/i18n/texts.dart';
import 'package:obdx_app/screens/home/home_page.dart';

void main() {
  setUpAll(() => Texts.loadFromString(File('assets/i18n/en.json').readAsStringSync()));

  testWidgets('shows the welcome', (tester) async {
    await tester.pumpWidget(MaterialApp(theme: bxTheme(), home: const HomePage()));
    expect(find.byKey(const ValueKey('home-welcome')), findsOneWidget);
    expect(find.text('Home'), findsOneWidget);
  });
}
