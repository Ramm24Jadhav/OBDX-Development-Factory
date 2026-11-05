import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Theme, useTheme } from './theme';

export type Chroming = 'callToAction' | 'solid' | 'outlined' | 'borderless' | 'danger';

function look(t: Theme, chroming: Chroming) {
  const filled = chroming === 'callToAction' || chroming === 'solid' || chroming === 'danger';
  const outlineCta = t.look === 'outline' && chroming === 'callToAction';
  const bg = chroming === 'danger' ? t.color.danger : filled && !outlineCta ? t.color.primary : chroming === 'outlined' ? t.color.surface : 'transparent';
  return {
    box: { backgroundColor: bg, borderWidth: chroming === 'outlined' || outlineCta || t.look === 'brutal' ? Math.max(t.border, 1) : 0,
      borderColor: outlineCta ? t.color.primary : t.look === 'brutal' ? t.color.text : t.color.borderStrong },
    text: filled && !outlineCta ? t.color.onPrimary : chroming === 'borderless' || outlineCta ? t.color.primaryText : t.color.text,
  };
}

export interface ButtonProps {
  testID?: string;
  label: string;
  chroming?: Chroming;
  disabled?: boolean;
  /** Shows the button busy and stops a second press (a payment must not go twice). */
  busy?: boolean;
  startIcon?: ReactNode;
  onAction?: () => void;
}

/** A button (oj-button): callToAction is the screen's main action. */
export function Button({ testID, label, chroming = 'callToAction', disabled, busy, startIcon, onAction }: ButtonProps) {
  const t = useTheme();
  const l = look(t, chroming);
  const off = !!(disabled || busy);
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: off, busy: !!busy }}
               disabled={off} onPress={onAction}
               style={({ pressed }) => [{ minHeight: t.minTouch, paddingHorizontal: 20, borderRadius: t.radius.control, flexDirection: 'row', alignItems: 'center',
                 justifyContent: 'center', gap: 8, opacity: off ? 0.5 : 1, transform: [{ scale: pressed ? t.pressScale : 1 }] }, l.box]}>
      {busy ? <ActivityIndicator size="small" color={l.text} /> : startIcon}
      <Text style={{ color: l.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export interface IconButtonProps {
  testID?: string;
  /** What the button does; screen readers read it. */
  label: string;
  icon?: 'more' | 'close' | ReactNode;
  chroming?: Chroming;
  disabled?: boolean;
  onAction?: () => void;
}

/** A button with only an icon; the label names it for screen readers. At least 48 points square. */
export function IconButton({ testID, label, icon = 'more', chroming = 'borderless', disabled, onAction }: IconButtonProps) {
  const t = useTheme();
  const l = look(t, chroming);
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled}
               onPress={onAction} hitSlop={4}
               style={({ pressed }) => [{ width: t.minTouch, height: t.minTouch, borderRadius: t.radius.control, alignItems: 'center', justifyContent: 'center',
                 opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? t.pressScale : 1 }] }, l.box]}>
      {typeof icon === 'string'
        ? <Text style={{ color: l.text, fontSize: 20 }} importantForAccessibility="no">{icon === 'close' ? '×' : '⋯'}</Text>
        : <View importantForAccessibility="no-hide-descendants">{icon}</View>}
    </Pressable>
  );
}
