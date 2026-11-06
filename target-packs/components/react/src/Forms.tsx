/*
 * The forms wave: TextArea, PasswordField, NumberInput, CurrencySelector, MultiSelect, Toggle, DateRangePicker,
 * SearchField, Autocomplete and FileUpload. They take the same props as the foundation fields (testID, label, value,
 * onChange, required, readOnly, disabled, helpText, placeholder, error) and use the same markup, so one skin serves them.
 */
import { KeyboardEvent, useId, useMemo, useRef, useState } from 'react';

import { FieldMessage, FieldProps, FieldShell, Option, fieldClass, isEmpty, options as toOptions, useField } from './field';
import { play } from './motion';

/* ---------- TextArea (oj-text-area) ---------- */

export interface TextAreaProps extends FieldProps<string> {
  maxLength?: number;
  rows?: number;
}

/** Several lines of text, with a counter when there is a limit. */
export function TextArea(props: TextAreaProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder, maxLength, rows = 3 } = props;
  const f = useField(props, value);
  return (
    <FieldShell testID={testID} id={f.id} label={label} required={required} error={f.error} focused={f.focused} disabled={disabled} readOnly={readOnly}
                helpText={helpText} multiline>
      <textarea className="bx-input bx-textarea" id={f.id} data-testid={`${testID}-input`} value={value ?? ''} rows={rows} placeholder={placeholder}
                disabled={disabled} readOnly={readOnly} maxLength={maxLength} aria-required={required || undefined} aria-invalid={f.error ? true : undefined}
                aria-describedby={f.describedBy} onFocus={f.onFocus} onBlur={f.onBlur} onChange={(e) => onChange?.(e.target.value)} />
      {maxLength ? <span className="bx-counter" aria-hidden="true">{(value ?? '').length}/{maxLength}</span> : null}
    </FieldShell>
  );
}

/* ---------- PasswordField (oj-input-password) ---------- */

export interface PasswordFieldProps extends FieldProps<string> {
  /** current-password to sign in, new-password to set one (password managers read it). */
  autoComplete?: 'current-password' | 'new-password' | 'one-time-code';
  /** Lets the customer show what they typed. */
  revealable?: boolean;
}

/** A secret: masked, never filled from the browser's history, with Show and Hide. The value is never logged or kept. */
export function PasswordField(props: PasswordFieldProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder, autoComplete = 'current-password', revealable = true } = props;
  const f = useField(props, value);
  const [shown, setShown] = useState(false);
  return (
    <FieldShell testID={testID} id={f.id} label={label} required={required} error={f.error} focused={f.focused} disabled={disabled} readOnly={readOnly}
                helpText={helpText}>
      <input className="bx-input" id={f.id} data-testid={`${testID}-input`} type={shown ? 'text' : 'password'} value={value ?? ''} placeholder={placeholder}
             disabled={disabled} readOnly={readOnly} autoComplete={autoComplete} spellCheck={false} autoCapitalize="off" aria-required={required || undefined}
             aria-invalid={f.error ? true : undefined} aria-describedby={f.describedBy} onFocus={f.onFocus} onBlur={f.onBlur}
             onChange={(e) => onChange?.(e.target.value)} />
      {revealable && !disabled
        ? <button type="button" className="bx-reveal" aria-pressed={shown} aria-label={shown ? `Hide ${label}` : `Show ${label}`}
                  onClick={() => setShown(!shown)}>{shown ? 'Hide' : 'Show'}</button>
        : null}
    </FieldShell>
  );
}

/* ---------- NumberInput (oj-input-number) ---------- */

export interface NumberInputProps extends FieldProps<number | null> {
  min?: number;
  max?: number;
  step?: number;
  /** Digits after the point; 0 for whole numbers. */
  decimals?: number;
}

