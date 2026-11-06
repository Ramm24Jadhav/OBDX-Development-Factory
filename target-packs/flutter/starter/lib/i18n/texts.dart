import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

/// The app's texts (assets/i18n/en.json), loaded once at start.
class Texts {
  const Texts._();

  static Map<String, Object?> _texts = {};

  static Future<void> load([String language = 'en']) async {
    loadFromString(await rootBundle.loadString('assets/i18n/$language.json'));
  }

  /// For tests: the texts from a JSON string (the same file).
  static void loadFromString(String json) {
    _texts = (jsonDecode(json) as Map<String, Object?>?) ?? {};
  }

  static String? _find(String key) {
    Object? node = _texts;
    for (final part in key.split('.')) {
      if (node is! Map<String, Object?>) {
        return null;
      }
      node = node[part];
    }
    return node is String ? node : null;
  }
}

/// The text for a key such as 'fundTransfer.amount', with {name} placeholders filled; the key itself when missing.
String t(String key, [Map<String, String> values = const {}]) {
  var text = Texts._find(key) ?? key;
  values.forEach((name, value) => text = text.replaceAll('{$name}', value));
  return text;
}
