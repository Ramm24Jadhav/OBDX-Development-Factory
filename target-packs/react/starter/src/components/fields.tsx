import { ReactNode, useId } from 'react';

import { FieldProps, OptionProps } from './types';

function Field({ testID, label, required, helpText, error, inputId, children }: {
  testID: string; label: string; required?: boolean; helpText?: string; error?: string; inputId?: string; children: ReactNode;
}) {
  return (
    <div className="obdx-field" data-testid={testID}>
      <label className="obdx-label" htmlFor={inputId}>
        {label}
        {required ? <span className="obdx-required"> *</span> : null}
      </label>
      {children}
      {error ? <div className="obdx-error" role="alert">{error}</div> : helpText ? <div className="obdx-help">{helpText}</div> : null}
    </div>
  );
}

interface TextProps extends FieldProps<string> {
  multiline?: boolean;
  inputMode?: 'text' | 'numeric' | 'decimal';
  onBlur?: () => void;
}

/** Single-line or multi-line text. */
export function TextField({ testID, label, value, onChange, required, readOnly, helpText, placeholder, error, maxLength,
                            multiline, inputMode, onBlur }: TextProps) {
  const id = useId();
  const common = {
    id, value, required, readOnly, placeholder, maxLength, onBlur, 'aria-invalid': error ? true : undefined,
    className: 'obdx-input', 'data-testid': `${testID}-input`,
  };
  return (
    <Field testID={testID} label={label} required={required} helpText={helpText} error={error} inputId={id}>
      {multiline
        ? <textarea {...common} rows={3} onChange={(e) => onChange?.(e.target.value)} />
        : <input {...common} inputMode={inputMode} onChange={(e) => onChange?.(e.target.value)} />}
    </Field>
  );
}

/** Whole or decimal numbers, kept as text until submitted. */
export function NumberField(props: FieldProps<string>) {
  return <TextField {...props} inputMode="numeric" onChange={(text) => props.onChange?.(text.replace(/[^0-9.]/g, ''))} />;
}

/** Money amount with two decimals. */
export function AmountField(props: FieldProps<string>) {
  const format = () => {
    const amount = Number(props.value);
    if (props.value && !Number.isNaN(amount)) {
      props.onChange?.(amount.toFixed(2));
    }
  };
  return <TextField {...props} inputMode="decimal" onBlur={format} onChange={(text) => props.onChange?.(text.replace(/[^0-9.]/g, ''))} />;
}

/** A date (the browser's date picker), as YYYY-MM-DD. */
export function DateField({ testID, label, value, onChange, required, readOnly, helpText, error }: FieldProps<string>) {
  const id = useId();
  return (
    <Field testID={testID} label={label} required={required} helpText={helpText} error={error} inputId={id}>
      <input id={id} type="date" className="obdx-input" data-testid={`${testID}-input`} value={value} required={required}
             readOnly={readOnly} onChange={(e) => onChange?.(e.target.value)} />
    </Field>
  );
}

/** Choose one option from a list. */
export function SelectField({ testID, label, value, onChange, required, readOnly, helpText, placeholder, error, options }:
                              FieldProps<string> & OptionProps) {
  const id = useId();
  return (
    <Field testID={testID} label={label} required={required} helpText={helpText} error={error} inputId={id}>
      <select id={id} className="obdx-input" data-testid={`${testID}-input`} value={value} required={required} disabled={readOnly}
              onChange={(e) => onChange?.(e.target.value)}>
        <option value="">{placeholder || 'Select'}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </Field>
  );
}

/** The customer's accounts (masked numbers, loaded from the OBDX accounts service). */
export function AccountField(props: FieldProps<string> & OptionProps) {
  return <SelectField {...props} placeholder={props.placeholder || 'Select an account'} />;
}

/** Choose one of a few options, all visible. */
export function RadioGroup({ testID, label, value, onChange, required, readOnly, helpText, error, options }:
                             FieldProps<string> & OptionProps) {
  const name = useId();
  return (
    <Field testID={testID} label={label} required={required} helpText={helpText} error={error}>
      <div role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <label key={option} className="obdx-choice">
            <input type="radio" name={name} value={option} checked={value === option} disabled={readOnly}
                   data-testid={`${testID}-option-${option}`} onChange={() => onChange?.(option)} />
            {option}
          </label>
        ))}
      </div>
    </Field>
  );
}

/** Choose any number of options. */
export function CheckboxGroup({ testID, label, value, onChange, required, readOnly, helpText, error, options }:
                                FieldProps<string[]> & OptionProps) {
  const toggle = (option: string) => onChange?.(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  return (
    <Field testID={testID} label={label} required={required} helpText={helpText} error={error}>
      <div role="group" aria-label={label}>
        {options.map((option) => (
          <label key={option} className="obdx-choice">
            <input type="checkbox" checked={value.includes(option)} disabled={readOnly} data-testid={`${testID}-option-${option}`}
                   onChange={() => toggle(option)} />
            {option}
          </label>
        ))}
      </div>
    </Field>
  );
}

/** On or off. */
export function SwitchField({ testID, label, value, onChange, readOnly, helpText }: FieldProps<boolean>) {
  return (
    <div className="obdx-field" data-testid={testID}>
      <label className="obdx-switch">
        <span className="obdx-label">{label}</span>
        <input type="checkbox" role="switch" checked={value} disabled={readOnly} data-testid={`${testID}-input`}
               onChange={(e) => onChange?.(e.target.checked)} />
      </label>
      {helpText ? <div className="obdx-help">{helpText}</div> : null}
    </div>
  );
}

/** A value to show, not to edit. */
export function ReadOnlyField({ testID, label, value, helpText }: FieldProps<string>) {
  return (
    <Field testID={testID} label={label} helpText={helpText}>
      <div className="obdx-value" data-testid={`${testID}-value`}>{value || '-'}</div>
    </Field>
  );
}
