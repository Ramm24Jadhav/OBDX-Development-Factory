/*
 * Premium components preview: renders a Screen Model with the premium React components (target-packs/components/
 * react) in the premium skin (bx.css). The Angular target pack's components render the same markup with the same
 * skin (the browser gates check both), so this is what an Angular app's screen looks like too.
 */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../target-packs/components/react/src/bx.css';
import { Button } from '../../target-packs/components/react/src/Button';
import { CheckboxGroup, RadioGroup } from '../../target-packs/components/react/src/Choices';
import { DatePicker } from '../../target-packs/components/react/src/DatePicker';
import { Dropdown } from '../../target-packs/components/react/src/Dropdown';
import { AmountInput, TextField } from '../../target-packs/components/react/src/TextField';
import { styleClasses } from '../../target-packs/components/react/src/style';
import { Component, connect, highlightCss, initialValue, optionsOf, ScreenModel, Value } from './protocol';

const CHROMING: Record<string, 'callToAction' | 'outlined' | 'borderless'> = { primary: 'callToAction', secondary: 'outlined', link: 'borderless' };

function Field({ c, value, onChange }: { c: Component; value: Value; onChange: (v: Value) => void }) {
  const common = {
    testID: c.id,
    label: c.label || c.name || c.id,
    required: c.required === true,
    readOnly: c.readonly === true,
    helpText: c.helpText || undefined,
    placeholder: c.placeholder || undefined,
  };
  const text = { ...common, value: value as string, onChange: (v: string) => onChange(v) };
  switch (c.type) {
    case 'textarea':
    case 'text':
      return <TextField {...text} maxLength={c.maxLength || undefined} />;
    case 'number': return <TextField {...text} inputMode="numeric" />;
    case 'amount': {
      const n = Number(value);
      return <AmountInput {...common} value={value === '' || Number.isNaN(n) ? null : n} onChange={(v) => onChange(v === null ? '' : String(v))} />;
    }
    case 'date': return <DatePicker {...text} />;
    case 'select':
    case 'account':
      return <Dropdown {...text} options={optionsOf(c)} />;
    case 'radio': return <RadioGroup {...text} options={optionsOf(c)} />;
    case 'checkbox': return <CheckboxGroup {...common} value={value as string[]} onChange={(v) => onChange(v)} options={optionsOf(c)} />;
    case 'switch':
      return (
        <div className="bx-field" data-testid={c.id}>
          <label className={'bx-choice' + (value ? ' is-on' : '')}>
            <input type="checkbox" role="switch" className="bx-choice-input" checked={!!value} disabled={common.readOnly} onChange={(e) => onChange(e.target.checked)} />
            <span className="bx-choice-mark" aria-hidden="true" /><span className="bx-choice-label">{common.label}</span>
          </label>
        </div>
      );
    default:
      return (
        <div className="bx-field" data-testid={c.id}>
          <span className="bx-label">{common.label}</span>
          <span className="bx-control" style={{ padding: '0 14px' }}>{(value as string) || '-'}</span>
        </div>
      );
  }
}

function Preview({ model, highlight }: { model: ScreenModel; highlight: string | null }) {
  const [values, setValues] = useState<Record<string, Value>>({});
  useEffect(() => setValues({}), [model.name]);
  const valueOf = (c: Component) => (c.id in values ? values[c.id] : initialValue(c));
  return (
    <div className={styleClasses({ look: 'elevated' })} style={{ minHeight: '100%', background: 'var(--bx-surface-2)', fontFamily: 'var(--bx-font)' }}>
      <style>{highlightCss(highlight)}</style>
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px 40px', boxSizing: 'border-box' }}>
        <h1 style={{ margin: '0 0 16px', fontSize: 22, color: 'var(--bx-text)' }}>{model.title || model.name}</h1>
        {model.sections.map((s) => (
          <section key={s.id} style={{ marginBottom: 16, padding: 16, borderRadius: 'var(--bx-radius-lg)', background: 'var(--bx-surface)', border: '1px solid var(--bx-border)' }}>
            {s.title ? <h2 style={{ margin: '0 0 12px', fontSize: 15, color: 'var(--bx-text)' }}>{s.title}</h2> : null}
            <div style={{ display: 'grid', gap: '0 16px', gridTemplateColumns: `repeat(${Math.min(Math.max(s.columns || 1, 1), 3)}, minmax(0, 1fr))` }}>
              {s.components.map((c) => (
                <Field key={c.id} c={c} value={valueOf(c)} onChange={(v) => setValues((current) => ({ ...current, [c.id]: v }))} />
              ))}
            </div>
          </section>
        ))}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
          {model.actions.map((a) => <Button key={a.id} testID={a.id} label={a.label} chroming={CHROMING[a.kind || 'secondary'] || 'outlined'} />)}
        </div>
      </main>
    </div>
  );
}

function App() {
  const [state, setState] = useState<{ model: ScreenModel | null; highlight: string | null }>({ model: null, highlight: null });
  useEffect(() => connect((model, highlight) => setState({ model, highlight })), []);
  return state.model ? <Preview model={state.model} highlight={state.highlight} />
    : <p className="bx-help" style={{ padding: 16 }}>Waiting for a screen design...</p>;
}

createRoot(document.getElementById('root')!).render(<App />);
