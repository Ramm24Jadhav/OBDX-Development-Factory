/*
 * The forms wave: TextArea, PasswordField, NumberInput, CurrencySelector, MultiSelect, Toggle, DateRangePicker,
 * SearchField, Autocomplete and FileUpload. The same props as the foundation fields and the web packs; on a phone the
 * lists open as sheets, the keypads fit the value, and the app brings its own document picker to FileUpload.
 */
import { ReactNode, useState } from 'react';
import { Animated, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DatePicker } from './DatePicker';
import { FieldProps, FieldShell, Option, controlStyle, isEmpty, options as toOptions, styles, useField } from './field';
import { Enter, MODAL_FADE, Pop, Press, Roll, Shake, useOpen, useSlide } from './motion';
import { Theme, useTheme } from './theme';
import { part, variantOf } from './variants';

const SWITCHES = 'switch';

/* ---------- TextArea (oj-text-area) ---------- */

export interface TextAreaProps extends FieldProps<string> {
  maxLength?: number;
  /** Lines shown before it scrolls. */
  rows?: number;
}

/** Several lines of text, with a counter when there is a limit. */
export function TextArea(props: TextAreaProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder, maxLength, rows = 3 } = props;
  const t = useTheme();
  const s = styles(t);
  const f = useField(props, value);
  return (
    <FieldShell testID={testID} label={label} required={required} error={f.error} helpText={helpText}>
      <View style={[controlStyle(t, { focused: f.focused, error: f.error, disabled, readOnly }), { alignItems: 'flex-end', paddingVertical: 4 }]}>
        <TextInput testID={`${testID}-input`} style={[s.input, { minHeight: rows * 22, textAlignVertical: 'top' }]} multiline numberOfLines={rows}
                   value={value ?? ''} placeholder={placeholder} placeholderTextColor={t.color.textMuted} editable={!readOnly && !disabled} maxLength={maxLength}
                   accessibilityLabel={label} accessibilityHint={f.error || helpText} aria-required={required} aria-invalid={!!f.error}
                   onFocus={f.onFocus} onBlur={f.onBlur} onChangeText={(x) => onChange?.(x)} />
        {maxLength ? <Text style={[s.side, { paddingBottom: 6 }]} importantForAccessibility="no">{(value ?? '').length}/{maxLength}</Text> : null}
      </View>
    </FieldShell>
  );
}

/* ---------- PasswordField (oj-input-password) ---------- */

export interface PasswordFieldProps extends FieldProps<string> {
  /** password to sign in, new-password to set one, one-time-code for an OTP (the platforms' password managers read it). */
  autoComplete?: 'current-password' | 'new-password' | 'one-time-code';
  revealable?: boolean;
}

