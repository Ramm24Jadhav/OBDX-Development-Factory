import { TextField } from './TextField';
import { FieldProps } from './types';

/** Money amount with two decimals; the currency is shown in the label or a separate field. */
export function AmountField(props: FieldProps<string>) {
  const format = () => {
    const amount = Number(props.value);
    if (props.value && !Number.isNaN(amount)) {
      props.onChange?.(amount.toFixed(2));
    }
  };
  return (
    <TextField {...props} keyboardType="decimal-pad" onBlur={format}
               onChange={(text) => props.onChange?.(text.replace(/[^0-9.]/g, ''))} />
  );
}
