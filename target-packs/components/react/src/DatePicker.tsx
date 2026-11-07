import { useState } from 'react';

import { FieldProps, FieldShell, useField } from './field';

export interface DatePickerProps extends FieldProps<string> {
  /** Earliest and latest dates, as yyyy-mm-dd. */
  min?: string;
  max?: string;
  /** Days that cannot be chosen (bank holidays, weekends): a list of yyyy-mm-dd or a test. */
  disabledDays?: ReadonlyArray<string> | ((iso: string) => boolean);
  /** Shows the chosen date in the customer's format beside the field. */
  locale?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A date as yyyy-mm-dd (oj-input-date), the browser's date picker, with min, max and blocked days checked. */
export function DatePicker(props: DatePickerProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, min, max, disabledDays, locale } = props;
  const [own, setOwn] = useState('');
  const f = useField(props, value, own);
  const check = (iso: string) => {
    if (!iso) { return ''; }
    if (!ISO.test(iso)) { return 'Enter a date as dd/mm/yyyy.'; }
    if (min && iso < min) { return `Choose ${display(min, locale)} or later.`; }
    if (max && iso > max) { return `Choose ${display(max, locale)} or earlier.`; }
    const blocked = typeof disabledDays === 'function' ? disabledDays(iso) : (disabledDays ?? []).includes(iso);
    return blocked ? 'That day is not available. Choose another day.' : '';
  };
  const shown = value && ISO.test(value) ? display(value, locale) : '';
  return (
    <FieldShell testID={testID} id={f.id} label={label} required={required} error={f.error} focused={f.focused} disabled={disabled} readOnly={readOnly}
                helpText={helpText}>
      <input type="date" className="bx-input" id={f.id} data-testid={`${testID}-input`} value={value ?? ''} min={min} max={max} disabled={disabled}
             readOnly={readOnly} aria-required={required || undefined} aria-invalid={f.error ? true : undefined} aria-describedby={f.describedBy}
             onFocus={f.onFocus} onBlur={f.onBlur} onChange={(e) => { setOwn(check(e.target.value)); onChange?.(e.target.value); }} />
      {shown ? <span className="bx-counter" aria-hidden="true">{shown}</span> : null}
    </FieldShell>
  );
}

function display(iso: string, locale?: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}