/** A secret: masked, no autocorrect or suggestions, with Show and Hide. */
export function PasswordField(props: PasswordFieldProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder, autoComplete = 'current-password', revealable = true } = props;
  const t = useTheme();
  const s = styles(t);
  const f = useField(props, value);
  const [shown, setShown] = useState(false);
  return (
    <FieldShell testID={testID} label={label} required={required} error={f.error} helpText={helpText}>
      <View style={controlStyle(t, { focused: f.focused, error: f.error, disabled, readOnly })}>
        <TextInput testID={`${testID}-input`} style={s.input} value={value ?? ''} placeholder={placeholder} placeholderTextColor={t.color.textMuted}
                   secureTextEntry={!shown} autoComplete={autoComplete} textContentType={autoComplete === 'one-time-code' ? 'oneTimeCode'
                     : autoComplete === 'new-password' ? 'newPassword' : 'password'}
                   autoCorrect={false} autoCapitalize="none" spellCheck={false} editable={!readOnly && !disabled}
                   accessibilityLabel={label} accessibilityHint={f.error || helpText} aria-required={required} aria-invalid={!!f.error}
                   onFocus={f.onFocus} onBlur={f.onBlur} onChangeText={(x) => onChange?.(x)} />
        {revealable && !disabled
          ? <Pressable testID={`${testID}-reveal`} accessibilityRole="button" accessibilityLabel={`${shown ? 'Hide' : 'Show'} ${label}`}
                       accessibilityState={{ selected: shown }} hitSlop={12} style={s.tap} onPress={() => setShown(!shown)}>
              <Text style={[s.side, { color: t.color.primaryText, fontWeight: '600' }]}>{shown ? 'Hide' : 'Show'}</Text>
            </Pressable>
          : null}
      </View>
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

function Stepper({ testID, label, sign, disabled, onPress, t }: { testID: string; label: string; sign: string; disabled: boolean; onPress: () => void; t: Theme }) {
  return (
    <Press testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
               style={{ minWidth: t.minTouch - 4, minHeight: t.minTouch - 4, alignItems: 'center', justifyContent: 'center', borderRadius: t.radius.control,
                 backgroundColor: t.color.surface2, opacity: disabled ? 0.45 : 1 }}>
      <Text style={{ fontSize: 18, color: t.color.text }} importantForAccessibility="no">{sign}</Text>
    </Press>
  );
}

/** A number on the number pad, with - and + steppers; the value is a number or null when empty. */
export function NumberInput(props: NumberInputProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder, min, max, step = 1, decimals = 0 } = props;
  const t = useTheme();
  const s = styles(t);
  const [typed, setTyped] = useState<string | null>(null);
  const [own, setOwn] = useState('');
  const f = useField(props, value, own);
  const round = (n: number) => Math.round(n * 10 ** decimals) / 10 ** decimals;
  /** Writes the number back, or keeps it out of the value with a message when it is out of range (as oj-input-number does). */
  const set = (n: number | null) => {
    const wrong = n !== null && min !== undefined && n < min ? `Enter ${min} or more.` : n !== null && max !== undefined && n > max ? `Enter ${max} or less.` : '';
    setOwn(wrong);
    if (!wrong) { onChange?.(n); }
    return !wrong;
  };
  const commit = () => {
    if (typed === null) { return; }
    const text = typed.trim();
    if (text === '') { setTyped(null); set(null); return; }
    const n = Number(text);
    if (!Number.isFinite(n)) { setOwn(decimals ? 'Enter a number, for example 12.5.' : 'Enter a whole number.'); return; }
    if (set(round(n))) { setTyped(null); }
  };
  const nudge = (by: number) => {
    const base = value ?? (min ?? 0) - by;
    const next = round(base + by);
    setTyped(null);
    set(min !== undefined && next < min ? min : max !== undefined && next > max ? max : next);
  };
  const steppable = !readOnly && !disabled;
  return (
    <FieldShell testID={testID} label={label} required={required} error={f.error} helpText={helpText}>
      <View style={[controlStyle(t, { focused: f.focused, error: f.error, disabled, readOnly }), { paddingHorizontal: 4, gap: 4 }]}>
        {steppable ? <Stepper testID={`${testID}-decrease`} label={`Decrease ${label}`} sign="−" t={t} onPress={() => nudge(-step)}
                              disabled={min !== undefined && value !== null && value <= min} /> : null}
        <Roll on={value} style={{ flex: 1, alignSelf: 'stretch' }}>
        <TextInput testID={`${testID}-input`} style={[s.input, { textAlign: 'center', fontVariant: ['tabular-nums'] }]}
                   keyboardType={decimals ? 'decimal-pad' : 'number-pad'} value={typed ?? (value === null || value === undefined ? '' : String(value))}
                   placeholder={placeholder} placeholderTextColor={t.color.textMuted} editable={!readOnly && !disabled}
                   accessibilityLabel={label} accessibilityHint={f.error || helpText} aria-required={required} aria-invalid={!!f.error}
                   onFocus={f.onFocus} onBlur={() => { f.onBlur(); commit(); }} onSubmitEditing={commit} onChangeText={setTyped} />
        </Roll>
        {steppable ? <Stepper testID={`${testID}-increase`} label={`Increase ${label}`} sign="+" t={t} onPress={() => nudge(step)}
                              disabled={max !== undefined && value !== null && value >= max} /> : null}
      </View>
    </FieldShell>
  );
}

/* ---------- A sheet of choices (CurrencySelector, MultiSelect) ---------- */