/** A number, with - and + steppers; the value is a number or null when empty. */
export function NumberInput(props: NumberInputProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder, min, max, step = 1, decimals = 0 } = props;
  const [typed, setTyped] = useState<string | null>(null);
  const [own, setOwn] = useState('');
  const f = useField(props, value, own);
  const round = (n: number) => Math.round(n * 10 ** decimals) / 10 ** decimals;
  const check = (n: number | null) => {
    setOwn(n !== null && min !== undefined && n < min ? `Enter ${min} or more.` : n !== null && max !== undefined && n > max ? `Enter ${max} or less.` : '');
    onChange?.(n);
  };
  const commit = () => {
    if (typed === null) { return; }
    const text = typed.trim();
    setTyped(null);
    if (text === '') { check(null); return; }
    const n = Number(text);
    if (!Number.isFinite(n)) { setOwn(decimals ? 'Enter a number, for example 12.5.' : 'Enter a whole number.'); return; }
    check(round(n));
  };
  const nudge = (by: number) => {
    const base = value ?? (min ?? 0) - (by > 0 ? step : -step);
    const next = round(base + by);
    check(min !== undefined && next < min ? min : max !== undefined && next > max ? max : next);
    play(document.getElementById(f.id), 'roll');
  };
  const fixed = !readOnly && !disabled;
  return (
    <FieldShell testID={testID} id={f.id} label={label} required={required} error={f.error} focused={f.focused} disabled={disabled} readOnly={readOnly}
                helpText={helpText}>
      {fixed ? <button type="button" className="bx-step" aria-label={`Decrease ${label}`} disabled={min !== undefined && value !== null && value <= min}
                       onClick={() => nudge(-step)}>−</button> : null}
      <input className="bx-input bx-num" id={f.id} data-testid={`${testID}-input`} inputMode={decimals ? 'decimal' : 'numeric'} autoComplete="off"
             value={typed ?? (value === null || value === undefined ? '' : String(value))} placeholder={placeholder} disabled={disabled} readOnly={readOnly}
             aria-required={required || undefined} aria-invalid={f.error ? true : undefined} aria-describedby={f.describedBy}
             onFocus={f.onFocus} onBlur={() => { f.onBlur(); commit(); }} onKeyDown={(e) => {
               if (e.key === 'Enter') { commit(); }
               if (fixed && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); setTyped(null); nudge(e.key === 'ArrowUp' ? step : -step); }
             }} onChange={(e) => setTyped(e.target.value)} />
      {fixed ? <button type="button" className="bx-step" aria-label={`Increase ${label}`} disabled={max !== undefined && value !== null && value >= max}
                       onClick={() => nudge(step)}>+</button> : null}
    </FieldShell>
  );
}

/* ---------- CurrencySelector (oj-select-single of currencies) ---------- */

/** Common ISO 4217 currencies with their names; pass currencies for the bank's own list. */
export const CURRENCIES: ReadonlyArray<Option> = [
  { value: 'INR', label: 'Indian rupee' }, { value: 'USD', label: 'US dollar' }, { value: 'EUR', label: 'Euro' }, { value: 'GBP', label: 'Pound sterling' },
  { value: 'AED', label: 'UAE dirham' }, { value: 'SAR', label: 'Saudi riyal' }, { value: 'SGD', label: 'Singapore dollar' }, { value: 'JPY', label: 'Japanese yen' },
  { value: 'KWD', label: 'Kuwaiti dinar' }, { value: 'AUD', label: 'Australian dollar' }, { value: 'CAD', label: 'Canadian dollar' }, { value: 'CHF', label: 'Swiss franc' },
];

export interface CurrencySelectorProps extends FieldProps<string> {
  /** The currencies to offer (code and name); the common ones by default. */
  currencies?: ReadonlyArray<Option>;
}

/** One currency, shown by its code with its name beside it. */
export function CurrencySelector(props: CurrencySelectorProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder, currencies = CURRENCIES } = props;
  const f = useField(props, value);
  const name = currencies.find((c) => c.value === value)?.label;
  return (
    <FieldShell testID={testID} id={f.id} label={label} required={required} error={f.error} focused={f.focused} disabled={disabled} readOnly={readOnly}
                helpText={helpText}>
      <select className="bx-input bx-select" id={f.id} data-testid={`${testID}-input`} value={value ?? ''} disabled={disabled || readOnly}
              aria-required={required || undefined} aria-invalid={f.error ? true : undefined} aria-describedby={f.describedBy}
              onFocus={f.onFocus} onBlur={f.onBlur} onChange={(e) => { f.touch(); onChange?.(e.target.value); }}>
        <option value="">{placeholder || 'Choose a currency'}</option>
        {currencies.map((c) => <option key={c.value} value={c.value} disabled={c.disabled}>{c.value} · {c.label}</option>)}
      </select>
      {name ? <span className="bx-currency-name" aria-hidden="true">{name}</span> : null}
      <span className="bx-caret" aria-hidden="true" />
    </FieldShell>
  );
}

