/*
 * The material variant of the foundation components, built on @mui/material (MIT core only; never MUI X). Same props,
 * same test ids and the same accessible names as the pack's own components; the theme takes the bank's colours from
 * the --bx-* tokens (native CSS colours), so a component style or dark mode set on an ancestor still applies.
 */
import { Button as MuiButton, Checkbox, Chip, FormControl, FormControlLabel, FormGroup, FormHelperText, FormLabel, IconButton as MuiIconButton, InputAdornment,
  Radio, RadioGroup as MuiRadioGroup, Slider as MuiSlider, Switch, TextField as MuiTextField, ThemeProvider, ToggleButton, ToggleButtonGroup, createTheme } from '@mui/material';
import { ComponentType, ReactNode, useId, useState } from 'react';

import type { ButtonProps, IconButtonProps } from './Button';
import type { DropdownProps } from './Dropdown';
import { FieldProps, Option, isEmpty, options as toOptions, useField } from './field';
import type { PasswordFieldProps, SearchFieldProps, TextAreaProps } from './Forms';
import type { ChipsProps, ItemLike, SegmentsProps, SliderProps } from './G1';
import type { TextFieldProps } from './TextField';

const theme = createTheme({
  cssVariables: { nativeColor: true, colorSchemeSelector: '.bx-dark' },
  colorSchemes: { light: true, dark: true },
  palette: {
    primary: { main: 'var(--bx-brand, #4f46e5)', contrastText: 'var(--bx-on-brand, #fff)' },
    error: { main: 'var(--bx-danger, #dc2626)' },
  },
  shape: { borderRadius: 10 },
  typography: { fontFamily: 'inherit', button: { textTransform: 'none', fontWeight: 600 } },
});

const themed = (node: ReactNode) => <ThemeProvider theme={theme}>{node}</ThemeProvider>;
const items = (list: ReadonlyArray<ItemLike>): Option[] =>
  list.map((o) => (typeof o === 'string' ? { value: o, label: o } : { value: String(o.value ?? o.id ?? o.label), label: String(o.label ?? o.title ?? o.value ?? o.id), disabled: o.disabled }));

function Button({ testID, label, chroming = 'callToAction', size, startIcon, endIcon, busy, disabled, onAction, type, className }: ButtonProps) {
  const variant = chroming === 'outlined' ? 'outlined' : chroming === 'borderless' ? 'text' : 'contained';
  return themed(
    <MuiButton variant={variant} color={chroming === 'danger' ? 'error' : 'primary'} size={size === 'sm' ? 'small' : 'medium'} type={type ?? 'button'} className={className}
               data-testid={testID} disabled={disabled || busy} aria-busy={busy || undefined} startIcon={startIcon} endIcon={endIcon}
               onClick={(e) => onAction?.(e)}>{label}</MuiButton>,
  );
}

function IconButton({ testID, label, icon = 'more', size, disabled, onAction, type, className }: IconButtonProps) {
  return themed(
    <MuiIconButton type={type ?? 'button'} className={className} data-testid={testID} aria-label={label} title={label} disabled={disabled}
                   size={size === 'sm' ? 'small' : 'medium'} onClick={(e) => onAction?.(e)}>
      {typeof icon === 'string' ? <span className={`bx-icon bx-icon--${icon}`} aria-hidden="true" /> : icon}
    </MuiIconButton>,
  );
}

/** One text-like field: TextField, TextArea, PasswordField and SearchField differ only in these settings. */
function Field(props: FieldProps<string> & { multiline?: boolean; rows?: number; maxLength?: number; type?: string; autoComplete?: string; end?: ReactNode;
  onKeyDown?: (e: React.KeyboardEvent) => void }) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder, multiline, rows, maxLength, type, autoComplete, end, onKeyDown } = props;
  const f = useField(props, value);
  return themed(
    <MuiTextField variant="filled" fullWidth id={f.id} data-testid={testID} label={label} value={value ?? ''} placeholder={placeholder} required={required}
                  disabled={disabled} multiline={multiline} minRows={rows} type={type} autoComplete={autoComplete ?? 'off'} error={!!f.error}
                  helperText={f.error || helpText || undefined} onFocus={f.onFocus} onBlur={f.onBlur} onKeyDown={onKeyDown}
                  onChange={(e) => onChange?.(e.target.value)}
                  slotProps={{ htmlInput: { 'data-testid': `${testID}-input`, readOnly, maxLength },
                    input: end ? { endAdornment: <InputAdornment position="end">{end}</InputAdornment> } : undefined,
                    formHelperText: f.error ? { role: 'alert' } : undefined }} />,
  );
}

const TextField = (p: TextFieldProps) => <Field {...p} />;
const TextArea = (p: TextAreaProps) => <Field {...p} multiline rows={p.rows ?? 3} />;

function PasswordField(p: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  const toggle = p.revealable === false ? undefined
    : <MuiButton size="small" onClick={() => setShown(!shown)} aria-pressed={shown}>{shown ? 'Hide' : 'Show'}</MuiButton>;
  return <Field {...p} type={shown ? 'text' : 'password'} autoComplete={p.autoComplete ?? 'current-password'} end={toggle} />;
}

function SearchField(p: SearchFieldProps) {
  return (
    <div role="search">
      <Field {...p} required={false} type="search" onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); p.onSearch?.(p.value ?? ''); }
        if (e.key === 'Escape' && p.value) { e.preventDefault(); p.onChange?.(''); }
      }} />
    </div>
  );
}

