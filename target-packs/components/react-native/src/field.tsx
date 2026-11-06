import { ReactNode, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Enter, Shake } from './motion';
import { Theme, useTheme } from './theme';

/** Props every field takes, the same as the web pack and the starter's components. */
export interface FieldProps<T> {
  testID: string;
  label: string;
  value: T;
  onChange?: (value: T) => void;
  required?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  helpText?: string;
  placeholder?: string;
  /** A message from the screen (validation rules, a server error). Shown in place of the field's own message. */
  error?: string;
}

export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

export function options(list: ReadonlyArray<string | Option>): Option[] {
  return list.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}

export function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

/** Field state: focus, and the message to show (the screen's error first, then required once touched). */
export function useField(props: { label: string; required?: boolean; error?: string }, value: unknown, own?: string) {
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const required = touched && props.required && isEmpty(value) ? `${props.label} is required.` : '';
  return {
    error: props.error || own || required, focused,
    onFocus: () => setFocused(true),
    onBlur: () => { setFocused(false); setTouched(true); },
    touch: () => setTouched(true),
  };
}

/** The label, the control and the message under it. Errors are announced (a live region on Android, an alert role on iOS). */
export function FieldShell({ testID, label, required, error, helpText, children }: {
  testID: string; label: string; required?: boolean; error: string; helpText?: string; children: ReactNode;
}) {
  const t = useTheme();
  const s = styles(t);
  return (
    <Enter testID={testID} style={s.field}>
      <Text style={s.label} importantForAccessibility="no">
        {label}
        {required ? <Text style={s.req}> *</Text> : null}
      </Text>
      <Shake testID={`${testID}-control`} error={error}>{children}</Shake>
      {error
        ? <Text testID={`${testID}-error`} style={s.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">{error}</Text>
        : helpText ? <Text testID={`${testID}-help`} style={s.help}>{helpText}</Text> : null}
    </Enter>
  );
}

/** The box around an input: the border shows focus, errors and disabled. */
export function controlStyle(t: Theme, state: { focused?: boolean; error?: string; disabled?: boolean; readOnly?: boolean }) {
  return {
    minHeight: t.minTouch, flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 14,
    borderRadius: t.radius.control, borderWidth: state.focused || state.error ? Math.max(t.border, 1.5) : t.border,
    borderColor: state.error ? t.color.danger : state.focused ? t.color.primary : t.look === 'soft' ? 'transparent' : t.color.borderStrong,
    backgroundColor: state.disabled ? t.color.surface3 : state.readOnly || t.look === 'soft' ? t.color.surface2 : t.color.surface,
    opacity: state.disabled ? 0.7 : 1,
    ...(t.shadow && !state.disabled ? { shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 } : {}),
  };
}

export const styles = (t: Theme) => StyleSheet.create({
  field: { marginBottom: t.space.l },
  label: { fontSize: 13, fontWeight: '600', color: t.color.textBody, marginBottom: 6 },
  req: { color: t.color.danger },
  help: { fontSize: 12.5, color: t.color.textMuted, marginTop: 6 },
  error: { fontSize: 12.5, color: t.color.dangerText, marginTop: 6, fontWeight: '500' },
  input: { flex: 1, fontSize: 16, color: t.color.text, paddingVertical: 10 },
  affix: { fontSize: 13, fontWeight: '600', color: t.color.textMuted, marginRight: 8 },
  side: { fontSize: 12, color: t.color.textMuted, marginLeft: 8 },
});
