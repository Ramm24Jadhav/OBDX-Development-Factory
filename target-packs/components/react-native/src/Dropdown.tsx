import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { FieldProps, FieldShell, Option, controlStyle, options as toOptions, styles, useField } from './field';
import { useTheme } from './theme';

export interface DropdownProps extends FieldProps<string> {
  options: ReadonlyArray<string | Option>;
}

/** Choose one option from a list (oj-select-single): the field opens a sheet of options, the chosen one marked. */
export function Dropdown(props: DropdownProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder } = props;
  const t = useTheme();
  const s = styles(t);
  const f = useField(props, value);
  const [open, setOpen] = useState(false);
  const list = toOptions(props.options);
  const chosen = list.find((o) => o.value === value);
  const close = () => { setOpen(false); f.touch(); };
  return (
    <FieldShell testID={testID} label={label} required={required} error={f.error} helpText={helpText}>
      <Pressable testID={`${testID}-input`} accessibilityRole="button" accessibilityLabel={`${label}, ${chosen ? chosen.label : 'nothing chosen'}`}
                 accessibilityHint={f.error || 'Opens the list of choices'} accessibilityState={{ disabled: !!(disabled || readOnly), expanded: open }}
                 disabled={disabled || readOnly} onPress={() => setOpen(true)}
                 style={[controlStyle(t, { error: f.error, disabled, readOnly }), { justifyContent: 'space-between' }]}>
        <Text style={[s.input, chosen ? null : { color: t.color.textMuted }]}>{chosen ? chosen.label : placeholder || 'Choose'}</Text>
        <Text style={s.side} importantForAccessibility="no">▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={sheet.backdrop} accessibilityLabel="Close the list" onPress={close} />
        <View style={[sheet.panel, { backgroundColor: t.color.surface, borderTopLeftRadius: t.radius.card, borderTopRightRadius: t.radius.card }]}
              accessibilityViewIsModal>
          <Text style={[sheet.title, { color: t.color.text }]} accessibilityRole="header">{label}</Text>
          <FlatList data={list} keyExtractor={(o) => o.value} renderItem={({ item }) => {
            const on = item.value === value;
            return (
              <Pressable testID={`${testID}-option-${item.value}`} accessibilityRole="radio" accessibilityLabel={item.label}
                         accessibilityState={{ selected: on, checked: on, disabled: !!item.disabled }} disabled={item.disabled}
                         onPress={() => { onChange?.(item.value); close(); }}
                         style={[sheet.option, { minHeight: t.minTouch, backgroundColor: on ? t.color.primarySoft : 'transparent', opacity: item.disabled ? 0.5 : 1 }]}>
                <Text style={{ fontSize: 16, color: on ? t.color.primaryText : t.color.text, fontWeight: on ? '600' : '400' }}>{item.label}</Text>
                {on ? <Text style={{ color: t.color.primary }} importantForAccessibility="no">✓</Text> : null}
              </Pressable>
            );
          }} />
          {!required && value
            ? <Pressable testID={`${testID}-clear`} accessibilityRole="button" style={[sheet.option, { minHeight: t.minTouch }]}
                         onPress={() => { onChange?.(''); close(); }}>
                <Text style={{ fontSize: 15, color: t.color.primaryText }}>Clear the choice</Text>
              </Pressable>
            : null}
        </View>
      </Modal>
    </FieldShell>
  );
}

const sheet = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  panel: { maxHeight: '70%', paddingBottom: 24 },
  title: { fontSize: 17, fontWeight: '700', padding: 16 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
});
