/*
 * The Material variant set: the pack's components drawn by MUI Material (@mui/material, MIT; the core only, never MUI X
 * Pro or Premium), with the same props as the pack's own so a screen swaps one for the other. MaterialTheme builds the
 * MUI theme from the bank tokens (the --bx-* custom properties in scope, the pack's defaults without them); a Material
 * component outside one themes itself. The list of components and what each replaces is variants/v6.json.
 */
import {
  Alert, Button as MuiButton, Card as MuiCard, CardActionArea, CardActions, CardContent, CardHeader, Checkbox, Chip, Dialog as MuiDialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle, FormControl, FormControlLabel, FormGroup, FormHelperText, FormLabel, IconButton, InputLabel, LinearProgress,
  Menu, MenuItem as MuiMenuItem, Radio, RadioGroup as MuiRadioGroup, Select, Slider as MuiSlider, Snackbar, Stack, Step, StepLabel, Stepper as MuiStepper, Switch,
  Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Tabs as MuiTabs, TextField as MuiTextField, ThemeProvider, Typography, createTheme,
} from '@mui/material';
import type { Theme } from '@mui/material';
import { ReactNode, createContext, useContext, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { ButtonProps } from './Button';
import type { CardProps } from './Card';
import type { DataTableProps } from './DataTable';
import type { DialogProps } from './Dialog';
import type { DropdownProps } from './Dropdown';
import type { ActionMenuProps, ChipsProps, SliderProps, StepperProps } from './G1';
import { toItems } from './G1';
import type { MetersProps } from './G4';
import type { TabsProps } from './Tabs';
import type { TextFieldProps } from './TextField';
import type { ToastProps } from './Toast';
import { FieldProps, Option, options as toOptions } from './field';

/* ---------- the theme from the bank tokens ---------- */

/** The pack's default tokens (bx.css :root), used where a token is not set. */
export const TOKEN_DEFAULTS: Record<string, string> = {
  'brand': '#4f46e5', 'brand-2': '#7c3aed', 'on-brand': '#ffffff', 'text': '#0f172a', 'muted': '#64748b', 'surface': '#ffffff', 'surface-2': '#f8fafc',
  'border': '#e2e8f0', 'danger': '#dc2626', 'success': '#059669', 'warning': '#d97706', 'info': '#0284c7', 'radius': '10px',
  'font': '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

/** Dark when the surface colour is dark (#rgb or #rrggbb; other forms count as light). */
export function isDark(hex: string): boolean {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) { return false; }
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

/** An MUI theme from token values; read(name) gives a --bx-<name> value or '' when it is not set. */
export function materialTheme(read: (name: string) => string = () => ''): Theme {
  const t = (name: string) => read(name).trim() || TOKEN_DEFAULTS[name];
  return createTheme({
    palette: {
      mode: isDark(t('surface')) ? 'dark' : 'light',
      primary: { main: t('brand'), contrastText: t('on-brand') },
      secondary: { main: t('brand-2') },
      error: { main: t('danger') }, success: { main: t('success') }, warning: { main: t('warning') }, info: { main: t('info') },
      background: { default: t('surface-2'), paper: t('surface') },
      text: { primary: t('text'), secondary: t('muted') },
      divider: t('border'),
    },
    shape: { borderRadius: parseFloat(t('radius')) || 10 },
    typography: { fontFamily: t('font'), button: { textTransform: 'none', fontWeight: 600 } },
  });
}

const Themed = createContext(false);

/** Themes the Material components inside it from the bank tokens in scope where it is placed. */
export function MaterialTheme({ children }: { children?: ReactNode }) {
  const at = useRef<HTMLSpanElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  useLayoutEffect(() => {
    const s = at.current ? getComputedStyle(at.current) : null;
    if (s) { setValues(Object.fromEntries(Object.keys(TOKEN_DEFAULTS).map((k) => [k, s.getPropertyValue(`--bx-${k}`)]))); }
  }, []);
  const theme = useMemo(() => materialTheme((k) => values[k] ?? ''), [values]);
  return <span ref={at} className="bx-material" style={{ display: 'contents' }}><Themed.Provider value><ThemeProvider theme={theme}>{children}</ThemeProvider></Themed.Provider></span>;
}

/** The node in the bank's theme unless a MaterialTheme is already around it. */
function useThemed(node: ReactNode) { return useContext(Themed) ? node : <MaterialTheme>{node}</MaterialTheme>; }

/* ---------- actions ---------- */

const CHROMING = { callToAction: ['contained', 'primary'], solid: ['contained', 'primary'], outlined: ['outlined', 'primary'], borderless: ['text', 'primary'], danger: ['contained', 'error'] } as const;

/** Button as MUI Button: callToAction and solid contained, outlined, borderless as text, danger contained in the error colour. */
export function MaterialButton({ testID, label, chroming = 'callToAction', size, startIcon, endIcon, busy, disabled, onAction, type = 'button' }: ButtonProps) {
  const [variant, color] = CHROMING[chroming] ?? CHROMING.outlined;
  return useThemed(
    <MuiButton data-testid={testID} variant={variant} color={color} size={size === 'sm' ? 'small' : 'medium'} startIcon={startIcon} endIcon={endIcon}
               disabled={disabled || busy} aria-busy={busy || undefined} type={type} onClick={(e) => { if (!busy) { onAction?.(e); } }} disableElevation={chroming !== 'solid'}>
      {label}
    </MuiButton>,
  );
}

/** Any of the pack's menus as an MUI Menu under a button. */
export function MaterialMenu({ testID, label = 'More', items, onAction, disabled }: ActionMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const id = useId();
  const list = toItems(items);
  return useThemed(
    <span data-testid={testID}>
      <MuiButton variant="outlined" disabled={disabled} aria-haspopup="menu" aria-expanded={anchor ? true : undefined} aria-controls={anchor ? id : undefined}
                 onClick={(e) => setAnchor(e.currentTarget)}>{label}</MuiButton>
      <Menu id={id} anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {list.map((o) => <MuiMenuItem key={o.id} disabled={o.disabled} sx={o.danger ? { color: 'error.main' } : undefined} onClick={() => { setAnchor(null); onAction?.(o.id); }}>{o.label}</MuiMenuItem>)}
      </Menu>
    </span>,
  );
}

/* ---------- inputs ---------- */

const shownError = (p: { label: string; required?: boolean; error?: string }, empty: boolean, touched: boolean) =>
  p.error || (touched && p.required && empty ? `${p.label} is required.` : '');

/** Text, a password, a search or several lines as an MUI outlined TextField. */
export function MaterialTextField(props: TextFieldProps & { type?: 'text' | 'password' | 'search'; multiline?: boolean; rows?: number }) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder, maxLength, inputMode, autoComplete, type = 'text', multiline, rows } = props;
  const [touched, setTouched] = useState(false);
  const error = shownError(props, !value, touched);
  return useThemed(
    <MuiTextField data-testid={testID} label={label} value={value ?? ''} onChange={(e) => onChange?.(e.target.value)} onBlur={() => setTouched(true)}
                  required={required} disabled={disabled} placeholder={placeholder} type={type} multiline={multiline} minRows={multiline ? rows ?? 3 : undefined}
                  error={!!error} helperText={error || helpText || undefined} autoComplete={autoComplete} fullWidth
                  slotProps={{ htmlInput: { readOnly, maxLength, inputMode } }} />,
  );
}

