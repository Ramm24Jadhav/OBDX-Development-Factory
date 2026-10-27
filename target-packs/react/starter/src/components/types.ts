/** Props every form component takes, so generated screens use them the same way. */
export interface FieldProps<T> {
  /** The Screen Model component id; rendered as data-testid and used by tests and parity checks. */
  testID: string;
  label: string;
  value: T;
  onChange?: (value: T) => void;
  required?: boolean;
  readOnly?: boolean;
  helpText?: string;
  placeholder?: string;
  /** Validation message to show under the field. */
  error?: string;
  maxLength?: number;
}

export interface OptionProps {
  options: string[];
}
