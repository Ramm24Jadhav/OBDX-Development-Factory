import { FieldProps, FieldShell, Option, options as toOptions, useField } from './field';

export interface DropdownProps extends FieldProps<string> {
  options: ReadonlyArray<string | Option>;
}

/** Choose one option from a list (oj-select-single, oj-select-one): the native select, so every screen reader and phone knows it. */
export function Dropdown(props: DropdownProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder } = props;
  const f = useField(props, value);
  return (
    <FieldShell testID={testID} id={f.id} label={label} required={required} error={f.error} focused={f.focused} disabled={disabled} readOnly={readOnly}
                helpText={helpText}>
      <select className="bx-input bx-select" id={f.id} data-testid={`${testID}-input`} value={value ?? ''} disabled={disabled || readOnly}
              aria-required={required || undefined} aria-invalid={f.error ? true : undefined} aria-describedby={f.describedBy}
              onFocus={f.onFocus} onBlur={f.onBlur} onChange={(e) => { f.touch(); onChange?.(e.target.value); }}>
        <option value="">{placeholder || 'Choose'}</option>
        {toOptions(props.options).map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
      <span className="bx-caret" aria-hidden="true" />
    </FieldShell>
  );
}