function Sheet({ open, title, onClose, children, t }: { open: boolean; title: string; onClose: () => void; children: ReactNode; t: Theme }) {
  const spring = useOpen(open);
  return (
    <Modal visible={open} transparent animationType={MODAL_FADE} accessibilityLabel={title} onRequestClose={onClose}>
      <Pressable style={sheet.backdrop} accessibilityLabel="Close the list" onPress={onClose} />
      <Animated.View style={[sheet.panel, spring, { backgroundColor: t.color.surface, borderTopLeftRadius: t.radius.card, borderTopRightRadius: t.radius.card }]}
                     accessibilityViewIsModal>
        <Text style={[sheet.title, { color: t.color.text }]} accessibilityRole="header">{title}</Text>
        {children}
      </Animated.View>
    </Modal>
  );
}

/** The field that opens a sheet: a button that says what is chosen. */
function SheetField({ testID, label, shown, empty, error, disabled, readOnly, onPress, t }: {
  testID: string; label: string; shown: string; empty: string; error: string; disabled?: boolean; readOnly?: boolean; onPress: () => void; t: Theme;
}) {
  const s = styles(t);
  return (
    <Press testID={`${testID}-input`} accessibilityRole="button" accessibilityLabel={`${shown || empty}, ${label}`}
               accessibilityHint={error || 'Opens the list of choices'} accessibilityState={{ disabled: !!(disabled || readOnly) }}
               disabled={disabled || readOnly} onPress={onPress} style={[controlStyle(t, { error, disabled, readOnly }), { justifyContent: 'space-between' }]}>
      <Text style={[s.input, shown ? null : { color: t.color.textMuted }]} numberOfLines={1}>{shown || empty}</Text>
      <Text style={s.side} importantForAccessibility="no">▾</Text>
    </Press>
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
  currencies?: ReadonlyArray<Option>;
}

/** One currency, by its code with its name beside it, chosen from a sheet. */
export function CurrencySelector(props: CurrencySelectorProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder, currencies = CURRENCIES } = props;
  const t = useTheme();
  const f = useField(props, value);
  const [open, setOpen] = useState(false);
  const chosen = currencies.find((c) => c.value === value);
  const close = () => { setOpen(false); f.touch(); };
  return (
    <FieldShell testID={testID} label={label} required={required} error={f.error} helpText={helpText}>
      <SheetField testID={testID} label={label} shown={chosen ? `${chosen.value} · ${chosen.label}` : ''} empty={placeholder || 'Choose a currency'}
                  error={f.error} disabled={disabled} readOnly={readOnly} onPress={() => setOpen(true)} t={t} />
      <Sheet open={open} title={label} onClose={close} t={t}>
        <FlatList data={currencies} keyExtractor={(c) => c.value} renderItem={({ item }) => {
          const on = item.value === value;
          return (
            <Pressable testID={`${testID}-option-${item.value}`} accessibilityRole="radio" accessibilityLabel={`${item.value}, ${item.label}`}
                       accessibilityState={{ checked: on, disabled: !!item.disabled }} disabled={item.disabled} onPress={() => { onChange?.(item.value); close(); }}
                       style={[sheet.option, { minHeight: t.minTouch, backgroundColor: on ? t.color.primarySoft : 'transparent', opacity: item.disabled ? 0.5 : 1 }]}>
              <Text style={{ fontSize: 16, color: on ? t.color.primaryText : t.color.text, fontWeight: '600', width: 56 }}>{item.value}</Text>
              <Text style={{ fontSize: 15, color: t.color.textBody, flex: 1 }}>{item.label}</Text>
              {on ? <Text style={{ color: t.color.primary }} importantForAccessibility="no">✓</Text> : null}
            </Pressable>
          );
        }} />
      </Sheet>
    </FieldShell>
  );
}

/* ---------- MultiSelect (oj-select-many) ---------- */

export interface MultiSelectProps extends FieldProps<string[]> {
  options: ReadonlyArray<string | Option>;
}

