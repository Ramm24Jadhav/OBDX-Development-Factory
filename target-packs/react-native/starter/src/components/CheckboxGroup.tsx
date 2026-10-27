import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FormField } from './FormField';
import { theme } from './theme';
import { FieldProps, OptionProps } from './types';

/** Choose any number of options. */
export function CheckboxGroup({ testID, label, value, onChange, required, readOnly, helpText, error, options }:
                                FieldProps<string[]> & OptionProps) {
  const toggle = (option: string) =>
    onChange?.(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  return (
    <FormField testID={testID} label={label} required={required} helpText={helpText} error={error}>
      {options.map((option) => (
        <Pressable
          key={option}
          testID={`${testID}-option-${option}`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: value.includes(option), disabled: readOnly }}
          disabled={readOnly}
          onPress={() => toggle(option)}
          style={styles.row}>
          <View style={[styles.box, value.includes(option) ? styles.on : null]} />
          <Text style={styles.text}>{option}</Text>
        </Pressable>
      ))}
    </FormField>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing.xs },
  box: { width: 18, height: 18, borderRadius: 3, borderWidth: 2, borderColor: theme.colors.border, marginRight: theme.spacing.s },
  on: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
  text: { fontSize: theme.font.input, color: theme.colors.text },
});
