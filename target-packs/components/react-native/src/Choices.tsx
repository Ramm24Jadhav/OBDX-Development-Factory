import { useState } from 'react';
import { Text } from 'react-native';

import { FieldProps, Option, isEmpty, options as toOptions, styles } from './field';
import { Enter, Pop, Press, Shake } from './motion';
import { useTheme } from './theme';

interface ChoiceProps<T> extends FieldProps<T> {
  options: ReadonlyArray<string | Option>;
  horizontal?: boolean;
}

function ChoiceGroup<T extends string | string[]>(props: ChoiceProps<T> & { multiple: boolean }) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, error, horizontal, multiple } = props;
  const t = useTheme();
  const s = styles(t);
  const [touched, setTouched] = useState(false);
  const message = error || (touched && required && isEmpty(value) ? `${label} is required.` : '');
  const picked = (v: string) => (multiple ? (value as string[]).includes(v) : value === v);
  const pick = (v: string) => {
    setTouched(true);
    if (multiple) {
      const list = value as string[];
      onChange?.((list.includes(v) ? list.filter((x) => x !== v) : [...list, v]) as T);
    } else {
      onChange?.(v as T);
    }
  };
  return (
    <Enter testID={testID} style={s.field} accessibilityRole={multiple ? undefined : 'radiogroup'} accessibilityLabel={label}>
      <Text style={s.label} accessibilityRole="header">{label}{required ? <Text style={s.req}> *</Text> : null}</Text>
      <Shake error={message} style={{ flexDirection: horizontal ? 'row' : 'column', flexWrap: 'wrap', gap: 8 }}>
        {toOptions(props.options).map((o) => {
          const on = picked(o.value);
          const off = !!(disabled || readOnly || o.disabled);
          return (
            <Press key={o.value} testID={`${testID}-option-${o.value}`} accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityLabel={o.label}
                       accessibilityState={{ checked: on, disabled: off }} disabled={off} onPress={() => pick(o.value)}
                       style={{ minHeight: t.minTouch, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14,
                         borderWidth: on ? Math.max(t.border, 1.5) : t.border, borderColor: on ? t.color.primary : t.lineStrong, borderRadius: t.radius.control,
                         backgroundColor: on ? t.color.primarySoft : t.fill, opacity: off ? 0.55 : 1, ...(t.look === 'soft' ? {} : t.elevation(1)) }}>
              <Pop on={on} importantForAccessibility="no-hide-descendants"
                    style={{ width: 20, height: 20, borderRadius: multiple ? t.radius.small : 10, borderWidth: Math.max(t.border, 1.5), borderColor: on ? t.color.primary : t.color.borderStrong,
                      backgroundColor: on ? t.color.primary : t.color.surface, alignItems: 'center', justifyContent: 'center' }}>
                {on ? <Text style={{ color: t.color.onPrimary, fontSize: 12, fontWeight: '700' }}>{multiple ? '✓' : '•'}</Text> : null}
              </Pop>
              <Text style={{ fontSize: 15, color: t.color.text }}>{o.label}</Text>
            </Press>
          );
        })}
      </Shake>
      {message
        ? <Text testID={`${testID}-error`} style={s.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">{message}</Text>
        : helpText ? <Text style={s.help}>{helpText}</Text> : null}
    </Enter>
  );
}

/** Choose any number of options, shown as cards (oj-checkboxset). */
export function CheckboxGroup(props: ChoiceProps<string[]>) {
  return <ChoiceGroup {...props} multiple />;
}

/** Choose one of a few options, all visible, shown as cards (oj-radioset). */
export function RadioGroup(props: ChoiceProps<string>) {
  return <ChoiceGroup {...props} multiple={false} />;
}
