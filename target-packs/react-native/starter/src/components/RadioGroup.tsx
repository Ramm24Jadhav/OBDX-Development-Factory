import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FormField } from './FormField';
import { theme } from './theme';
import { FieldProps, OptionProps } from './types';

/** Choose one of a few options, all visible. */
export function RadioGroup({ testID, label, value, onChange, required, readOnly, helpText, error, options }:
                             FieldProps<string> & OptionProps) {
  return (
    <FormField testID={testID} label={label} required={required} helpText={helpText} error={error}>
      {options.map((option) => (
        <Pressable
          key={option}
          testID={`${testID}-option-${option}`}
          accessibilityRole="radio"
          accessibilityState={{ checked: option === value, disabled: readOnly }}
          disabled={readOnly}
          onPress={() => onChange?.(option)}
          style={styles.row}>
          <View style={[styles.circle, option === value ? styles.on : null]} />
          <Text style={styles.text}>{option}</Text>
        </Pressable>
      ))}
    </FormField>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing.xs },
  circle: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: theme.colors.border, marginRight: theme.spacing.s },
  on: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
  text: { fontSize: theme.font.input, color: theme.colors.text },
});
