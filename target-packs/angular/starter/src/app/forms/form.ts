import { WritableSignal, effect, signal, untracked } from '@angular/core';

import { t } from '../i18n';

export type FormValue = string | boolean | string[] | number | null;

/** What to check for one field before the form is sent. */
export interface FieldRule {
  label: string;
  required?: boolean;
  maxLength?: number;
  /** Further checks from the spec; return a message when the value is not valid. */
  check?: (value: FormValue) => string | undefined;
}

function isEmpty(value: FormValue): boolean {
  return value === '' || value === null || (Array.isArray(value) && value.length === 0);
}

/**
 * Field values (as signals, for [(value)]), their validation messages and validate() for one screen. Call it in a
 * component's field initialiser: a field's message clears as soon as its value changes.
 */
export function createForm<V extends Record<string, FormValue>>(initial: V, rules: Partial<Record<keyof V, FieldRule>>) {
  const values = {} as { [K in keyof V]: WritableSignal<V[K]> };
  for (const name of Object.keys(initial) as (keyof V)[]) {
    values[name] = signal(initial[name]);
  }
  const errors = signal<Partial<Record<keyof V, string>>>({});
  for (const name of Object.keys(initial) as (keyof V)[]) {
    let first = true;
    effect(() => {
      values[name]();
      if (first) {
        first = false;
        return;
      }
      untracked(() => {
        if (errors()[name]) {
          errors.update((e) => ({ ...e, [name]: undefined }));
        }
      });
    });
  }

  /** Checks every field; shows the messages and returns true when all are valid. */
  const validate = (): boolean => {
    const found: Partial<Record<keyof V, string>> = {};
    for (const name of Object.keys(rules) as (keyof V)[]) {
      const rule = rules[name];
      const value = values[name]();
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
    errors.set(found);
    return Object.values(found).every((message) => !message);
  };

  /** The current values, to send. */
  const snapshot = (): V => {
    const out = {} as V;
    for (const name of Object.keys(values) as (keyof V)[]) {
      out[name] = values[name]();
    }
    return out;
  };

  return { values, errors, validate, snapshot };
}
