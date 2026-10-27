import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from './theme';

interface Props {
  testID: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'link';
  disabled?: boolean;
  onPress?: () => void;
}

/** A screen action: primary (the main one), secondary or link. */
export function Button({ testID, label, variant = 'secondary', disabled, onPress }: Props) {
  return (
    <Pressable testID={testID} accessibilityRole="button" disabled={disabled} onPress={onPress}
               style={[styles.base, styles[variant], disabled ? styles.disabled : null]}>
      <Text style={[styles.text, variant === 'primary' ? styles.primaryText : variant === 'link' ? styles.linkText : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: theme.radius, paddingVertical: theme.spacing.m, paddingHorizontal: theme.spacing.l, alignItems: 'center',
          marginBottom: theme.spacing.s },
  primary: { backgroundColor: theme.colors.primary },
  secondary: { borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.background },
  link: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.5 },
  text: { fontSize: theme.font.input, fontWeight: '600', color: theme.colors.primary },
  primaryText: { color: theme.colors.primaryText },
  linkText: { textDecorationLine: 'underline' },
});