/** Choose one option as an MUI Select. */
export function MaterialSelect(props: DropdownProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, options } = props;
  const id = useId();
  const [touched, setTouched] = useState(false);
  const error = shownError(props, !value, touched);
  return useThemed(
    <FormControl data-testid={testID} fullWidth required={required} disabled={disabled} error={!!error}>
      <InputLabel id={`${id}-l`}>{label}</InputLabel>
      <Select labelId={`${id}-l`} label={label} value={value ?? ''} readOnly={readOnly} onChange={(e) => onChange?.(String(e.target.value))} onClose={() => setTouched(true)}>
        {toOptions(options).map((o) => <MuiMenuItem key={o.value} value={o.value} disabled={o.disabled}>{o.label}</MuiMenuItem>)}
      </Select>
      {error || helpText ? <FormHelperText>{error || helpText}</FormHelperText> : null}
    </FormControl>,
  );
}

type ChoiceProps<T> = FieldProps<T> & { options: ReadonlyArray<string | Option> };

function Choices({ legend, p, children }: { legend: string; p: Pick<FieldProps<unknown>, 'testID' | 'required' | 'disabled' | 'error' | 'helpText'>; children: ReactNode }) {
  return (
    <FormControl component="fieldset" data-testid={p.testID} required={p.required} disabled={p.disabled} error={!!p.error}>
      <FormLabel component="legend">{legend}</FormLabel>
      {children}
      {p.error || p.helpText ? <FormHelperText>{p.error || p.helpText}</FormHelperText> : null}
    </FormControl>
  );
}