/* ---------- The list under a combobox (MultiSelect, Autocomplete) ---------- */

function useListbox(options: Option[], onPick: (o: Option) => void) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const move = (by: number) => {
    if (!enabled.length) { return; }
    const at = enabled.indexOf(active);
    setActive(enabled[(at + by + enabled.length) % enabled.length] ?? enabled[0]);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) { setOpen(true); setActive(enabled[0] ?? -1); } else { move(1); } return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (open) { move(-1); } return true; }
    if (e.key === 'Enter' && open && active >= 0) { e.preventDefault(); onPick(options[active]); return true; }
    if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); setActive(-1); return true; }
    return false;
  };
  return { id, open, setOpen, active, setActive, onKey, optionId: (i: number) => `${id}-opt-${i}` };
}

/* ---------- MultiSelect (oj-select-many) ---------- */

export interface MultiSelectProps extends FieldProps<string[]> {
  options: ReadonlyArray<string | Option>;
}

/** Several values from a list: the chosen ones as chips (each with Remove), the rest in a list to filter and pick. */
export function MultiSelect(props: MultiSelectProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder } = props;
  const all = useMemo(() => toOptions(props.options), [props.options]);
  const chosen = value ?? [];
  const [query, setQuery] = useState('');
  const f = useField(props, chosen);
  const left = all.filter((o) => !chosen.includes(o.value) && o.label.toLowerCase().includes(query.trim().toLowerCase()));
  const pick = (o: Option) => { if (!o.disabled) { onChange?.([...chosen, o.value]); setQuery(''); list.setActive(-1); } };
  const list = useListbox(left, pick);
  const fixed = !readOnly && !disabled;
  return (
    <div className={fieldClass(f.error, f.focused, disabled, readOnly)} data-testid={testID}>
      <label className="bx-label" htmlFor={f.id} id={`${f.id}-label`}>{label}{required ? <span className="bx-req" aria-hidden="true"> *</span> : null}</label>
      <div className="bx-control">
        <div className="bx-chips">
          {chosen.map((v) => {
            const o = all.find((x) => x.value === v);
            return (
              <span key={v} className="bx-chip">{o ? o.label : v}
                {fixed ? <button type="button" className="bx-chip-remove" aria-label={`Remove ${o ? o.label : v}`}
                                 onClick={() => onChange?.(chosen.filter((x) => x !== v))}>×</button> : null}
              </span>
            );
          })}
          {fixed
            ? <input className="bx-input" id={f.id} data-testid={`${testID}-input`} role="combobox" aria-expanded={list.open} aria-controls={`${list.id}-list`}
                     aria-autocomplete="list" aria-activedescendant={list.open && list.active >= 0 ? list.optionId(list.active) : undefined}
                     aria-required={required || undefined} aria-invalid={f.error ? true : undefined} aria-describedby={f.describedBy}
                     value={query} placeholder={chosen.length ? '' : placeholder || 'Choose'} autoComplete="off"
                     onFocus={() => { f.onFocus(); list.setOpen(true); }} onBlur={() => { f.onBlur(); list.setOpen(false); }}
                     onKeyDown={(e) => {
                       if (e.key === 'Backspace' && query === '' && chosen.length) { onChange?.(chosen.slice(0, -1)); return; }
                       list.onKey(e);
                     }}
                     onChange={(e) => { setQuery(e.target.value); list.setOpen(true); list.setActive(-1); }} />
            : null}
        </div>
        {list.open && fixed
          ? <ul className="bx-listbox" id={`${list.id}-list`} role="listbox" aria-multiselectable="true" aria-label={label}>
              {left.length === 0 ? <li className="bx-option-empty" role="presentation">Nothing more to choose</li> : null}
              {left.map((o, i) => (
                <li key={o.value} id={list.optionId(i)} role="option" aria-selected={false} aria-disabled={o.disabled || undefined}
                    className={'bx-option' + (i === list.active ? ' is-active' : '')} onMouseDown={(e) => { e.preventDefault(); pick(o); }}>{o.label}</li>
              ))}
            </ul>
          : null}
      </div>
      <FieldMessage id={f.id} error={f.error} helpText={helpText} />
    </div>
  );
}

