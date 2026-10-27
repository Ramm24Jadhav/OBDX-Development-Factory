import { StyleSheet, Text } from 'react-native';

import { FormField } from './FormField';
import { theme } from './theme';
import { FieldProps } from './types';

/** A value to show, not to edit. */
export function ReadOnlyField({ testID, label, value, helpText }: FieldProps<string>) {
  return (
    <FormField testID={testID} label={label} helpText={helpText}>
      <Text testID={`${testID}-value`} style={styles.value}>{value || '-'}</Text>
    </FormField>
  );
}

const styles = StyleSheet.create({
  value: { fontSize: theme.font.input, color: theme.colors.text, paddingVertical: theme.spacing.xs },
});
