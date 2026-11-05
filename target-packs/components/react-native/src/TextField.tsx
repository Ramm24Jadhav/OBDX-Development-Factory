import { useState } from 'react';
import { KeyboardTypeOptions, Pressable, Text, TextInput } from 'react-native';

import { FieldProps, FieldShell, controlStyle, styles, useField } from './field';
import { useTheme } from './theme';

export interface TextFieldProps extends FieldProps<string> {
  maxLength?: number;
  clearable?: boolean;
  keyboardType?: KeyboardTypeOptions;
  /** Hides what is typed (a PIN). The value is not kept by the component after the screen clears it. */
  secure?: boolean;
}

/** One line of text (oj-input-text). */
export function TextField(props: TextFieldProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder, maxLength, clearable, keyboardType, secure } = props;
  const t = useTheme();
  const s = styles(t);
  const f = useField(props, value);
  return (
    <FieldShell testID={testID} label={label} required={required} error={f.error} helpText={helpText}>
      <Pressable style={controlStyle(t, { focused: f.focused, error: f.error, disabled, readOnly })} accessible={false}>
        <TextInput testID={`${testID}-input`} style={s.input} value={value ?? ''} placeholder={placeholder} placeholderTextColor={t.color.textMuted}
                   editable={!readOnly && !disabled} maxLength={maxLength} keyboardType={keyboardType} secureTextEntry={secure}
                   accessibilityLabel={label} accessibilityHint={f.error || helpText}
                   accessibilityState={{ disabled: !!disabled }} aria-required={required} aria-invalid={!!f.error}
                   onFocus={f.onFocus} onBlur={f.onBlur} onChangeText={(x) => onChange?.(x)} />
        {clearable && value && !readOnly && !disabled
          ? <Pressable testID={`${testID}-clear`} accessibilityRole="button" accessibilityLabel={`Clear ${label}`} hitSlop={12} onPress={() => onChange?.('')}>
              <Text style={s.side}>×</Text>
            </Pressable>
          : null}
        {maxLength ? <Text style={s.side} importantForAccessibility="no">{(value ?? '').length}/{maxLength}</Text> : null}
      </Pressable>
    </FieldShell>
  );
}

export function decimalsOf(currency?: string): number {
  if (!currency) { return 2; }
  if (['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF'].includes(currency)) { return 0; }
  if (['BHD', 'KWD', 'OMR', 'JOD', 'TND', 'LYD', 'IQD'].includes(currency)) { return 3; }
  return 2;
}

/** Groups thousands with commas and fixes the decimals (Hermes formats numbers without the platform locale data). */
export function formatAmount(value: number | null | undefined, currency?: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) { return ''; }
  const d = decimalsOf(currency);
  const [whole, part] = Math.abs(value).toFixed(d).split('.');
  return (value < 0 ? '-' : '') + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (part ? `.${part}` : '');
}

export interface AmountInputProps extends FieldProps<number | null> {
  currency?: string;
  min?: number;
  max?: number;
}

/** A money amount: a number with the currency's decimals, the decimal keypad, and the limits checked when the customer leaves. */
export function AmountInput(props: AmountInputProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder, currency, min, max } = props;
  const t = useTheme();
  const s = styles(t);
  const [typed, setTyped] = useState<string | null>(null);
  const [own, setOwn] = useState('');
  const f = useField(props, value, own);
  const commit = () => {
    if (typed === null) { return; }
    const text = typed.trim();
    setTyped(null);
    if (text === '') { setOwn(''); onChange?.(null); return; }
    const n = Number(text.replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(n) || !/[0-9]/.test(text)) { setOwn(`Enter an amount, for example ${formatAmount(1250, currency)}.`); return; }
    const d = decimalsOf(currency);
    const rounded = Math.round(n * 10 ** d) / 10 ** d;
    setOwn(min !== undefined && rounded < min ? `Enter at least ${formatAmount(min, currency)}.`
      : max !== undefined && rounded > max ? `Enter at most ${formatAmount(max, currency)}.` : '');
    onChange?.(rounded);
  };
  return (
    <FieldShell testID={testID} label={label} required={required} error={f.error} helpText={helpText}>
      <Pressable style={controlStyle(t, { focused: f.focused, error: f.error, disabled, readOnly })} accessible={false}>
        {currency ? <Text style={s.affix} importantForAccessibility="no">{currency}</Text> : null}
        <TextInput testID={`${testID}-input`} style={[s.input, { textAlign: 'right', fontVariant: ['tabular-nums'] }]} keyboardType="decimal-pad"
                   value={typed ?? formatAmount(value, currency)} placeholder={placeholder} placeholderTextColor={t.color.textMuted}
                   editable={!readOnly && !disabled} accessibilityLabel={currency ? `${label} in ${currency}` : label}
                   accessibilityHint={f.error || helpText} aria-required={required} aria-invalid={!!f.error}
                   onFocus={f.onFocus} onBlur={() => { f.onBlur(); commit(); }} onSubmitEditing={commit} onChangeText={setTyped} />
      </Pressable>
    </FieldShell>
  );
}
