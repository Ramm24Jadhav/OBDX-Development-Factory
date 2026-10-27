import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from './theme';

/** The scrolling frame of a screen, with its title and, at the bottom, its actions. */
export function Screen({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {children}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.l },
  title: { fontSize: theme.font.title, fontWeight: '700', color: theme.colors.text, marginBottom: theme.spacing.l },
  actions: { marginTop: theme.spacing.s },
});
