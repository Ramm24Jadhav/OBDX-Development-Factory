import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from './theme';

interface Props {
  testID: string;
  label: string;
  required?: boolean;
  helpText?: string;
  error?: string;
  children: ReactNode;
}

/** Label, help text and error message around an input. */
export function FormField({ testID, label, required, helpText, error, children }: Props) {
  return (
    <View testID={testID} style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : helpText ? <Text style={styles.help}>{helpText}</Text> : null}
    </View>
  );
}

export const inputStyle = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    paddingHorizontal: theme.spacing.m,
    paddingVertical: theme.spacing.s,
    fontSize: theme.font.input,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
  readOnly: { backgroundColor: theme.colors.surface, color: theme.colors.muted },
});

const styles = StyleSheet.create({
  field: { marginBottom: theme.spacing.l },
  label: { fontSize: theme.font.label, color: theme.colors.text, marginBottom: theme.spacing.xs, fontWeight: '600' },
  required: { color: theme.colors.error },
  help: { fontSize: theme.font.help, color: theme.colors.muted, marginTop: theme.spacing.xs },
  error: { fontSize: theme.font.help, color: theme.colors.error, marginTop: theme.spacing.xs },
});
