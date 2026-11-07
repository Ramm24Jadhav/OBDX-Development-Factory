import 'package:flutter/material.dart';

import 'tokens.dart';

String _label(String label, bool required) => required ? '$label *' : label;

/// A group's label and its message under it, around the choices.
class _Group extends StatelessWidget {
  const _Group({required this.label, required this.error, required this.helpText, required this.child});

  final String label;
  final String? error;
  final String? helpText;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      container: true,
      label: label,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: theme.textTheme.bodyMedium),
          child,
          if (error != null) Text(error!, style: TextStyle(color: theme.colorScheme.error, fontSize: BxSizes.fontSizeXs)),
          if (error == null && helpText != null) Text(helpText!, style: theme.textTheme.bodySmall),
        ],
      ),
    );
  }
}

/// One choice from a list that opens.
class BxSelectField extends StatelessWidget {
  const BxSelectField({
    super.key,
    required this.label,
    required this.value,
    required this.options,
    this.onChanged,
    this.error,
    this.required = false,
    this.readOnly = false,
    this.helpText,
    this.placeholder,
  });

  final String label;
  final String value;
  final List<String> options;
  final ValueChanged<String>? onChanged;
  final String? error;
  final bool required;
  final bool readOnly;
  final String? helpText;
  final String? placeholder;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: options.contains(value) ? value : null,
      items: [for (final option in options) DropdownMenuItem(value: option, child: Text(option))],
      onChanged: readOnly || onChanged == null ? null : (picked) => onChanged!(picked ?? ''),
      decoration: InputDecoration(labelText: _label(label, required), helperText: helpText, hintText: placeholder, errorText: error),
    );
  }
}

/// One choice from a short list, all shown.
class BxRadioGroup extends StatelessWidget {
  const BxRadioGroup({
    super.key,
    required this.label,
    required this.value,
    required this.options,
    this.onChanged,
    this.error,
    this.required = false,
    this.readOnly = false,
    this.helpText,
  });

  final String label;
  final String value;
  final List<String> options;
  final ValueChanged<String>? onChanged;
  final String? error;
  final bool required;
  final bool readOnly;
  final String? helpText;

  @override
  Widget build(BuildContext context) {
    return _Group(
      label: _label(label, required),
      error: error,
      helpText: helpText,
      child: RadioGroup<String>(
        groupValue: value.isEmpty ? null : value,
        onChanged: (picked) {
          if (!readOnly && picked != null) {
            onChanged?.call(picked);
          }
        },
        child: Column(children: [for (final option in options) RadioListTile<String>(value: option, title: Text(option), dense: true)]),
      ),
    );
  }
}

/// Several choices from a short list.
class BxCheckboxGroup extends StatelessWidget {
  const BxCheckboxGroup({
    super.key,
    required this.label,
    required this.value,
    required this.options,
    this.onChanged,
    this.error,
    this.required = false,
    this.readOnly = false,
    this.helpText,
  });

  final String label;
  final List<String> value;
  final List<String> options;
  final ValueChanged<List<String>>? onChanged;
  final String? error;
  final bool required;
  final bool readOnly;
  final String? helpText;

  @override
  Widget build(BuildContext context) {
    return _Group(
      label: _label(label, required),
      error: error,
      helpText: helpText,
      child: Column(children: [
        for (final option in options)
          CheckboxListTile(
            value: value.contains(option),
            title: Text(option),
            dense: true,
            controlAffinity: ListTileControlAffinity.leading,
            onChanged: readOnly || onChanged == null
                ? null
                : (on) => onChanged!(on == true ? [...value, option] : value.where((v) => v != option).toList()),
          ),
      ]),
    );
  }
}

/// On or off.
class BxSwitchField extends StatelessWidget {
  const BxSwitchField({super.key, required this.label, required this.value, this.onChanged, this.error, this.required = false, this.readOnly = false, this.helpText});

  final String label;
  final bool value;
  final ValueChanged<bool>? onChanged;
  final String? error;

  /// Must be on (a consent, for example).
  final bool required;
  final bool readOnly;
  final String? helpText;

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      value: value,
      title: Text(_label(label, required)),
      subtitle: error != null || helpText != null ? Text(error ?? helpText!) : null,
      contentPadding: EdgeInsets.zero,
      onChanged: readOnly ? null : onChanged,
    );
  }
}