/** Several values: the chosen ones as chips (each with Remove), the list as a sheet of checkboxes. */
export function MultiSelect(props: MultiSelectProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder } = props;
  const t = useTheme();
  const f = useField(props, value);
  const [open, setOpen] = useState(false);
  const all = toOptions(props.options);
  const chosen = value ?? [];
  const labelOf = (v: string) => all.find((o) => o.value === v)?.label ?? v;
  const close = () => { setOpen(false); f.touch(); };
  const flip = (v: string) => onChange?.(chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v]);
  const editable = !readOnly && !disabled;
  return (
    <FieldShell testID={testID} label={label} required={required} error={f.error} helpText={helpText}>
      <SheetField testID={testID} label={label} shown={chosen.length ? `${chosen.length} chosen` : ''} empty={placeholder || 'Choose'}
                  error={f.error} disabled={disabled} readOnly={readOnly} onPress={() => setOpen(true)} t={t} />
      {chosen.length
        ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {chosen.map((v) => (
              <Pop key={v} on={v} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.color.primarySoft, borderRadius: 999, paddingLeft: 12,
                paddingRight: editable ? 2 : 12, minHeight: 32 }}>
                <Text style={{ fontSize: 14, color: t.color.primaryText }}>{labelOf(v)}</Text>
                {editable
                  ? <Pressable testID={`${testID}-remove-${v}`} accessibilityRole="button" accessibilityLabel={`Remove ${labelOf(v)}`} hitSlop={8}
                               onPress={() => flip(v)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 16, color: t.color.primaryText }} importantForAccessibility="no">×</Text>
                    </Pressable>
                  : null}
              </Pop>
            ))}
          </View>
        : null}
      <Sheet open={open} title={label} onClose={close} t={t}>
        <FlatList data={all} keyExtractor={(o) => o.value} renderItem={({ item }) => {
          const on = chosen.includes(item.value);
          return (
            <Pressable testID={`${testID}-option-${item.value}`} accessibilityRole="checkbox" accessibilityLabel={item.label}
                       accessibilityState={{ checked: on, disabled: !!item.disabled }} disabled={item.disabled} onPress={() => flip(item.value)}
                       style={[sheet.option, { minHeight: t.minTouch, opacity: item.disabled ? 0.5 : 1 }]}>
              <Text style={{ fontSize: 16, color: t.color.text, flex: 1 }}>{item.label}</Text>
              <View importantForAccessibility="no-hide-descendants" style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
                borderColor: on ? t.color.primary : t.color.borderStrong, backgroundColor: on ? t.color.primary : t.color.surface, alignItems: 'center', justifyContent: 'center' }}>
                {on ? <Text style={{ color: t.color.onPrimary, fontSize: 12, fontWeight: '700' }}>✓</Text> : null}
              </View>
            </Pressable>
          );
        }} />
        <Pressable testID={`${testID}-done`} accessibilityRole="button" onPress={close}
                   style={{ minHeight: t.minTouch, margin: 16, borderRadius: t.radius.control, backgroundColor: t.color.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: t.color.onPrimary, fontSize: 16, fontWeight: '600' }}>Done</Text>
        </Pressable>
      </Sheet>
    </FieldShell>
  );
}

/* ---------- Toggle (oj-switch) ---------- */

/** On or off, named by its label. The whole row is the switch, so it is easy to touch (the platform switch is 40 by 20 on the web). */
export function Toggle(props: FieldProps<boolean>) {
  const { testID, label, value, onChange, readOnly, disabled, helpText, error } = props;
  const t = useTheme();
  const s = styles(t);
  const at = useSlide(value ? 1 : 0);
  const off = !!(disabled || readOnly);
  return (
    <View testID={testID} style={s.field}>
      <Press testID={`${testID}-input`} accessibilityRole="switch" accessibilityLabel={label} accessibilityHint={error || helpText}
             accessibilityState={{ checked: !!value, disabled: off }} disabled={off} onPress={() => onChange?.(!value)}
             style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: t.minTouch, gap: 12, opacity: disabled ? 0.5 : 1 }}>
        <Text style={{ fontSize: 15, color: t.color.text, flexShrink: 1 }} importantForAccessibility="no">{label}</Text>
        <View style={[{ width: 52, height: 30, borderRadius: 15, padding: 3, backgroundColor: value ? t.color.primary : t.color.borderStrong, justifyContent: 'center' },
          part(t, SWITCHES, 'track', { on: !!value })]}>
          {/* labelled: On or Off in the track, beside the thumb (the switch role already announces it) */}
          {variantOf(t, SWITCHES) === 'labelled'
            ? <Text importantForAccessibility="no" style={{ position: 'absolute', [value ? 'left' : 'right']: 9, fontSize: 11, fontWeight: '700',
              color: value ? t.color.onPrimary : t.color.textBody }}>{value ? 'On' : 'Off'}</Text> : null}
          <Animated.View style={[{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.color.surface,
            transform: [{ translateX: at.interpolate({ inputRange: [0, 1], outputRange: [0, variantOf(t, SWITCHES) === 'labelled' ? 34 : 22] }) }] }, part(t, SWITCHES, 'thumb', { on: !!value })]} />
        </View>
      </Press>
      {error
        ? <Text testID={`${testID}-error`} style={s.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">{error}</Text>
        : helpText ? <Text style={[s.help, { marginTop: 0 }]}>{helpText}</Text> : null}
    </View>
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
  /** The longest range allowed, in days. */
  maxDays?: number;
}

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);