/* ---------- Toggle (oj-switch) ---------- */

/** On or off, as a switch the screen reader announces as on or off. */
export function Toggle(props: FieldProps<boolean>) {
  const { testID, label, value, onChange, readOnly, disabled, helpText, error } = props;
  const id = useId();
  return (
    <div className={fieldClass(error ?? '', false, disabled, readOnly)} data-testid={testID}>
      <div className="bx-switch-row">
        <span className="bx-switch-label" id={`${id}-label`}>{label}</span>
        <button type="button" role="switch" className="bx-switch" id={id} data-testid={`${testID}-input`} aria-checked={!!value} aria-labelledby={`${id}-label`}
                aria-describedby={error ? `${id}-err` : helpText ? `${id}-help` : undefined} aria-readonly={readOnly || undefined} disabled={disabled}
                onClick={() => { if (!readOnly) { onChange?.(!value); } }} />
      </div>
      <FieldMessage id={id} error={error ?? ''} helpText={helpText} />
    </div>
  );
}

/* ---------- DateRangePicker (two oj-input-date) ---------- */

export interface DateRange {
  from: string;
  to: string;
}

export interface DateRangePickerProps extends FieldProps<DateRange> {
  min?: string;
  max?: string;
  fromLabel?: string;
  toLabel?: string;
  /** The longest range allowed, in days (a statement period, for example). */
  maxDays?: number;
}

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);

/** A period: from and to (ISO dates), the to day not before the from day, within min, max and maxDays. */
export function DateRangePicker(props: DateRangePickerProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, error, min, max, fromLabel = 'From', toLabel = 'To', maxDays } = props;
  const id = useId();
  const [touched, setTouched] = useState(false);
  const range = value ?? { from: '', to: '' };
  const own = range.from && range.to && range.to < range.from ? 'The end date is before the start date.'
    : range.from && range.to && maxDays !== undefined && days(range.from, range.to) > maxDays ? `Choose at most ${maxDays} days.` : '';
  const message = error || own || (touched && required && (!range.from || !range.to) ? `${label} is required.` : '');
  const part = (key: 'from' | 'to', text: string) => (
    <div className={'bx-field' + (message ? ' is-error' : '') + (disabled ? ' is-disabled' : '') + (readOnly ? ' is-readonly' : '')}>
      <label className="bx-label" htmlFor={`${id}-${key}`}>{text}</label>
      <div className="bx-control">
        <input type="date" className="bx-input" id={`${id}-${key}`} data-testid={`${testID}-${key}`} value={range[key]} disabled={disabled} readOnly={readOnly}
               min={key === 'to' ? range.from || min : min} max={key === 'from' ? range.to || max : max} aria-required={required || undefined}
               aria-invalid={message ? true : undefined} aria-describedby={message ? `${id}-err` : helpText ? `${id}-help` : undefined}
               onBlur={() => setTouched(true)} onChange={(e) => onChange?.({ ...range, [key]: e.target.value })} />
      </div>
    </div>
  );
  return (
    <fieldset className={'bx-field' + (message ? ' is-error' : '')} data-testid={testID}>
      <legend className="bx-label">{label}{required ? <span className="bx-req" aria-hidden="true"> *</span> : null}</legend>
      <div className="bx-range">{part('from', fromLabel)}{part('to', toLabel)}</div>
      <FieldMessage id={id} error={message} helpText={helpText} />
    </fieldset>
  );
}

/* ---------- SearchField (oj-input-text as a search) ---------- */

export interface SearchFieldProps extends FieldProps<string> {
  /** Called on Enter with the text, to run the search. */
  onSearch?: (text: string) => void;
}

