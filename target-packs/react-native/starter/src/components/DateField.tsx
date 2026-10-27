import { TextField } from './TextField';
import { FieldProps } from './types';

/**
 * A date as YYYY-MM-DD. React Native has no built-in date picker; replace the input with the bank's choice (for
 * example @react-native-community/datetimepicker) without changing these props.
 */
export function DateField(props: FieldProps<string>) {
  return <TextField {...props} placeholder={props.placeholder || 'YYYY-MM-DD'} keyboardType="numbers-and-punctuation" maxLength={10} />;
}
