import { ReactNode, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Enter, Shake } from './motion';
import { Theme, useTheme } from './theme';
import { FIELD_KINDS, part } from './variants';

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
    <Enter testID={testID} style={[s.field, part(t, FIELD_KINDS, 'shell')]}>
      <Text style={[s.label, part(t, FIELD_KINDS, 'label')]} importantForAccessibility="no">
        {label}
        {required ? <Text style={s.req}> *</Text> : null}
      </Text>
      <Shake testID={`${testID}-control`} error={error} style={part(t, FIELD_KINDS, 'body')}>{children}</Shake>
      {error
        ? <Text testID={`${testID}-error`} style={[s.error, part(t, FIELD_KINDS, 'message')]} accessibilityRole="alert" accessibilityLiveRegion="assertive">{error}</Text>
        : helpText ? <Text testID={`${testID}-help`} style={[s.help, part(t, FIELD_KINDS, 'message')]}>{helpText}</Text> : null}
    </Enter>
  );
}

/** The box around an input: the border shows focus, errors and disabled. */
export function controlStyle(t: Theme, state: { focused?: boolean; error?: string; disabled?: boolean; readOnly?: boolean }) {
  return {
    minHeight: t.minTouch, flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: t.pad,
    borderRadius: t.radius.control, borderWidth: state.focused || state.error ? Math.max(t.border, 1.5) : t.border,
    borderColor: state.error ? t.color.danger : state.focused ? t.color.primary : t.lineStrong,
    backgroundColor: state.disabled ? t.color.surface3 : state.readOnly ? t.color.surface2 : t.fill,
    opacity: state.disabled ? 0.7 : 1,
    ...(!state.disabled && t.look !== 'soft' ? t.elevation(1) : {}),
    ...part(t, FIELD_KINDS, 'control', state),
  };
}

export const styles = (t: Theme) => StyleSheet.create({
  field: { marginBottom: t.space.l },
  label: { fontSize: 13, fontWeight: '600', color: t.color.textBody, marginBottom: 6 },
  req: { color: t.color.danger },
  help: { fontSize: 12.5, color: t.color.textMuted, marginTop: 6 },
  error: { fontSize: 12.5, color: t.color.dangerText, marginTop: 6, fontWeight: '500' },
  // The input fills the box's height, so the whole box is its touch target
  input: { flex: 1, minWidth: 0, alignSelf: 'stretch', fontSize: 16, color: t.color.text, paddingVertical: 10 },
  /** A small control inside a field (Show, Clear): at least 44 by 44 points. */
  tap: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  affix: { fontSize: 13, fontWeight: '600', color: t.color.textMuted, marginRight: 8 },
  side: { fontSize: 12, color: t.color.textMuted, marginLeft: 8 },
});
