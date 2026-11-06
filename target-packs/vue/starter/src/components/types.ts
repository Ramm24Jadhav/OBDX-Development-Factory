/** Props every field takes (with v-model for its value), so generated screens use them the same way. */
export interface FieldProps {
  /** The Screen Model component id; rendered as data-testid and used by tests and parity checks. */
  testID: string;
  label: string;
  required?: boolean;
  readOnly?: boolean;
  helpText?: string;
  placeholder?: string;
  /** Validation message to show under the field. */
  error?: string;
  maxLength?: number;
}
