import { useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';

import { FieldProps, FieldShell, controlStyle, styles, useField } from './field';
import { useTheme } from './theme';

export interface DatePickerProps extends FieldProps<string> {
  /** Earliest and latest dates, as yyyy-mm-dd. */
  min?: string;
  max?: string;
  disabledDays?: ReadonlyArray<string> | ((iso: string) => boolean);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** dd/mm/yyyy → yyyy-mm-dd, or null when it is not a real date. */
export function parseDate(text: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text.trim());
  if (!m) { return null; }
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) { return null; }
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function showDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const typedOf = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '');

/**
 * A date as yyyy-mm-dd (oj-input-date): typed as dd/mm/yyyy on the number pad, with min, max and blocked days checked.
 * A calendar sheet comes with the forms wave; the props stay the same.
 */
export function DatePicker(props: DatePickerProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, min, max, disabledDays } = props;
  const t = useTheme();
  const s = styles(t);
  const [typed, setTyped] = useState<string | null>(null);
  const [own, setOwn] = useState('');
  const f = useField(props, value, own);
  const commit = () => {
    if (typed === null) { return; }
    const text = typed.trim();
    setTyped(null);
    if (!text) { setOwn(''); onChange?.(''); return; }
    const iso = parseDate(text);
    if (!iso) { setOwn('Enter a date as dd/mm/yyyy.'); return; }
    const blocked = typeof disabledDays === 'function' ? disabledDays(iso) : (disabledDays ?? []).includes(iso);
    setOwn(min && iso < min ? `Choose ${showDate(min)} or later.` : max && iso > max ? `Choose ${showDate(max)} or earlier.`
      : blocked ? 'That day is not available. Choose another day.' : '');
    onChange?.(iso);
  };
  return (
    <FieldShell testID={testID} label={label} required={required} error={f.error} helpText={helpText}>
      <Pressable style={controlStyle(t, { focused: f.focused, error: f.error, disabled, readOnly })} accessible={false}>
        <TextInput testID={`${testID}-input`} style={s.input} keyboardType="numbers-and-punctuation" maxLength={10} placeholder="dd/mm/yyyy"
                   placeholderTextColor={t.color.textMuted} value={typed ?? typedOf(value)} editable={!readOnly && !disabled}
                   accessibilityLabel={label} accessibilityHint={f.error || helpText || 'Day, month and year'} aria-required={required} aria-invalid={!!f.error}
                   onFocus={f.onFocus} onBlur={() => { f.onBlur(); commit(); }} onSubmitEditing={commit} onChangeText={setTyped} />
        {value && typed === null ? <Text style={s.side} importantForAccessibility="no">{showDate(value)}</Text> : null}
      </Pressable>
    </FieldShell>
  );
}