/** A search box in a search landmark: Enter searches, Escape or the clear button empties it. */
export function SearchField(props: SearchFieldProps) {
  const { testID, label, value, onChange, disabled, helpText, placeholder, onSearch } = props;
  const f = useField({ ...props, required: false }, value);
  return (
    <div role="search">
      <FieldShell testID={testID} id={f.id} label={label} error={f.error} focused={f.focused} disabled={disabled} helpText={helpText}>
        <span className="bx-search-icon" aria-hidden="true" />
        <input className="bx-input bx-search" id={f.id} data-testid={`${testID}-input`} type="search" value={value ?? ''} placeholder={placeholder}
               disabled={disabled} autoComplete="off" enterKeyHint="search" aria-describedby={f.describedBy} onFocus={f.onFocus} onBlur={f.onBlur}
               onKeyDown={(e) => {
                 if (e.key === 'Enter') { e.preventDefault(); onSearch?.(value ?? ''); }
                 if (e.key === 'Escape' && value) { e.preventDefault(); onChange?.(''); }
               }}
               onChange={(e) => onChange?.(e.target.value)} />
        {value && !disabled
          ? <button type="button" className="bx-clear" aria-label={`Clear ${label}`} onClick={() => onChange?.('')}><span aria-hidden="true">×</span></button>
          : null}
      </FieldShell>
    </div>
  );
}

/* ---------- Autocomplete (oj-combobox-one) ---------- */

export interface AutocompleteProps extends FieldProps<string> {
  options: ReadonlyArray<string | Option>;
  /** Accept text that is not one of the options (a new payee name, for example). */
  freeText?: boolean;
}

/** One value with suggestions as the customer types (the ARIA combobox pattern): arrows move, Enter picks, Escape closes. */
export function Autocomplete(props: AutocompleteProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder, freeText } = props;
  const all = useMemo(() => toOptions(props.options), [props.options]);
  const shownLabel = all.find((o) => o.value === value)?.label ?? value ?? '';
  const [typed, setTyped] = useState<string | null>(null);
  const [own, setOwn] = useState('');
  const f = useField(props, value, own);
  const text = typed ?? shownLabel;
  const matches = all.filter((o) => o.label.toLowerCase().includes((typed ?? '').trim().toLowerCase()));
  const pick = (o: Option) => { if (o.disabled) { return; } onChange?.(o.value); setTyped(null); setOwn(''); list.setOpen(false); list.setActive(-1); };
  const list = useListbox(matches, pick);
  const leave = () => {
    f.onBlur();
    list.setOpen(false);
    if (typed === null) { return; }
    const exact = all.find((o) => o.label.toLowerCase() === typed.trim().toLowerCase());
    if (exact) { pick(exact); return; }
    if (typed.trim() === '') { onChange?.(''); setTyped(null); return; }
    if (freeText) { onChange?.(typed.trim()); setTyped(null); return; }
    setOwn('Choose one of the suggestions.');
  };
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={fieldClass(f.error, f.focused, disabled, readOnly)} data-testid={testID}>
      <label className="bx-label" htmlFor={f.id} id={`${f.id}-label`}>{label}{required ? <span className="bx-req" aria-hidden="true"> *</span> : null}</label>
      <div className="bx-control">
        <input ref={input} className="bx-input" id={f.id} data-testid={`${testID}-input`} role="combobox" aria-expanded={list.open && !readOnly}
               aria-controls={`${list.id}-list`} aria-autocomplete="list" aria-activedescendant={list.open && list.active >= 0 ? list.optionId(list.active) : undefined}
               aria-required={required || undefined} aria-invalid={f.error ? true : undefined} aria-describedby={f.describedBy} value={text} placeholder={placeholder}
               disabled={disabled} readOnly={readOnly} autoComplete="off" onFocus={f.onFocus} onBlur={leave} onKeyDown={(e) => { if (!readOnly) { list.onKey(e); } }}
               onChange={(e) => { setTyped(e.target.value); setOwn(''); list.setOpen(true); list.setActive(-1); }} />
        <span className="bx-caret" aria-hidden="true" />
        {list.open && !readOnly && !disabled
          ? <ul className="bx-listbox" id={`${list.id}-list`} role="listbox" aria-label={label}>
              {matches.length === 0 ? <li className="bx-option-empty" role="presentation">No match</li> : null}
              {matches.map((o, i) => (
                <li key={o.value} id={list.optionId(i)} role="option" aria-selected={o.value === value} aria-disabled={o.disabled || undefined}
                    className={'bx-option' + (i === list.active ? ' is-active' : '')} onMouseDown={(e) => { e.preventDefault(); pick(o); }}>{o.label}</li>
              ))}
            </ul>
          : null}
      </div>
      <FieldMessage id={f.id} error={f.error} helpText={helpText} />
    </div>
  );
}

