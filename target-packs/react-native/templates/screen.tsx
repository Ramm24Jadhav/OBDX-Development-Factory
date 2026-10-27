/*
 * {{title}}: built from the approved Screen Model "{{modelName}}" by the OBDX Development Factory.
 * Every field and action keeps its Screen Model id as testID.
 */
import { useState } from 'react';
import { Text } from 'react-native';

import { ApiError } from '../../api/client';
import { {{imports}} } from '../../components';
import { useForm } from '../../forms/useForm';
import { t } from '../../i18n';

interface Props {
  /** Called with the id of a secondary or link action, for navigation. */
  onAction?: (actionId: string) => void;
  /** Called when the main action has succeeded. */
  onDone?: () => void;
}

export function {{Screen}}Screen({ onAction, onDone }: Props) {
{{optionLists}}  const form = useForm({
{{initialValues}}  }, {
{{rules}}  });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();

  const submit = async () => {
    if (!form.validate()) {
      return;
    }
    setBusy(true);
    setFailure(undefined);
    try {
      // Send form.values with the module's API file (src/api/{{module}}Api.ts).
      onDone?.();
    } catch (e) {
      setFailure(e instanceof ApiError ? e.message : t('common.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title={t('{{screenKey}}.title')}
      actions={
        <>
          {failure ? <Text style={{ color: theme.colors.error }}>{failure}</Text> : null}
{{actions}}        </>
      }>
{{sections}}    </Screen>
  );
}
