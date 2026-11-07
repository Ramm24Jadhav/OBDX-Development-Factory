import { useState } from 'react';

import { FieldProps, FieldShell, useField } from './field';

export interface TextFieldProps extends FieldProps<string> {
  maxLength?: number;
  /** Shows a clear button while the field has a value. */
  clearable?: boolean;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel';
  autoComplete?: string;
}

/** One line of text (oj-input-text). */
export function TextField(props: TextFieldProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder, maxLength, clearable, inputMode, autoComplete } = props;
  const f = useField(props, value);
  return (
    <FieldShell testID={testID} id={f.id} label={label} required={required} error={f.error} focused={f.focused} disabled={disabled} readOnly={readOnly}
                helpText={helpText}>
      <input className="bx-input" id={f.id} data-testid={`${testID}-input`} value={value ?? ''} placeholder={placeholder} disabled={disabled}
             readOnly={readOnly} maxLength={maxLength} inputMode={inputMode} autoComplete={autoComplete ?? 'off'} aria-required={required || undefined}
             aria-invalid={f.error ? true : undefined} aria-describedby={f.describedBy} onFocus={f.onFocus} onBlur={f.onBlur}
             onChange={(e) => onChange?.(e.target.value)} />
      {clearable && value && !readOnly && !disabled
        ? <button type="button" className="bx-clear" aria-label={`Clear ${label}`} onClick={() => onChange?.('')}><span aria-hidden="true">×</span></button>
        : null}
      {maxLength ? <span className="bx-counter" aria-hidden="true">{(value ?? '').length}/{maxLength}</span> : null}
    </FieldShell>
  );
}

/** Decimals a currency uses (ISO 4217); two unless listed. */
export function decimalsOf(currency?: string): number {
  if (!currency) { return 2; }
  if (['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF'].includes(currency)) { return 0; }
  if (['BHD', 'KWD', 'OMR', 'JOD', 'TND', 'LYD', 'IQD'].includes(currency)) { return 3; }
  return 2;
}

export function formatAmount(value: number | null | undefined, currency?: string, locale?: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) { return ''; }
  const d = decimalsOf(currency);
  return value.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
}

export interface AmountInputProps extends FieldProps<number | null> {
  /** ISO currency code, shown beside the amount; sets the decimals. */
  currency?: string;
  min?: number;
  max?: number;
  locale?: string;
}

/** A money amount (oj-input-number with a currency): the value is a number, formatted with the currency's decimals. */
export function AmountInput(props: AmountInputProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder, currency, min, max, locale } = props;
  const [typed, setTyped] = useState<string | null>(null);
  const [own, setOwn] = useState('');
  const f = useField(props, value, own);
  const commit = () => {
    if (typed === null) { return; }
    const text = typed.trim();
    setTyped(null);
    if (text === '') { setOwn(''); onChange?.(null); return; }
    const n = Number(text.replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(n) || !/[0-9]/.test(text)) { setOwn(`Enter an amount, for example ${formatAmount(1250, currency, locale)}.`); return; }
    const d = decimalsOf(currency);
    const rounded = Math.round(n * 10 ** d) / 10 ** d;
    setOwn(min !== undefined && rounded < min ? `Enter at least ${formatAmount(min, currency, locale)}.`
      : max !== undefined && rounded > max ? `Enter at most ${formatAmount(max, currency, locale)}.` : '');
    onChange?.(rounded);
  };
  return (
    <FieldShell testID={testID} id={f.id} label={label} required={required} error={f.error} focused={f.focused} disabled={disabled} readOnly={readOnly}
                helpText={helpText}>
      {currency ? <span className="bx-affix" aria-hidden="true">{currency}</span> : null}
      <input className="bx-input bx-num" id={f.id} data-testid={`${testID}-input`} inputMode="decimal" autoComplete="off"
             value={typed ?? formatAmount(value, currency, locale)} placeholder={placeholder} disabled={disabled} readOnly={readOnly}
             aria-required={required || undefined} aria-invalid={f.error ? true : undefined} aria-describedby={f.describedBy}
             aria-label={currency ? `${label} in ${currency}` : undefined}
             onFocus={f.onFocus} onBlur={() => { f.onBlur(); commit(); }} onKeyDown={(e) => { if (e.key === 'Enter') { commit(); } }}
             onChange={(e) => setTyped(e.target.value)} />
    </FieldShell>
  );
}
