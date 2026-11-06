/*
 * The form components screens are built from: Oracle JET Core Pack elements (oj-c-*), Redwood look, each wrapped so
 * every screen uses the same props (testID, label, value, onChange, error ...) as the factory's other target packs.
 * A field's message also goes on its wrapper as data-error, so tests can check the screen's validation in jsdom
 * (where the Core Pack elements do not render).
 */
import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import MutableArrayDataProvider = require('ojs/ojmutablearraydataprovider');
import 'oj-c/input-text';
import 'oj-c/text-area';
import 'oj-c/input-number';
import 'oj-c/input-date-picker';
import 'oj-c/select-single';
import 'oj-c/radioset';
import 'oj-c/checkboxset';
import 'oj-c/switch';

import { FieldProps, OptionProps } from './types';

type Message = { severity: 'error'; summary: string; detail: string };

/** The field's message as the Core Pack shows it (under the field, announced to screen readers). */
const messages = (error?: string): Message[] | undefined => (error ? [{ severity: 'error', summary: error, detail: error }] : undefined);
const help = (helpText?: string) => (helpText ? { instruction: helpText } : undefined);

/** Single-line text. */
export function TextField({ testID, label, value, onChange, required, readOnly, helpText, placeholder, error, maxLength }: FieldProps<string>) {
  return (
    <div class="obdx-field" data-testid={testID} data-error={error}>
      <oj-c-input-text labelHint={label} value={value} required={required} readonly={readOnly} placeholder={placeholder}
        help={help(helpText)} length={maxLength ? { max: maxLength } : undefined} messagesCustom={messages(error)}
        onvalueChanged={(e) => onChange?.((e.detail.value as string | null) ?? '')} />
    </div>
  );
}

/** Several lines of text. */
export function TextArea({ testID, label, value, onChange, required, readOnly, helpText, placeholder, error, maxLength }: FieldProps<string>) {
  return (
    <div class="obdx-field" data-testid={testID} data-error={error}>
      <oj-c-text-area labelHint={label} value={value} required={required} readonly={readOnly} placeholder={placeholder}
        help={help(helpText)} length={maxLength ? { max: maxLength } : undefined} messagesCustom={messages(error)}
        onvalueChanged={(e) => onChange?.((e.detail.value as string | null) ?? '')} />
    </div>
  );
}

/** A number or an amount; the form keeps a number, or null when empty. */
export function NumberField({ testID, label, value, onChange, required, readOnly, helpText, placeholder, error }: FieldProps<number | null>) {
  return (
    <div class="obdx-field" data-testid={testID} data-error={error}>
      <oj-c-input-number labelHint={label} value={value} required={required} readonly={readOnly} placeholder={placeholder}
        help={help(helpText)} messagesCustom={messages(error)} onvalueChanged={(e) => onChange?.(e.detail.value ?? null)} />
    </div>
  );
}

/** A money amount: two decimals. */
export function AmountField(props: FieldProps<number | null>) {
  return <NumberField {...props} />;
}

/** A date, as YYYY-MM-DD. */
export function DateField({ testID, label, value, onChange, required, readOnly, helpText, error }: FieldProps<string>) {
  return (
    <div class="obdx-field" data-testid={testID} data-error={error}>
      <oj-c-input-date-picker labelHint={label} value={value || null} required={required} readonly={readOnly} help={help(helpText)}
        messagesCustom={messages(error)} onvalueChanged={(e) => onChange?.(e.detail.value ?? '')} />
    </div>
  );
}

type Item = { value: string; label: string };

/** One choice from a list that opens. */
export function SelectField({ testID, label, value, onChange, required, readOnly, helpText, placeholder, error, options }: FieldProps<string> & OptionProps) {
  const data = useMemo(() => new MutableArrayDataProvider<string, Item>(options.map((o) => ({ value: o, label: o })), { keyAttributes: 'value' }), [options]);
  return (
    <div class="obdx-field" data-testid={testID} data-error={error}>
      <oj-c-select-single labelHint={label} data={data} itemText="label" value={value || null} required={required} readonly={readOnly}
        placeholder={placeholder} help={help(helpText)} messagesCustom={messages(error)}
        onvalueChanged={(e) => onChange?.((e.detail.value as string | null) ?? '')} />
    </div>
  );
}

/** The customer's account: a select of masked account numbers. */
export function AccountField(props: FieldProps<string> & OptionProps) {
  return <SelectField {...props} />;
}

/** One choice from a short list, all shown. */
export function RadioGroup({ testID, label, value, onChange, required, readOnly, helpText, error, options }: FieldProps<string> & OptionProps) {
  return (
    <div class="obdx-field" data-testid={testID} data-error={error}>
      <oj-c-radioset labelHint={label} value={value || null} required={required} readonly={readOnly} help={help(helpText)}
        options={options.map((o) => ({ value: o, label: o }))} messagesCustom={messages(error)}
        onvalueChanged={(e) => onChange?.((e.detail.value as string | null) ?? '')} />
    </div>
  );
}

/** Several choices from a short list. */
export function CheckboxGroup({ testID, label, value, onChange, required, readOnly, helpText, error, options }: FieldProps<string[]> & OptionProps) {
  return (
    <div class="obdx-field" data-testid={testID} data-error={error}>
      <oj-c-checkboxset labelHint={label} value={value} required={required} readonly={readOnly} help={help(helpText)}
        options={options.map((o) => ({ value: o, label: o }))} messagesCustom={messages(error)}
        onvalueChanged={(e) => onChange?.([...((e.detail.value as string[] | null) ?? [])])} />
    </div>
  );
}

/** On or off. */
export function SwitchField({ testID, label, value, onChange, readOnly, helpText, error }: FieldProps<boolean>) {
  return (
    <div class="obdx-field" data-testid={testID} data-error={error}>
      <oj-c-switch labelHint={label} value={value} readonly={readOnly} help={help(helpText)} messagesCustom={messages(error)}
        onvalueChanged={(e) => onChange?.(!!e.detail.value)} />
    </div>
  );
}

/** A value shown, not changed here. */
export function ReadOnlyField({ testID, label, value, helpText }: FieldProps<string>) {
  return (
    <div class="obdx-field" data-testid={testID}>
      <oj-c-input-text labelHint={label} value={value} readonly={true} help={help(helpText)} />
    </div>
  );
}