/** A period: two dates within min and max; the range says when the to day is before the from day or longer than maxDays. */
export function DateRangePicker(props: DateRangePickerProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, error, min, max, fromLabel = 'From', toLabel = 'To', maxDays } = props;
  const t = useTheme();
  const s = styles(t);
  const range = value ?? { from: '', to: '' };
  const own = range.from && range.to && range.to < range.from ? 'The end date is before the start date.'
    : range.from && range.to && maxDays !== undefined && days(range.from, range.to) > maxDays ? `Choose at most ${maxDays} days.` : '';
  const message = error || own;
  return (
    <View testID={testID} style={s.field} accessibilityLabel={label}>
      <Text style={s.label} accessibilityRole="header">{label}{required ? <Text style={s.req}> *</Text> : null}</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <DatePicker testID={`${testID}-from`} label={fromLabel} value={range.from} required={required} readOnly={readOnly} disabled={disabled}
                      min={min} max={max} onChange={(x) => onChange?.({ ...range, from: x })} />
        </View>
        <View style={{ flex: 1 }}>
          <DatePicker testID={`${testID}-to`} label={toLabel} value={range.to} required={required} readOnly={readOnly} disabled={disabled}
                      min={min} max={max} onChange={(x) => onChange?.({ ...range, to: x })} />
        </View>
      </View>
      {message
        ? <Text testID={`${testID}-error`} style={[s.error, { marginTop: -8 }]} accessibilityRole="alert" accessibilityLiveRegion="assertive">{message}</Text>
        : helpText ? <Text style={[s.help, { marginTop: -8 }]}>{helpText}</Text> : null}
    </View>
  );
}

/* ---------- SearchField (oj-input-text as a search) ---------- */

export interface SearchFieldProps extends FieldProps<string> {
  /** Called when the customer presses Search on the keyboard. */
  onSearch?: (text: string) => void;
}

/** A search box: the keyboard's Search key runs onSearch, the clear button empties it. */
export function SearchField(props: SearchFieldProps) {
  const { testID, label, value, onChange, disabled, helpText, placeholder, onSearch } = props;
  const t = useTheme();
  const s = styles(t);
  const f = useField({ ...props, required: false }, value);
  return (
    <View accessibilityRole="search">
      <FieldShell testID={testID} label={label} error={f.error} helpText={helpText}>
        <View style={controlStyle(t, { focused: f.focused, error: f.error, disabled })}>
          <Text style={[s.affix, { fontSize: 16 }]} importantForAccessibility="no">⌕</Text>
          <TextInput testID={`${testID}-input`} style={s.input} value={value ?? ''} placeholder={placeholder} placeholderTextColor={t.color.textMuted}
                     editable={!disabled} returnKeyType="search" autoCorrect={false} accessibilityLabel={label} accessibilityHint={helpText}
                     onFocus={f.onFocus} onBlur={f.onBlur} onSubmitEditing={() => onSearch?.(value ?? '')} onChangeText={(x) => onChange?.(x)} />
          {value && !disabled
            ? <Pressable testID={`${testID}-clear`} accessibilityRole="button" accessibilityLabel={`Clear ${label}`} hitSlop={12} style={s.tap} onPress={() => onChange?.('')}>
                <Text style={s.side}>×</Text>
              </Pressable>
            : null}
        </View>
      </FieldShell>
    </View>
  );
}

