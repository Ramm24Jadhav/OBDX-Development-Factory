import 'package:flutter/foundation.dart';

import '../i18n/texts.dart';

/// What to check for one field before the form is sent.
class FieldRule {
  const FieldRule({required this.label, this.required = false, this.maxLength, this.check});

  final String label;
  final bool required;
  final int? maxLength;

  /// Further checks from the spec; return a message when the value is not valid.
  final String? Function(Object? value)? check;
}

/// One screen's field values, their validation messages and validate(). A field's message clears as soon as its
/// value changes; listen to it (ListenableBuilder) to rebuild the screen.
class FormModel extends ChangeNotifier {
  FormModel(Map<String, Object?> initial, [this.rules = const {}]) : _values = Map.of(initial);

  final Map<String, Object?> _values;
  final Map<String, FieldRule> rules;
  final Map<String, String> _errors = {};

  String text(String name) => (_values[name] as String?) ?? '';
  double? number(String name) => _values[name] as double?;
  bool flag(String name) => (_values[name] as bool?) ?? false;
  List<String> list(String name) => (_values[name] as List<String>?) ?? const [];
  String? error(String name) => _errors[name];

  void set(String name, Object? value) {
    _values[name] = value;
    _errors.remove(name);
    notifyListeners();
  }

  static bool _isEmpty(Object? value) => value == null || value == '' || (value is List && value.isEmpty);

  /// Checks every field; shows the messages and returns true when all are valid.
  bool validate() {
    _errors.clear();
    rules.forEach((name, rule) {
      final value = _values[name];
      String? message;
      if (rule.required && _isEmpty(value)) {
        message = t('common.required', {'label': rule.label});
      } else if (rule.maxLength != null && value is String && value.length > rule.maxLength!) {
        message = t('common.tooLong', {'label': rule.label, 'max': '${rule.maxLength}'});
      } else if (rule.check != null && !_isEmpty(value)) {
        message = rule.check!(value);
      }
      if (message != null) {
        _errors[name] = message;
      }
    });
    notifyListeners();
    return _errors.isEmpty;
  }

  /// The current values, to send.
  Map<String, Object?> snapshot() => Map.unmodifiable(_values);
}
