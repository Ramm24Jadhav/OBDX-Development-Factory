import { useState } from 'react';

import { t } from '../i18n';

export type FormValue = string | boolean | string[];

/** What to check for one field before the form is sent. */
export interface FieldRule {
  label: string;
  required?: boolean;
  maxLength?: number;
  /** Further checks from the spec; return a message when the value is not valid. */
  check?: (value: FormValue) => string | undefined;
}

function isEmpty(value: FormValue): boolean {
  return value === '' || (Array.isArray(value) && value.length === 0);
}

/** Field values, their setters and validation messages for one screen. */
export function useForm<V extends Record<string, FormValue>>(initial: V, rules: Partial<Record<keyof V, FieldRule>>) {
  const [values, setValues] = useState<V>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof V, string>>>({});

  const setValue = <K extends keyof V>(name: K) => (value: V[K]) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  /** Checks every field; shows the messages and returns true when all are valid. */
  const validate = (): boolean => {
    const found: Partial<Record<keyof V, string>> = {};
    for (const name of Object.keys(rules) as (keyof V)[]) {
      const rule = rules[name];
      const value = values[name];
      if (!rule) {
        continue;
      }
      if (rule.required && isEmpty(value)) {
        found[name] = t('common.required', { label: rule.label });
      } else if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
        found[name] = t('common.tooLong', { label: rule.label, max: rule.maxLength });
      } else if (rule.check && !isEmpty(value)) {
        found[name] = rule.check(value);
      }
    }
    setErrors(found);
    return Object.values(found).every((message) => !message);
  };

  return { values, setValue, errors, validate };
}
