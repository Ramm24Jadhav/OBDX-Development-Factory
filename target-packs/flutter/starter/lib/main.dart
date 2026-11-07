import 'package:flutter/material.dart';

import 'app.dart';
import 'components/component_style.dart';
import 'i18n/texts.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Texts.load();
  await loadComponentStyle();
  runApp(const ObdxApp());
}