/* ---------- Autocomplete (oj-combobox-one) ---------- */

export interface AutocompleteProps extends FieldProps<string> {
  options: ReadonlyArray<string | Option>;
  /** Accept text that is not one of the options (a new payee name, for example). */
  freeText?: boolean;
  /** Suggestions shown at most. */
  limit?: number;
}

/** One value with suggestions under the field as the customer types; a suggestion is picked with a tap. */
export function Autocomplete(props: AutocompleteProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder, freeText, limit = 6 } = props;
  const t = useTheme();
  const s = styles(t);
  const all = toOptions(props.options);
  const [typed, setTyped] = useState<string | null>(null);
  const [own, setOwn] = useState('');
  const f = useField(props, value, own);
  const shown = all.find((o) => o.value === value)?.label ?? value ?? '';
  const q = (typed ?? '').trim().toLowerCase();
  const matches = typed === null ? [] : all.filter((o) => o.label.toLowerCase().includes(q)).slice(0, limit);
  const pick = (o: Option) => { if (o.disabled) { return; } onChange?.(o.value); setTyped(null); setOwn(''); };
  const leave = () => {
    f.onBlur();
    if (typed === null) { return; }
    const exact = all.find((o) => o.label.toLowerCase() === typed.trim().toLowerCase());
    if (exact) { pick(exact); return; }
    if (typed.trim() === '') { onChange?.(''); setTyped(null); return; }
    if (freeText) { onChange?.(typed.trim()); setTyped(null); return; }
    setOwn('Choose one of the suggestions.');
  };
  return (
    <FieldShell testID={testID} label={label} required={required} error={f.error} helpText={helpText}>
      <View style={controlStyle(t, { focused: f.focused, error: f.error, disabled, readOnly })}>
        <TextInput testID={`${testID}-input`} style={s.input} value={typed ?? shown} placeholder={placeholder} placeholderTextColor={t.color.textMuted}
                   editable={!readOnly && !disabled} autoCorrect={false} accessibilityLabel={label}
                   accessibilityHint={f.error || helpText || 'Type to see suggestions'} aria-required={required} aria-invalid={!!f.error}
                   onFocus={f.onFocus} onBlur={leave} onChangeText={(x) => { setTyped(x); setOwn(''); }} />
      </View>
      {/* Kept while the text is not yet a choice: a tap on a suggestion blurs the field first on the web */}
      {matches.length && (f.focused || own)
        ? <Enter effect="slide-down" testID={`${testID}-suggestions`} accessibilityLabel={`${matches.length} suggestions`}
                style={{ marginTop: 4, borderWidth: t.border, borderColor: t.color.border, borderRadius: t.radius.control, backgroundColor: t.color.surface, overflow: 'hidden' }}>
            {matches.map((o) => (
              <Pressable key={o.value} testID={`${testID}-option-${o.value}`} accessibilityRole="button" accessibilityLabel={o.label}
                         accessibilityState={{ disabled: !!o.disabled, selected: o.value === value }} disabled={o.disabled} onPress={() => pick(o)}
                         style={{ minHeight: t.minTouch, justifyContent: 'center', paddingHorizontal: 14, opacity: o.disabled ? 0.5 : 1 }}>
                <Text style={{ fontSize: 15, color: t.color.text }}>{o.label}</Text>
              </Pressable>
            ))}
          </Enter>
        : null}
    </FieldShell>
  );
}

/* ---------- FileUpload (oj-file-picker) ---------- */

/** A file the app's document picker gave (expo-document-picker, react-native-document-picker or the bank's own). */
export interface PickedFile {
  name: string;
  size: number;
  type?: string;
  uri?: string;
}

export interface FileUploadProps extends FieldProps<PickedFile[]> {
  /** Opens the app's document picker and resolves with the files chosen (empty when the customer cancels). */
  pick: () => Promise<PickedFile[]>;
  /** File types: .pdf,.jpg or image/* */
  accept?: string;
  multiple?: boolean;
  /** The largest file, in bytes. */
  maxSize?: number;
  /** Called when a picked file is refused (wrong type or too large), with the message shown (oj-file-picker's ojInvalidSelect). */
  onRefuse?: (file: PickedFile, message: string) => void;
}