function Dropdown(props: DropdownProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder } = props;
  const f = useField(props, value);
  return themed(
    <MuiTextField select variant="filled" fullWidth id={f.id} data-testid={testID} label={label} value={value ?? ''} required={required} disabled={disabled || readOnly}
                  error={!!f.error} helperText={f.error || helpText || undefined} onFocus={f.onFocus} onBlur={f.onBlur} onChange={(e) => onChange?.(e.target.value)}
                  slotProps={{ select: { native: true }, htmlInput: { 'data-testid': `${testID}-input` }, inputLabel: { shrink: true },
                    formHelperText: f.error ? { role: 'alert' } : undefined }}>
      <option value="" disabled={required}>{placeholder ?? 'Choose'}</option>
      {toOptions(props.options).map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
    </MuiTextField>,
  );
}

type Choice<T> = FieldProps<T> & { options: ReadonlyArray<string | Option>; horizontal?: boolean };

function Choices<T extends string | string[]>({ multiple, ...props }: Choice<T> & { multiple: boolean }) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, error, horizontal } = props;
  const id = useId();
  const [touched, setTouched] = useState(false);
  const message = error || (touched && required && isEmpty(value) ? `${label} is required.` : '');
  const pick = (v: string) => {
    if (readOnly || disabled) { return; }
    setTouched(true);
    const list = value as string[];
    onChange?.((multiple ? (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]) : v) as T);
  };
  const opts = toOptions(props.options);
  const controls = opts.map((o) => (
    <FormControlLabel key={o.value} value={o.value} label={o.label} disabled={disabled || o.disabled}
                      control={multiple ? <Checkbox checked={(value as string[]).includes(o.value)} onChange={() => pick(o.value)} /> : <Radio />} />
  ));
  return themed(
    <FormControl component="fieldset" data-testid={testID} required={required} error={!!message} disabled={disabled}>
      <FormLabel component="legend">{label}</FormLabel>
      {multiple ? <FormGroup row={horizontal}>{controls}</FormGroup>
        : <MuiRadioGroup row={horizontal} name={id} value={value ?? ''} onChange={(e) => pick(e.target.value)}>{controls}</MuiRadioGroup>}
      {message || helpText ? <FormHelperText role={message ? 'alert' : undefined}>{message || helpText}</FormHelperText> : null}
    </FormControl>,
  );
}

const CheckboxGroup = (p: Choice<string[]>) => <Choices {...p} multiple />;
const RadioGroup = (p: Choice<string>) => <Choices {...p} multiple={false} />;

function Toggle({ testID, label, value, onChange, readOnly, disabled, helpText, error }: FieldProps<boolean>) {
  return themed(
    <FormControl data-testid={testID} error={!!error} disabled={disabled}>
      <FormControlLabel label={label} labelPlacement="start" sx={{ justifyContent: 'space-between', ml: 0 }}
                        control={<Switch checked={!!value} slotProps={{ input: { role: 'switch', 'data-testid': `${testID}-input` } as object }} readOnly={readOnly}
                                         onChange={() => { if (!readOnly) { onChange?.(!value); } }} />} />
      {error || helpText ? <FormHelperText role={error ? 'alert' : undefined}>{error || helpText}</FormHelperText> : null}
    </FormControl>,
  );
}

function Slider({ testID, label, value, onChange, min = 0, max = 100, step = 1, prefix, decimals = 0, disabled, helpText }: SliderProps) {
  const id = useId();
  const shown = (v: number) => (prefix ? `${prefix} ` : '') + Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: decimals });
  return themed(
    <FormControl fullWidth data-testid={testID} disabled={disabled}>
      <FormLabel id={`${id}-label`}>{label}: {shown(value)}</FormLabel>
      <MuiSlider value={value} min={min} max={max} step={step} disabled={disabled} valueLabelDisplay="auto" valueLabelFormat={shown} getAriaValueText={shown}
                 aria-labelledby={`${id}-label`} onChange={(_, v) => onChange?.(v as number)} />
      {helpText ? <FormHelperText>{helpText}</FormHelperText> : null}
    </FormControl>,
  );
}

function ToggleGroup({ testID, label, options, value, onChange, disabled }: SegmentsProps) {
  const id = useId();
  return themed(
    <FormControl data-testid={testID} disabled={disabled}>
      <FormLabel id={`${id}-label`}>{label}</FormLabel>
      <ToggleButtonGroup exclusive color="primary" value={value} aria-labelledby={`${id}-label`} disabled={disabled}
                         onChange={(_, v: string | null) => { if (v !== null) { onChange?.(v); } }}>
        {items(options).map((o) => <ToggleButton key={o.value} value={o.value} disabled={o.disabled}>{o.label}</ToggleButton>)}
      </ToggleButtonGroup>
    </FormControl>,
  );
}

function FilterChips({ testID, label, options, value, onChange, multiple = true }: ChipsProps) {
  const id = useId();
  return themed(
    <div role="group" aria-labelledby={`${id}-label`} data-testid={testID}>
      <FormLabel id={`${id}-label`}>{label}</FormLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {items(options).map((o) => {
          const on = value.includes(o.value);
          return <Chip key={o.value} component="button" type="button" label={o.label} color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'}
                       aria-pressed={on} disabled={o.disabled} onClick={() => onChange?.(on ? value.filter((x) => x !== o.value) : multiple ? [...value, o.value] : [o.value])} />;
        })}
      </div>
    </div>,
  );
}

/** The material variant built on @mui/material, by component name; the other components draw it in CSS. */
export const MATERIAL: Record<string, ComponentType<never>> = {
  Button, SecondaryButton: (p: ButtonProps) => <Button {...p} chroming="outlined" />, DestructiveButton: (p: ButtonProps) => <Button {...p} chroming="danger" />,
  IconButton, TextField, TextArea, PasswordField, SearchField, Dropdown, CheckboxGroup, RadioGroup, Toggle, Slider, ToggleGroup, FilterChips,
};
