import { TextInput } from 'react-native';

import { FormField, inputStyle } from './FormField';
import { FieldProps } from './types';

interface Props extends FieldProps<string> {
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'numbers-and-punctuation' | 'email-address';
  onBlur?: () => void;
}

/** Single-line or multi-line text. */
export function TextField({ testID, label, value, onChange, required, readOnly, helpText, placeholder, error, maxLength,
                            multiline, keyboardType, onBlur }: Props) {
  return (
    <FormField testID={testID} label={label} required={required} helpText={helpText} error={error}>
      <TextInput
        testID={`${testID}-input`}
        accessibilityLabel={label}
        style={[inputStyle.input, readOnly ? inputStyle.readOnly : null, multiline ? { minHeight: 80, textAlignVertical: 'top' } : null]}
        value={value}
        onChangeText={onChange}
        onBlur={onBlur}
        editable={!readOnly}
        placeholder={placeholder}
        maxLength={maxLength}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </FormField>
  );
}
