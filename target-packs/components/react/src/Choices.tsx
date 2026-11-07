import { FieldProps, FieldMessage, Option, isEmpty, options as toOptions } from './field';
import { useId, useState } from 'react';

interface ChoiceProps<T> extends FieldProps<T> {
  options: ReadonlyArray<string | Option>;
  /** Choices side by side instead of one per line. */
  horizontal?: boolean;
}

function ChoiceGroup<T extends string | string[]>(props: ChoiceProps<T> & { multiple: boolean }) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, error, horizontal, multiple } = props;
  const id = useId();
  const [touched, setTouched] = useState(false);
  const message = error || (touched && required && isEmpty(value) ? `${label} is required.` : '');
  const picked = (v: string) => (multiple ? (value as string[]).includes(v) : value === v);
  const pick = (v: string) => {
    if (readOnly || disabled) { return; }
    setTouched(true);
    if (multiple) {
      const list = value as string[];
      onChange?.((list.includes(v) ? list.filter((x) => x !== v) : [...list, v]) as T);
    } else {
      onChange?.(v as T);
    }
  };
  return (
    <fieldset className={'bx-field' + (message ? ' is-error' : '') + (disabled ? ' is-disabled' : '') + (readOnly ? ' is-readonly' : '')} data-testid={testID}
              aria-describedby={message ? `${id}-err` : helpText ? `${id}-help` : undefined} aria-invalid={message ? true : undefined}
              aria-required={required || undefined}>
      <legend className="bx-label">{label}{required ? <span className="bx-req" aria-hidden="true"> *</span> : null}</legend>
      <div className={'bx-choices' + (horizontal ? ' is-row' : '')}>
        {toOptions(props.options).map((o, i) => {
          const on = picked(o.value);
          const off = disabled || o.disabled;
          return (
            <label key={o.value} className={'bx-choice' + (on ? ' is-on' : '') + (off ? ' is-disabled' : '')} htmlFor={`${id}-${i}`}>
              <input type={multiple ? 'checkbox' : 'radio'} className="bx-choice-input" id={`${id}-${i}`} name={id} value={o.value} checked={on}
                     disabled={off} readOnly={readOnly} data-testid={`${testID}-option-${o.value}`} onChange={() => pick(o.value)}
                     onBlur={() => setTouched(true)} />
              <span className="bx-choice-mark" aria-hidden="true" />
              <span className="bx-choice-label">{o.label}</span>
            </label>
          );
        })}
      </div>
      <FieldMessage id={id} error={message} helpText={helpText} />
    </fieldset>
  );
}

/** Choose any number of options, shown as cards (oj-checkboxset). The value is the list of chosen values. */
export function CheckboxGroup(props: ChoiceProps<string[]>) {
  return <ChoiceGroup {...props} multiple />;
}

/** Choose one of a few options, all visible, shown as cards (oj-radioset). */
export function RadioGroup(props: ChoiceProps<string>) {
  return <ChoiceGroup {...props} multiple={false} />;
}