/* ---------- FileUpload (oj-file-picker) ---------- */

export interface FileUploadProps extends FieldProps<File[]> {
  /** File types, as for an input: .pdf,.jpg or image/* */
  accept?: string;
  multiple?: boolean;
  /** The largest file, in bytes. */
  maxSize?: number;
}

export function fileSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Documents to send: a button (or drop on the area) to add them, the list with each file's size and Remove. */
export function FileUpload(props: FileUploadProps) {
  const { testID, label, value, onChange, required, disabled, helpText, error, accept, multiple, maxSize } = props;
  const id = useId();
  const files = value ?? [];
  const [own, setOwn] = useState('');
  const [over, setOver] = useState(false);
  const [touched, setTouched] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const message = error || own || (touched && required && isEmpty(files) ? `${label} is required.` : '');
  const allowed = (f: File) => !accept || accept.split(',').map((a) => a.trim().toLowerCase()).some((a) =>
    a.startsWith('.') ? f.name.toLowerCase().endsWith(a) : a.endsWith('/*') ? f.type.startsWith(a.slice(0, -1)) : f.type === a);
  const add = (list: FileList | null) => {
    setTouched(true);
    if (!list || !list.length) { return; }
    const picked = Array.from(list);
    const wrongType = picked.find((f) => !allowed(f));
    const tooBig = picked.find((f) => maxSize !== undefined && f.size > maxSize);
    if (wrongType) { setOwn(`${wrongType.name} is not a file type this accepts (${accept}).`); return; }
    if (tooBig) { setOwn(`${tooBig.name} is larger than ${fileSize(maxSize!)}.`); return; }
    setOwn('');
    onChange?.(multiple ? [...files, ...picked] : picked.slice(0, 1));
  };
  const hint = [accept ? accept.replace(/,/g, ', ') : '', maxSize !== undefined ? `up to ${fileSize(maxSize)}` : ''].filter(Boolean).join(', ');
  return (
    <div className={'bx-field' + (message ? ' is-error' : '') + (disabled ? ' is-disabled' : '')} data-testid={testID}>
      <span className="bx-label" id={`${id}-label`}>{label}{required ? <span className="bx-req" aria-hidden="true"> *</span> : null}</span>
      <div className={'bx-drop' + (over ? ' is-over' : '')} onDragOver={(e) => { e.preventDefault(); if (!disabled) { setOver(true); } }}
           onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) { add(e.dataTransfer.files); } }}>
        <input ref={picker} type="file" className="bx-visually-hidden" id={id} data-testid={`${testID}-input`} accept={accept} multiple={multiple} disabled={disabled}
               aria-hidden="true" tabIndex={-1} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        <button type="button" className="bx-drop-button" disabled={disabled} onClick={() => picker.current?.click()}
                aria-describedby={`${id}-label` + (message ? ` ${id}-err` : helpText ? ` ${id}-help` : '')}>
          {multiple ? 'Add files' : 'Choose a file'}
        </button>
        <span className="bx-drop-hint">or drop {multiple ? 'them' : 'it'} here{hint ? ` · ${hint}` : ''}</span>
      </div>
      {files.length
        ? <ul className="bx-files" aria-label={`${label}: chosen files`}>
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="bx-file">
                <span className="bx-file-name">{f.name}</span><span className="bx-file-size">{fileSize(f.size)}</span>
                {!disabled ? <button type="button" className="bx-chip-remove" aria-label={`Remove ${f.name}`}
                                     onClick={() => onChange?.(files.filter((_, j) => j !== i))}>×</button> : null}
              </li>
            ))}
          </ul>
        : null}
      <FieldMessage id={id} error={message} helpText={helpText} />
    </div>
  );
}
