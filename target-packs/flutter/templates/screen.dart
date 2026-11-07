/*
 * {{title}}: page built from the approved Screen Model "{{modelName}}" by the OBDX Development Factory.
 * Every field and action keeps its Screen Model id as its key (ValueKey).
 */
import 'package:flutter/material.dart';

import '../../api/client.dart';
import '../../components/components.dart';
import '../../forms/form_model.dart';
import '../../i18n/texts.dart';

class {{Screen}}Page extends StatefulWidget {
  const {{Screen}}Page({super.key, this.onAction, this.onDone});

  /// Called with the id of a secondary or link action, for navigation.
  final ValueChanged<String>? onAction;

  /// Called when the main action has succeeded.
  final VoidCallback? onDone;

  @override
  State<{{Screen}}Page> createState() => _{{Screen}}PageState();
}

class _{{Screen}}PageState extends State<{{Screen}}Page> {
{{optionLists}}  late final FormModel form = FormModel({
{{initialValues}}  }, {
{{rules}}  });
  bool busy = false;
  String? failure;

  @override
  void dispose() {
    form.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (!form.validate()) {
      return;
    }
    setState(() {
      busy = true;
      failure = null;
    });
    try {
      // Send form.snapshot() with the module's API file (lib/api/{{module}}_api.dart).
      widget.onDone?.call();
    } on ApiError catch (e) {
      setState(() => failure = e.message);
    } finally {
      if (mounted) {
        setState(() => busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: form,
      builder: (context, _) => BxScreen(
        title: t('{{screenKey}}.title'),
        failure: failure,
        actions: [
{{actions}}        ],
        children: [
{{sections}}        ],
      ),
    );
  }
}
