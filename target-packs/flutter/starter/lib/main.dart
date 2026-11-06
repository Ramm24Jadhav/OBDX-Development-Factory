import 'package:flutter/material.dart';

import 'app.dart';
import 'i18n/texts.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Texts.load();
  runApp(const ObdxApp());
}
