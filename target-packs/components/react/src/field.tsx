import { ReactNode, useId, useState } from 'react';

/**
 * Props every field takes, so generated screens use them the same way as the starter's components. Validation rules
 * come from the screen (error); a field only checks required and its own format, and only after the customer leaves it.
 */
export interface FieldProps<T> {
  /** The Screen Model component id; rendered as data-testid and used by tests and parity checks. */
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

/** An option for a dropdown or a choice group. Strings work too. */
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

/** Field state: the id, focus, and the message to show (the screen's error first, then required once touched). */
export function useField(props: { label: string; required?: boolean; error?: string; helpText?: string }, value: unknown, own?: string) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const required = touched && props.required && isEmpty(value) ? `${props.label} is required.` : '';
  const error = props.error || own || required;
  const describedBy = error ? `${id}-err` : props.helpText ? `${id}-help` : undefined;
  return {
    id, error, describedBy, focused,
    onFocus: () => setFocused(true),
    onBlur: () => { setFocused(false); setTouched(true); },
    touch: () => setTouched(true),
  };
}

export function fieldClass(error: string, focused: boolean, disabled?: boolean, readOnly?: boolean) {
  return 'bx-field' + (error ? ' is-error' : '') + (focused ? ' is-focus' : '') + (disabled ? ' is-disabled' : '') + (readOnly ? ' is-readonly' : '');
}

/** The message under a field: the error (announced) or the help text. */
export function FieldMessage({ id, error, helpText }: { id: string; error: string; helpText?: string }) {
  if (error) {
    return (
      <span className="bx-error" id={`${id}-err`} role="alert">
        <span className="bx-error-icon" aria-hidden="true">!</span>{error}
      </span>
    );
  }
  return helpText ? <span className="bx-help" id={`${id}-help`}>{helpText}</span> : null;
}

/** The shell of a field, the same markup as the premium JET pack so one skin serves both. */
export function FieldShell({ testID, id, label, required, error, focused, disabled, readOnly, helpText, children }: {
  testID: string; id: string; label: string; required?: boolean; error: string; focused: boolean; disabled?: boolean; readOnly?: boolean;
  helpText?: string; children: ReactNode;
}) {
  return (
    <div className={fieldClass(error, focused, disabled, readOnly)} data-testid={testID}>
      <label className="bx-label" htmlFor={id} id={`${id}-label`}>
        {label}
        {required ? <span className="bx-req" aria-hidden="true"> *</span> : null}
      </label>
      <div className="bx-control">{children}</div>
      <FieldMessage id={id} error={error} helpText={helpText} />
    </div>
  );
}
