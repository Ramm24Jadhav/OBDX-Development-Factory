import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:obdx_app/components/components.dart';
import 'package:obdx_app/i18n/texts.dart';
import 'package:obdx_app/screens/{{module}}/{{screen_file}}_page.dart';

// From the approved Screen Model "{{modelName}}": every field and action keeps its id as its key.
const ids = [{{componentIds}}];

void main() {
  setUpAll(() => Texts.loadFromString(File('assets/i18n/en.json').readAsStringSync()));

  Widget app() => MaterialApp(theme: bxTheme(), home: const {{Screen}}Page());

  testWidgets('shows every field and action of the approved design', (tester) async {
    await tester.pumpWidget(app());
    for (final id in ids) {
      expect(find.byKey(ValueKey(id)), findsOneWidget, reason: id);
    }
  });
{{requiredTest:
  testWidgets('asks for the required fields', (tester) async {
    await tester.pumpWidget(app());
    final submit = find.byKey(const ValueKey('{{primaryAction}}'));
    await tester.ensureVisible(submit);
    await tester.tap(submit);
    await tester.pump();
    expect(find.textContaining(RegExp(r'^Enter ')), findsNWidgets({{requiredCount}}));
  });
}}
}
