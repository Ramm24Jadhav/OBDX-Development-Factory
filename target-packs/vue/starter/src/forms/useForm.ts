import { reactive, watch } from 'vue';

import { t } from '../i18n';

export type FormValue = string | number | null | boolean | string[];

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
 * Field values (bind them with v-model="form.values.name"), their messages (form.errors.name) and validate() for one
 * screen. Changing a field clears its message.
 */
export function useForm<V extends Record<string, FormValue>>(initial: V, rules: Partial<Record<keyof V, FieldRule>>) {
  const values = reactive({ ...initial }) as V;
  const errors = reactive({}) as Partial<Record<keyof V, string>>;
  for (const name of Object.keys(initial) as (keyof V)[]) {
    watch(() => values[name], () => { delete errors[name]; }, { deep: true });
  }

  /** Checks every field; shows the messages and returns true when all are valid. */
  const validate = (): boolean => {
    for (const name of Object.keys(errors) as (keyof V)[]) {
      delete errors[name];
    }
    for (const name of Object.keys(rules) as (keyof V)[]) {
      const rule = rules[name];
      const value = values[name];
      if (!rule) {
        continue;
      }
      const message = rule.required && isEmpty(value) ? t('common.required', { label: rule.label })
        : rule.maxLength && typeof value === 'string' && value.length > rule.maxLength ? t('common.tooLong', { label: rule.label, max: rule.maxLength })
          : rule.check && !isEmpty(value) ? rule.check(value) : undefined;
      if (message) {
        errors[name] = message;
      }
    }
    return Object.keys(errors).length === 0;
  };

  return { values, errors, validate };
}
