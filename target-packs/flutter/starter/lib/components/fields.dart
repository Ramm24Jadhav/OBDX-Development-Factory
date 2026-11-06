import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'tokens.dart';

String _label(String label, bool required) => required ? '$label *' : label;

/// A text box. The value lives in the screen's form; the box shows it and reports every change.
class BxTextField extends StatefulWidget {
  const BxTextField({
    super.key,
    required this.label,
    required this.value,
    this.onChanged,
    this.error,
    this.required = false,
    this.readOnly = false,
    this.maxLength,
    this.helpText,
    this.placeholder,
    this.keyboardType,
    this.maxLines = 1,
  });

  final String label;
  final String value;
  final ValueChanged<String>? onChanged;
  final String? error;
  final bool required;
  final bool readOnly;
  final int? maxLength;
  final String? helpText;
  final String? placeholder;
  final TextInputType? keyboardType;
  final int maxLines;

  @override
  State<BxTextField> createState() => _BxTextFieldState();
}

class _BxTextFieldState extends State<BxTextField> {
  late final TextEditingController _controller = TextEditingController(text: widget.value);

  @override
  void didUpdateWidget(BxTextField old) {
    super.didUpdateWidget(old);
    // Only a change from outside (a reset, loaded data) moves the text; typing keeps the cursor where it is
    if (widget.value != _controller.text) {
      _controller.text = widget.value;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controller,
      onChanged: widget.onChanged,
      readOnly: widget.readOnly,
      maxLength: widget.maxLength,
      maxLines: widget.maxLines,
      keyboardType: widget.keyboardType,
      decoration: InputDecoration(
        labelText: _label(widget.label, widget.required),
        helperText: widget.helpText,
        hintText: widget.placeholder,
        errorText: widget.error,
      ),
    );
  }
}

/// A longer text, several lines.
class BxTextArea extends BxTextField {
  const BxTextArea({
    super.key,
    required super.label,
    required super.value,
    super.onChanged,
    super.error,
    super.required,
    super.readOnly,
    super.maxLength,
    super.helpText,
    super.placeholder,
  }) : super(maxLines: 4);
}

/// An amount: digits and one decimal point; the form keeps it as a number (null when empty).
class BxAmountField extends StatelessWidget {
  const BxAmountField({
    super.key,
    required this.label,
    required this.value,
    this.onChanged,
    this.error,
    this.required = false,
    this.readOnly = false,
    this.helpText,
    this.placeholder,
  });

  final String label;
  final double? value;
  final ValueChanged<double?>? onChanged;
  final String? error;
  final bool required;
  final bool readOnly;
  final String? helpText;
  final String? placeholder;

  @override
  Widget build(BuildContext context) {
    return BxTextField(
      label: label,
      value: value == null ? '' : _plain(value!),
      onChanged: onChanged == null ? null : (text) => onChanged!(double.tryParse(text)),
      error: error,
      required: required,
      readOnly: readOnly,
      helpText: helpText,
      placeholder: placeholder,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
    );
  }

  static String _plain(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();
}

/// A date (yyyy-MM-dd in the form), picked from a calendar.
class BxDateField extends StatelessWidget {
  const BxDateField({
    super.key,
    required this.label,
    required this.value,
    this.onChanged,
    this.error,
    this.required = false,
    this.readOnly = false,
    this.helpText,
    this.placeholder,
  });

  final String label;
  final String value;
  final ValueChanged<String>? onChanged;
  final String? error;
  final bool required;
  final bool readOnly;
  final String? helpText;
  final String? placeholder;

  Future<void> _pick(BuildContext context) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.tryParse(value) ?? now,
      firstDate: DateTime(now.year - 100),
      lastDate: DateTime(now.year + 50),
    );
    if (picked != null) {
      onChanged?.call(picked.toIso8601String().substring(0, 10));
    }
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: readOnly || onChanged == null ? null : () => _pick(context),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: _label(label, required),
          helperText: helpText,
          hintText: placeholder,
          errorText: error,
          suffixIcon: const Icon(Icons.calendar_today_outlined),
        ),
        isEmpty: value.isEmpty,
        child: Text(value),
      ),
    );
  }
}

/// Shows a value that cannot be changed here.
class BxReadOnlyField extends StatelessWidget {
  const BxReadOnlyField({super.key, required this.label, required this.value, this.helpText});

  final String label;
  final String value;
  final String? helpText;

  @override
  Widget build(BuildContext context) {
    return InputDecorator(
      decoration: InputDecoration(labelText: label, helperText: helpText, border: InputBorder.none),
      child: Text(value.isEmpty ? '—' : value, style: const TextStyle(fontSize: BxSizes.fontSizeL)),
    );
  }
}

/// Digits only, for number fields that are not amounts.
final digitsOnly = FilteringTextInputFormatter.digitsOnly;
