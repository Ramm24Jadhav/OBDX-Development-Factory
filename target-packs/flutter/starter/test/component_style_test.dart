import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:obdx_app/components/components.dart';

Widget section(ComponentStyle style, {bool highContrast = false}) => MaterialApp(
      theme: bxTheme(style: style),
      home: MediaQuery(
        data: MediaQueryData(highContrast: highContrast),
        child: const Scaffold(body: BxSection(title: 'Payee', children: [BxButton(label: 'Back')])),
      ),
    );

void main() {
  test('reads the style the factory saves', () {
    final style = ComponentStyle.fromJson({'look': 'liquid', 'mode': 'dark', 'brand': 'emerald', 'motion': {'click': 'ripple'}});
    expect(style.look, BxLook.liquid);
    expect(style.dark, isTrue);
    expect(style.brand, const Color(0xFF059669));
    expect(style.click, 'ripple');
    expect(ComponentStyle.fromJson({'look': 'unknown'}).look, BxLook.elevated);
    expect(bxTheme(style: style).colorScheme.primary, const Color(0xFF059669));
  });

  test('loads the style the factory writes into assets/component-style.json', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await loadComponentStyle();
    expect(savedStyle.look, BxLook.elevated);
    expect(savedStyle.click, 'press');
  });

  test('every design makes a theme', () {
    for (final look in BxLook.values) {
      expect(bxTheme(style: ComponentStyle(look: look)).extension<BxLookTheme>()!.look, look);
    }
    expect(bxTheme(style: const ComponentStyle(look: BxLook.redwood)).colorScheme.primary, const Color(0xFFC74634));
  });

  testWidgets('Liquid glass frosts sections and secondary buttons with the glass.json tint', (tester) async {
    await tester.pumpWidget(section(const ComponentStyle(look: BxLook.liquid)));
    expect(find.byType(BackdropFilter), findsNWidgets(2));
    final box = tester.widget<DecoratedBox>(find.descendant(of: find.byType(BackdropFilter).first, matching: find.byType(DecoratedBox)).first);
    expect((box.decoration as BoxDecoration).color, const Color.fromRGBO(255, 255, 255, 0.6));
  });

  testWidgets('other designs draw no glass, and high contrast draws a solid surface', (tester) async {
    await tester.pumpWidget(section(const ComponentStyle(look: BxLook.brutal)));
    expect(find.byType(BackdropFilter), findsNothing);
    await tester.pumpWidget(section(const ComponentStyle(look: BxLook.liquid), highContrast: true));
    expect(find.byType(BackdropFilter), findsNothing);
  });
}
