import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from './theme';

/**
 * A titled group of fields. On phones fields are stacked; columns (from the Screen Model) is kept for a tablet
 * layout the bank may add.
 */
export function Section({ title, children }: { title?: string; columns?: number; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: theme.spacing.l },
  title: { fontSize: theme.font.section, fontWeight: '700', color: theme.colors.text, marginBottom: theme.spacing.m },
});
