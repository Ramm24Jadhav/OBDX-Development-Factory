import { TextField } from './TextField';
import { FieldProps } from './types';

/** Whole or decimal numbers, kept as text until submitted. */
export function NumberField(props: FieldProps<string>) {
  return <TextField {...props} keyboardType="numeric" onChange={(text) => props.onChange?.(text.replace(/[^0-9.]/g, ''))} />;
}