export function fileSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Documents to send: a button that opens the document picker, then the list with each file's size and Remove. */
export function FileUpload(props: FileUploadProps) {
  const { testID, label, value, onChange, required, disabled, helpText, error, accept, multiple, maxSize, pick, onRefuse } = props;
  const t = useTheme();
  const s = styles(t);
  const files = value ?? [];
  const [own, setOwn] = useState('');
  const [touched, setTouched] = useState(false);
  const message = error || own || (touched && required && isEmpty(files) ? `${label} is required.` : '');
  const allowed = (f: PickedFile) => !accept || accept.split(',').map((a) => a.trim().toLowerCase()).some((a) =>
    a.startsWith('.') ? f.name.toLowerCase().endsWith(a) : a.endsWith('/*') ? (f.type ?? '').startsWith(a.slice(0, -1)) : f.type === a);
  const choose = async () => {
    const picked = await pick();
    setTouched(true);
    if (!picked.length) { return; }
    const wrongType = picked.find((f) => !allowed(f));
    const tooBig = picked.find((f) => maxSize !== undefined && f.size > maxSize);
    const refused = wrongType ?? tooBig;
    if (refused) {
      const text = wrongType ? `${refused.name} is not a file type this accepts (${accept}).` : `${refused.name} is larger than ${fileSize(maxSize!)}.`;
      setOwn(text);
      onRefuse?.(refused, text);
      return;
    }
    setOwn('');
    onChange?.(multiple ? [...files, ...picked] : picked.slice(0, 1));
  };
  const hint = [accept ? accept.replace(/,/g, ', ') : '', maxSize !== undefined ? `up to ${fileSize(maxSize)}` : ''].filter(Boolean).join(', ');
  return (
    <Enter testID={testID} style={s.field}>
      <Text style={s.label} importantForAccessibility="no">{label}{required ? <Text style={s.req}> *</Text> : null}</Text>
      <Shake error={message}>
      <Press testID={`${testID}-input`} accessibilityRole="button" accessibilityLabel={`${multiple ? 'Add files' : 'Choose a file'}${hint ? `, ${hint}` : ''}, ${label}`}
                 accessibilityHint={message || hint || helpText} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={choose}
                 style={[{ minHeight: t.minTouch + 24, borderWidth: 1.5, borderStyle: 'dashed', borderColor: message ? t.color.danger : t.color.borderStrong,
                   borderRadius: t.radius.card, alignItems: 'center', justifyContent: 'center', padding: 12, opacity: disabled ? 0.6 : 1 }, part(t, 'upload', 'area')]}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: t.color.primaryText }}>{multiple ? 'Add files' : 'Choose a file'}</Text>
        {hint ? <Text style={[s.help, { marginTop: 2 }]} importantForAccessibility="no">{hint}</Text> : null}
      </Press>
      </Shake>
      {files.map((f, i) => (
        <Enter key={`${f.name}-${i}`} effect="settle" style={{ flexDirection: 'row', alignItems: 'center', minHeight: t.minTouch, marginTop: 8, paddingLeft: 14,
          borderWidth: t.border, borderColor: t.color.border, borderRadius: t.radius.control, backgroundColor: t.color.surface }}>
          <Text style={{ flex: 1, fontSize: 15, color: t.color.text }} numberOfLines={1}>{f.name}</Text>
          <Text style={s.side}>{fileSize(f.size)}</Text>
          {!disabled
            ? <Pressable testID={`${testID}-remove-${i}`} accessibilityRole="button" accessibilityLabel={`Remove ${f.name}`} onPress={() => onChange?.(files.filter((_, j) => j !== i))}
                         style={{ minWidth: t.minTouch, minHeight: t.minTouch, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18, color: t.color.textMuted }} importantForAccessibility="no">×</Text>
              </Pressable>
            : null}
        </Enter>
      ))}
      {message
        ? <Text testID={`${testID}-error`} style={s.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">{message}</Text>
        : helpText ? <Text style={s.help}>{helpText}</Text> : null}
    </Enter>
  );
}

const sheet = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  panel: { maxHeight: '70%', paddingBottom: 24 },
  title: { fontSize: 17, fontWeight: '700', padding: 16 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, gap: 8 },
});
