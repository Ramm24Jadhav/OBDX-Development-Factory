import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FormField, inputStyle } from './FormField';
import { theme } from './theme';
import { FieldProps, OptionProps } from './types';

/** Choose one option from a list that opens under the field. */
export function SelectField({ testID, label, value, onChange, required, readOnly, helpText, placeholder, error, options }:
                              FieldProps<string> & OptionProps) {
  const [open, setOpen] = useState(false);
  return (
    <FormField testID={testID} label={label} required={required} helpText={helpText} error={error}>
      <Pressable
        testID={`${testID}-input`}
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={readOnly}
        onPress={() => setOpen(!open)}
        style={[inputStyle.input, styles.row, readOnly ? inputStyle.readOnly : null]}>
        <Text style={value ? styles.value : styles.placeholder}>{value || placeholder || 'Select'}</Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.list}>
          {options.map((option) => (
            <Pressable
              key={option}
              testID={`${testID}-option-${option}`}
              accessibilityRole="button"
              onPress={() => {
                onChange?.(option);
                setOpen(false);
              }}
              style={[styles.option, option === value ? styles.selected : null]}>
              <Text style={styles.value}>{option}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </FormField>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  value: { fontSize: theme.font.input, color: theme.colors.text },
  placeholder: { fontSize: theme.font.input, color: theme.colors.muted },
  chevron: { fontSize: theme.font.help, color: theme.colors.muted },
  list: { borderWidth: 1, borderTopWidth: 0, borderColor: theme.colors.border, borderRadius: theme.radius },
  option: { paddingHorizontal: theme.spacing.m, paddingVertical: theme.spacing.m },
  selected: { backgroundColor: theme.colors.selected },
});
