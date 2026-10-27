import { SelectField } from './SelectField';
import { FieldProps, OptionProps } from './types';

/**
 * The customer's accounts to choose from. Screens pass the accounts loaded from the OBDX accounts service
 * (masked numbers); the options here are display texts.
 */
export function AccountField(props: FieldProps<string> & OptionProps) {
  return <SelectField {...props} placeholder={props.placeholder || 'Select an account'} />;
}