/** Choose any number as MUI checkboxes. */
export function MaterialCheckboxGroup(props: ChoiceProps<string[]>) {
  const value = props.value ?? [];
  const flip = (v: string) => props.onChange?.(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return useThemed(
    <Choices legend={props.label} p={props}>
      <FormGroup>{toOptions(props.options).map((o) => <FormControlLabel key={o.value} label={o.label} disabled={o.disabled}
        control={<Checkbox checked={value.includes(o.value)} readOnly={props.readOnly} onChange={() => { if (!props.readOnly) { flip(o.value); } }} />} />)}</FormGroup>
    </Choices>,
  );
}

/** Choose one as MUI radios. */
export function MaterialRadioGroup(props: ChoiceProps<string>) {
  return useThemed(
    <Choices legend={props.label} p={props}>
      <MuiRadioGroup value={props.value ?? ''} onChange={(e) => { if (!props.readOnly) { props.onChange?.(e.target.value); } }}>
        {toOptions(props.options).map((o) => <FormControlLabel key={o.value} value={o.value} label={o.label} disabled={o.disabled} control={<Radio />} />)}
      </MuiRadioGroup>
    </Choices>,
  );
}

/** On or off as an MUI Switch. */
export function MaterialSwitch({ testID, label, value, onChange, readOnly, disabled, helpText, error }: FieldProps<boolean>) {
  return useThemed(
    <FormControl data-testid={testID} error={!!error} disabled={disabled}>
      <FormControlLabel label={label} control={<Switch checked={!!value} onChange={(e) => { if (!readOnly) { onChange?.(e.target.checked); } }} />} />
      {error || helpText ? <FormHelperText>{error || helpText}</FormHelperText> : null}
    </FormControl>,
  );
}

/** An amount on a range as an MUI Slider, the value beside the label. */
export function MaterialSlider({ testID, label, value, onChange, min = 0, max = 100, step = 1, prefix, decimals = 0, disabled, helpText }: SliderProps) {
  const id = useId();
  const text = (v: number) => `${prefix ? prefix + ' ' : ''}${v.toFixed(decimals)}`;
  return useThemed(
    <Stack data-testid={testID} spacing={1}>
      <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography id={id} component="span">{label}</Typography><Typography component="span" sx={{ fontWeight: 600 }}>{text(value)}</Typography></Stack>
      <MuiSlider aria-labelledby={id} value={value} min={min} max={max} step={step} disabled={disabled} getAriaValueText={text} valueLabelDisplay="auto" valueLabelFormat={text}
                 onChange={(_, v) => onChange?.(Array.isArray(v) ? v[0] : v)} />
      {helpText ? <FormHelperText>{helpText}</FormHelperText> : null}
    </Stack>,
  );
}

/** Filters as MUI chips that toggle; one at a time when multiple is false. */
export function MaterialChips({ testID, label, options, value, onChange, multiple = true }: ChipsProps) {
  const on = value ?? [];
  const pick = (id: string) => onChange?.(on.includes(id) ? on.filter((x) => x !== id) : multiple ? [...on, id] : [id]);
  return useThemed(
    <Stack data-testid={testID} role="group" aria-label={label} direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {toItems(options).map((o) => <Chip key={o.id} label={o.label} disabled={o.disabled} clickable color={on.includes(o.id) ? 'primary' : 'default'}
        variant={on.includes(o.id) ? 'filled' : 'outlined'} aria-pressed={on.includes(o.id)} onClick={() => pick(o.id)} />)}
    </Stack>,
  );
}

/* ---------- containers and navigation ---------- */

/** Tabs as MUI Tabs, with the chosen tab's panel. */
export function MaterialTabs({ label, tabs, selection, onSelectionChange, testID }: TabsProps) {
  const id = useId();
  const shown = tabs.find((t) => t.id === selection);
  return useThemed(
    <div data-testid={testID}>
      <MuiTabs aria-label={label} value={shown ? selection : false} onChange={(_, v) => onSelectionChange(String(v))} variant="scrollable" scrollButtons="auto">
        {tabs.map((t) => <Tab key={t.id} value={t.id} label={t.label} disabled={t.disabled} id={`${id}-${t.id}`} aria-controls={t.content !== undefined ? `${id}-${t.id}-p` : undefined} />)}
      </MuiTabs>
      {shown?.content !== undefined ? <div role="tabpanel" id={`${id}-${shown.id}-p`} aria-labelledby={`${id}-${shown.id}`}>{shown.content}</div> : null}
    </div>,
  );
}

/** A card as an MUI Card; onAction makes the whole card one button. */
export function MaterialCard({ heading, subheading, children, actions, onAction, selected, testID }: CardProps) {
  const body = <>{heading ? <CardHeader title={heading} subheader={subheading} slotProps={{ title: { component: 'h3', variant: 'h6' } }} /> : null}{children ? <CardContent>{children}</CardContent> : null}</>;
  return useThemed(
    <MuiCard data-testid={testID} variant="outlined" sx={selected ? { borderColor: 'primary.main', borderWidth: 2 } : undefined}>
      {onAction ? <CardActionArea onClick={onAction} aria-pressed={selected ?? undefined}>{body}</CardActionArea> : body}
      {actions ? <CardActions>{actions}</CardActions> : null}
    </MuiCard>,
  );
}

/** A modal dialog as an MUI Dialog; cancelBehavior 'none' keeps it open on Escape and outside clicks. */
export function MaterialDialog({ open, onOpenChange, title, description, children, footer, cancelBehavior = 'icon', testID, container }: DialogProps) {
  const id = useId();
  return useThemed(
    <MuiDialog open={open} container={container ?? undefined} slotProps={{ paper: { 'data-testid': testID } as object }} aria-labelledby={`${id}-t`} aria-describedby={description ? `${id}-d` : undefined}
 onClose={() => { if (cancelBehavior !== 'none') { onOpenChange(false); } }}>
      <DialogTitle id={`${id}-t`} sx={{ pr: cancelBehavior === 'icon' ? 7 : undefined }}>{title}</DialogTitle>
      {cancelBehavior === 'icon' ? <IconButton aria-label="Close" onClick={() => onOpenChange(false)} sx={{ position: 'absolute', right: 8, top: 8 }}><span aria-hidden="true">×</span></IconButton> : null}
      <DialogContent>{description ? <DialogContentText id={`${id}-d`}>{description}</DialogContentText> : null}{children}</DialogContent>
      {footer ? <DialogActions>{footer}</DialogActions> : null}
    </MuiDialog>,
  );
}

const SEVERITY = { error: 'error', warning: 'warning', confirmation: 'success', info: 'info' } as const;

/** Messages as an MUI Snackbar with an Alert, one at a time; errors stay until closed. */
export function MaterialSnackbar({ messages, onClose, display = 'notification', testID }: ToastProps) {
  const m = messages[0];
  const severity = m?.severity ?? 'info';
  const timeout = m?.autoTimeout ?? (severity === 'error' ? 0 : 5000);
  const alert = m ? <Alert severity={SEVERITY[severity]} variant="filled" onClose={() => onClose(m)} role={severity === 'error' ? 'alert' : 'status'}>
    <strong>{m.summary}</strong>{m.detail ? <> {m.detail}</> : null}</Alert> : null;
  return useThemed(display === 'general'
    ? <div data-testid={testID}>{alert}</div>
    : <Snackbar data-testid={testID} open={!!m} anchorOrigin={{ vertical: 'top', horizontal: 'right' }} autoHideDuration={timeout || null}
                onClose={(_, why) => { if (m && why !== 'clickaway') { onClose(m); } }}>{alert ?? <span />}</Snackbar>);
}

/** Steps as an MUI Stepper; the ones before the current step are done. */
export function MaterialStepper({ testID, label = 'Progress', steps, selectedStep }: StepperProps) {
  const list = toItems(steps);
  const at = Math.max(0, list.findIndex((s) => s.id === selectedStep));
  return useThemed(
    <MuiStepper data-testid={testID} aria-label={label} activeStep={at} alternativeLabel component="ol">
      {list.map((s, i) => <Step key={s.id} component="li" completed={s.state ? s.state === 'done' : i < at} aria-current={i === at ? 'step' : undefined}>
        <StepLabel error={s.state === 'failed'}>{s.label}</StepLabel></Step>)}
    </MuiStepper>,
  );
}

/** How much of each limit or goal is used, as MUI LinearProgress bars. */
export function MaterialProgress({ testID, heading, items, unit, warnAt = 90 }: MetersProps) {
  return useThemed(
    <Stack data-testid={testID} component="section" aria-label={heading || undefined} spacing={2}>
      {heading ? <Typography component="h3" variant="h6">{heading}</Typography> : null}
      {items.map((o, i) => {
        const share = o.max ? (o.value / o.max) * 100 : 0;
        const color = share > 100 ? 'error' : share >= warnAt ? 'warning' : 'primary';
        const text = `${o.value.toLocaleString()} of ${o.max.toLocaleString()}${unit ? ' ' + unit : ''}`;
        return (
          <Stack key={o.id ?? i} spacing={0.5}>
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography component="span">{o.label}</Typography><Typography component="span" sx={{ color: 'text.secondary' }}>{text}</Typography></Stack>
            <LinearProgress variant="determinate" value={Math.min(share, 100)} color={color} aria-label={`${o.label}: ${text}`} />
            {share > 100 ? <Typography variant="caption" sx={{ color: 'error.main' }}>Over by {(o.value - o.max).toLocaleString()}{unit ? ' ' + unit : ''}</Typography> : null}
          </Stack>
        );
      })}
    </Stack>,
  );
}

/** A table as an MUI Table: sortable headers and single or multiple row selection. */
export function MaterialTable<R extends object>({ caption, rows, columns, keyField, selectionMode = 'none', selected = [], onSelectedChange, onSort, noData, testID }: DataTableProps<R>) {
  const [sort, setSort] = useState<{ field: string; dir: 'asc' | 'desc' } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) { return rows; }
    const f = sort.field as keyof R;
    return [...rows].sort((a, b) => { const x = a[f] as unknown as string | number, y = b[f] as unknown as string | number; return (x < y ? -1 : x > y ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1); });
  }, [rows, sort]);
  const by = (field: string) => {
    const dir = sort?.field === field && sort.dir === 'asc' ? 'desc' : 'asc';
    setSort({ field, dir });
    onSort?.(field, dir === 'asc' ? 'ascending' : 'descending');
  };
  const key = (r: R) => String(r[keyField]);
  const pick = (k: string) => onSelectedChange?.(selectionMode === 'single' ? [k] : selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k]);
  return useThemed(
    <TableContainer data-testid={testID}>
      <Table size="small">
        <caption>{caption}</caption>
        <TableHead><TableRow>
          {selectionMode !== 'none' ? <TableCell padding="checkbox"><span className="bx-visually-hidden">Select</span></TableCell> : null}
          {columns.map((c) => <TableCell key={c.field} align={c.align === 'end' ? 'right' : 'left'} sortDirection={sort?.field === c.field ? sort.dir : false}>
            {c.sortable ? <TableSortLabel active={sort?.field === c.field} direction={sort?.field === c.field ? sort.dir : 'asc'} onClick={() => by(c.field)}>{c.headerText}</TableSortLabel> : c.headerText}
          </TableCell>)}
        </TableRow></TableHead>
        <TableBody>
          {sorted.length ? sorted.map((r) => (
            <TableRow key={key(r)} hover selected={selected.includes(key(r))}>
              {selectionMode !== 'none' ? <TableCell padding="checkbox">{selectionMode === 'single'
                ? <Radio checked={selected.includes(key(r))} onChange={() => pick(key(r))} slotProps={{ input: { 'aria-label': `Select ${key(r)}` } }} />
                : <Checkbox checked={selected.includes(key(r))} onChange={() => pick(key(r))} slotProps={{ input: { 'aria-label': `Select ${key(r)}` } }} />}</TableCell> : null}
              {columns.map((c) => <TableCell key={c.field} align={c.align === 'end' ? 'right' : 'left'}>{c.render ? c.render(r) : String(r[c.field] ?? '')}</TableCell>)}
            </TableRow>
          )) : <TableRow><TableCell colSpan={columns.length + (selectionMode !== 'none' ? 1 : 0)}>{noData ?? 'Nothing to show.'}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </TableContainer>,
  );
}
