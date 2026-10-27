/*
 * React Native preview: renders a Screen Model with the React Native target pack's own starter components, in the
 * browser through React Native Web. What customers see here is what the generated app is built from.
 */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Text, View } from 'react-native';

import {
  AccountField, AmountField, Button, CheckboxGroup, DateField, NumberField, RadioGroup, ReadOnlyField, Screen, Section, SelectField,
  SwitchField, TextField, theme,
} from '../../target-packs/react-native/starter/src/components';
import { Component, connect, highlightCss, initialValue, optionsOf, ScreenModel, Value } from './protocol';

function Field({ c, value, onChange }: { c: Component; value: Value; onChange: (v: Value) => void }) {
  const common = {
    testID: c.id,
    label: c.label || c.name || c.id,
    required: c.required === true,
    readOnly: c.readonly === true,
    helpText: c.helpText || undefined,
    placeholder: c.placeholder || undefined,
    maxLength: c.maxLength || undefined,
  };
  const text = { ...common, value: value as string, onChange: (v: string) => onChange(v) };
  switch (c.type) {
    case 'textarea': return <TextField {...text} multiline />;
    case 'number': return <NumberField {...text} />;
    case 'amount': return <AmountField {...text} />;
    case 'date': return <DateField {...text} />;
    case 'select': return <SelectField {...text} options={optionsOf(c)} />;
    case 'account': return <AccountField {...text} options={optionsOf(c)} />;
    case 'radio': return <RadioGroup {...text} options={optionsOf(c)} />;
    case 'checkbox':
      return <CheckboxGroup {...common} value={value as string[]} onChange={(v) => onChange(v)} options={optionsOf(c)} />;
    case 'switch': return <SwitchField {...common} value={value as boolean} onChange={(v) => onChange(v)} />;
    case 'display': return <ReadOnlyField {...text} />;
    default: return <TextField {...text} />;
  }
}

function Preview({ model, highlight }: { model: ScreenModel; highlight: string | null }) {
  const [values, setValues] = useState<Record<string, Value>>({});
  useEffect(() => setValues({}), [model.name]);
  const valueOf = (c: Component) => (c.id in values ? values[c.id] : initialValue(c));
  return (
    <>
      <style>{highlightCss(highlight)}</style>
      <Screen
        title={model.title || model.name}
        actions={model.actions.map((a) => (
          <Button key={a.id} testID={a.id} label={a.label} variant={(a.kind as 'primary' | 'secondary' | 'link') || 'secondary'} />
        ))}>
        {model.sections.map((s) => (
          <Section key={s.id} title={s.title || undefined} columns={s.columns || 1}>
            {s.components.map((c) => (
              <Field key={c.id} c={c} value={valueOf(c)} onChange={(v) => setValues((current) => ({ ...current, [c.id]: v }))} />
            ))}
          </Section>
        ))}
      </Screen>
    </>
  );
}

function App() {
  const [state, setState] = useState<{ model: ScreenModel | null; highlight: string | null }>({ model: null, highlight: null });
  useEffect(() => connect((model, highlight) => setState({ model, highlight })), []);
  if (!state.model) {
    return (
      <View style={{ padding: theme.spacing.l }}>
        <Text style={{ color: theme.colors.muted }}>Waiting for a screen design...</Text>
      </View>
    );
  }
  return <Preview model={state.model} highlight={state.highlight} />;
}

createRoot(document.getElementById('root')!).render(<App />);
