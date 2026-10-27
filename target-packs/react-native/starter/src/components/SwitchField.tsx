import { StyleSheet, Switch, Text, View } from 'react-native';

import { theme } from './theme';
import { FieldProps } from './types';

/** On or off. */
export function SwitchField({ testID, label, value, onChange, readOnly, helpText }: FieldProps<boolean>) {
  return (
    <View testID={testID} style={styles.field}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Switch testID={`${testID}-input`} accessibilityLabel={label} value={value} onValueChange={onChange} disabled={readOnly}
                trackColor={{ true: theme.colors.primary, false: theme.colors.border }} />
      </View>
      {helpText ? <Text style={styles.help}>{helpText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: theme.spacing.l },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: theme.font.label, color: theme.colors.text, fontWeight: '600', flexShrink: 1, marginRight: theme.spacing.m },
  help: { fontSize: theme.font.help, color: theme.colors.muted, marginTop: theme.spacing.xs },
});
