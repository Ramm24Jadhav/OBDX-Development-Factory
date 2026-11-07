/*
 * Variants (variants.json) for React Native, which has no class cascade: a variant is a theme. The component's wrapper
 * gives everything below it the theme with t.variant set and a few settings changed (pill corners, glass, ripple, lift: the design's elevation),
 * and the shared parts (button, field box, segments, chips, choices, switch, slider, code cells, upload area) add the
 * variant's styles from PARTS below. An empty variant keeps the pack's own look. Styles come from the theme's tokens,
 * so dark mode and the bank's brand still apply.
 */
import { ComponentType } from 'react';

import { Theme, ThemeContext, useTheme } from './theme';
import { VARIANTS } from './variants-table';

export { VARIANTS };

/** What a part's style depends on. */
export interface PartState { on?: boolean; focused?: boolean; error?: string; disabled?: boolean; danger?: boolean; multiple?: boolean }
type Style = Record<string, unknown>;
type Parts = Partial<Record<'box' | 'text' | 'shell' | 'label' | 'body' | 'message' | 'control' | 'track' | 'fill' | 'thumb' | 'marker' | 'option' | 'chip'
  | 'row' | 'mark' | 'cells' | 'cell' | 'area', Style>>;
type Variant = (t: Theme, s: PartState) => Parts;

const glassFill = (t: Theme) => (t.glass ? t.glass.fill : 'rgba(255, 255, 255, 0.22)');
const glassRim = (t: Theme) => (t.glass ? t.glass.rim : 'rgba(255, 255, 255, 0.45)');
/** Text on a soft or clear button: the brand's text colour, the danger one for a destructive button. */
const ink = (t: Theme, s: PartState) => (s.danger ? t.color.dangerText : t.color.primaryText);
const line = (t: Theme, s: PartState) => (s.error ? t.color.danger : s.focused ? t.color.primary : t.lineStrong);

const FIELD: Record<string, Variant> = {
  material: (t, s) => ({ control: { backgroundColor: t.color.surface2, borderWidth: 0, borderBottomWidth: s.focused || s.error ? 2 : 1, borderBottomColor: line(t, s),
    borderRadius: 0, borderTopLeftRadius: 4, borderTopRightRadius: 4 } }),
  outlined: (t, s) => ({ control: { backgroundColor: 'transparent', borderWidth: s.focused || s.error ? 2 : 1, borderColor: line(t, s), borderRadius: 4 } }),
  underlined: (t, s) => ({ control: { backgroundColor: 'transparent', borderWidth: 0, borderBottomWidth: s.focused || s.error ? 2 : 1, borderBottomColor: line(t, s),
    borderRadius: 0, paddingHorizontal: 2 } }),
  // the label sits on the box's top border, as a floated label does
  floating: (t, s) => ({ label: { alignSelf: 'flex-start', marginLeft: 10, marginBottom: -9, paddingHorizontal: 4, zIndex: 1, fontSize: 12,
    color: s.focused ? t.color.primaryText : t.color.textMuted, backgroundColor: t.color.surface }, control: { borderRadius: 4, paddingTop: 4 } }),
  inline: () => ({ shell: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12 }, label: { width: 120, marginBottom: 0 }, body: { flex: 1 },
    message: { width: '100%', paddingLeft: 132 } }),
  pill: (t, s) => ({ control: { borderRadius: 999, borderWidth: s.focused || s.error ? 2 : 0, borderColor: line(t, s), backgroundColor: t.track,
    paddingHorizontal: 18 } }),
};

/** Each kind's variants: the parts they style. */
export const PARTS: Record<string, Record<string, Variant>> = {
  button: {
    material: () => ({ box: { borderRadius: 20, minHeight: 48, paddingHorizontal: 24 } }),
    tonal: (t, s) => ({ box: { backgroundColor: s.danger ? t.color.dangerSoft : t.color.primarySoft, borderWidth: 0 }, text: { color: ink(t, s) } }),
    outlined: (t, s) => ({ box: { backgroundColor: 'transparent', borderWidth: t.border, borderColor: s.danger ? t.color.danger : t.lineStrong }, text: { color: ink(t, s) } }),
    text: (t, s) => ({ box: { backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 12 }, text: { color: ink(t, s) } }),
    elevated: (t, s) => ({ box: { backgroundColor: t.color.surface, borderWidth: 0, ...t.elevation(2) }, text: { color: ink(t, s) } }),
    // a native gradient where the platform draws one (React Native 0.76+, new architecture); the brand colour otherwise
    gradient: (t, s) => ({ box: { backgroundColor: s.danger ? t.color.danger : t.color.primary, borderWidth: 0,
      experimental_backgroundImage: `linear-gradient(135deg, ${s.danger ? t.color.danger : t.color.primary}, ${s.danger ? t.color.dangerText : t.color.primaryActive})` },
    text: { color: t.color.onPrimary } }),
    glass: (t) => ({ box: { backgroundColor: glassFill(t), borderWidth: t.border, borderColor: glassRim(t) }, text: { color: t.color.text } }),
    pill: () => ({ box: { borderRadius: 999 } }),
  },
  iconbtn: {
    material: () => ({ box: { borderRadius: 999, backgroundColor: 'transparent', borderWidth: 0 } }),
    filled: (t) => ({ box: { borderRadius: 999, backgroundColor: t.color.primary, borderWidth: 0 }, text: { color: t.color.onPrimary } }),
    tonal: (t) => ({ box: { borderRadius: 999, backgroundColor: t.color.primarySoft, borderWidth: 0 }, text: { color: t.color.primaryText } }),
    outlined: (t) => ({ box: { borderRadius: 999, backgroundColor: 'transparent', borderWidth: t.border, borderColor: t.lineStrong } }),
    circular: (t) => ({ box: { borderRadius: 999, backgroundColor: t.track, borderWidth: 0 }, text: { color: t.color.text } }),
    square: (t) => ({ box: { borderRadius: 4, backgroundColor: 'transparent', borderWidth: t.border, borderColor: t.line } }),
  },
  text: FIELD, textarea: FIELD, password: FIELD, number: FIELD, date: FIELD, daterange: FIELD, select: FIELD,
  chips: {
    material: (t, s) => ({ chip: { borderRadius: 8, backgroundColor: s.on ? t.color.primarySoft : 'transparent' } }),
    outlined: (t, s) => ({ chip: { backgroundColor: s.on ? t.color.primary : 'transparent', borderColor: s.on ? t.color.primary : t.lineStrong },
      text: { color: s.on ? t.color.onPrimary : t.color.textBody } }),
    tonal: (t, s) => ({ chip: { borderWidth: 0, backgroundColor: s.on ? t.color.primarySoft : t.color.surface2 } }),
    square: () => ({ chip: { borderRadius: 4 } }),
    glass: (t, s) => ({ chip: { backgroundColor: s.on ? glassRim(t) : glassFill(t), borderColor: glassRim(t) }, text: { color: t.color.text } }),
  },
  check: {
    material: (_t, s) => ({ row: { borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 4 }, mark: { borderRadius: s.multiple ? 2 : 10, borderWidth: 2 } }),
    cards: (t, s) => ({ row: { borderRadius: t.radius.card, paddingVertical: 14, borderWidth: s.on ? 2 : 1, ...(s.on ? t.elevation(2) : {}) } }),
    chips: () => ({ row: { borderRadius: 999, alignSelf: 'flex-start' } }),
    rows: (t) => ({ row: { borderWidth: 0, borderBottomWidth: 1, borderColor: t.line, borderRadius: 0, backgroundColor: 'transparent',
      flexDirection: 'row-reverse', justifyContent: 'space-between' } }),
    round: () => ({ mark: { borderRadius: 10 } }),
  },
  choice: {} as Record<string, Variant>,
  switch: {
    material: (t, s) => ({ track: { height: 32, borderRadius: 16, borderWidth: s.on ? 0 : 2, borderColor: t.lineStrong,
      backgroundColor: s.on ? t.color.primary : t.track }, thumb: { backgroundColor: s.on ? t.color.onPrimary : t.lineStrong } }),
    // the platform's green, as iOS settings show it
    ios: (t, s) => ({ track: { backgroundColor: s.on ? '#34c759' : t.track }, thumb: { ...t.elevation(2) } }),
    fluent: (t, s) => ({ track: { borderWidth: t.border, borderColor: s.on ? t.color.primary : t.color.textMuted, backgroundColor: s.on ? t.color.primary : 'transparent' },
      thumb: { backgroundColor: s.on ? t.color.onPrimary : t.color.textMuted } }),
    labelled: (t, s) => ({ track: { width: 64, backgroundColor: s.on ? t.color.primary : t.track } }),
    squish: (t, s) => ({ track: { borderRadius: 10, backgroundColor: s.on ? t.color.primary : t.lineStrong }, thumb: { borderRadius: 8 } }),
  },
  slider: {
    material: (t) => ({ track: { height: 4, borderRadius: 2 }, fill: { height: 4, borderRadius: 2 },
      thumb: { width: 20, height: 20, borderRadius: 10, top: -8, marginLeft: -10, borderWidth: 0, backgroundColor: t.color.primary } }),
    ticks: () => ({}),
    bubble: () => ({}),
    thick: () => ({ track: { height: 24, borderRadius: 12 }, fill: { height: 24, borderRadius: 12 }, thumb: { display: 'none' } }),
  },
  code: {
    material: (_t, s) => ({ cell: { borderRadius: 4, borderWidth: s.focused ? 2 : 1 } }),
    underline: (_t, s) => ({ cell: { borderWidth: 0, borderBottomWidth: s.focused ? 2 : 1.5, borderRadius: 0, backgroundColor: 'transparent' } }),
    rounded: (t, s) => ({ cell: { borderWidth: s.focused ? 2 : 0, borderRadius: 14, backgroundColor: t.track } }),
    joined: () => ({ cells: { gap: 0 }, cell: { borderRadius: 0, marginLeft: -1 } }),
  },
  segmented: {
    material: (t) => ({ track: { padding: 0, backgroundColor: 'transparent', borderWidth: t.border, borderColor: t.lineStrong, borderRadius: 999, overflow: 'hidden' },
      marker: { borderRadius: 0, backgroundColor: t.color.primarySoft }, option: { borderRadius: 0 } }),
    ios: (t) => ({ track: { borderRadius: 9, backgroundColor: t.track }, marker: { borderRadius: 7, ...t.elevation(2) }, option: { borderRadius: 7 } }),
    underline: (t) => ({ track: { padding: 0, backgroundColor: 'transparent', borderBottomWidth: 1, borderColor: t.line, borderRadius: 0 },
      marker: { backgroundColor: 'transparent', borderBottomWidth: 2, borderColor: t.color.primary, borderRadius: 0 } }),
    enclosed: (t) => ({ track: { padding: 0, backgroundColor: t.color.surface, borderWidth: t.border, borderColor: t.lineStrong, borderRadius: 4 },
      marker: { backgroundColor: t.color.primarySoft, borderRadius: 0 } }),
    pill: (t, s) => ({ track: { borderRadius: 999, backgroundColor: t.color.primarySoft }, marker: { borderRadius: 999, backgroundColor: t.color.primary },
      text: s.on ? { color: t.color.onPrimary } : {} }),
  },
  upload: {
    material: (t) => ({ area: { borderStyle: 'solid', borderWidth: 0, backgroundColor: t.color.primarySoft, borderRadius: 20, minHeight: t.minTouch } }),
    dropzone: (t) => ({ area: { minHeight: t.minTouch + 72, borderWidth: 2, borderRadius: t.radius.card, backgroundColor: t.color.surface2 } }),
    compact: (t) => ({ area: { minHeight: t.minTouch, borderStyle: 'solid', borderWidth: t.border } }),
    card: (t) => ({ area: { borderStyle: 'solid', borderWidth: t.border, borderColor: t.line, borderRadius: t.radius.card, backgroundColor: t.color.surface, ...t.elevation(2) } }),
  },
};
PARTS.choice = { material: PARTS.check.material, cards: PARTS.check.cards, chips: PARTS.check.chips, rows: PARTS.check.rows };

/** Theme settings a variant changes for everything inside the component (the parts above do the rest). */
function tune(t: Theme, kind: string, id: string): Theme {
  const out: Theme = { ...t, variant: { kind, id } };
  if (id === 'material') { out.motion = { ...t.motion, click: 'ripple' }; }
  if (id === 'pill') { out.radius = { ...t.radius, control: 999 }; }
  if (id === 'square') { out.radius = { ...t.radius, control: 4 }; }
  if (id === 'elevated' || id === 'cards' || id === 'card') { out.shadow = true; }
  return out;
}

/** The styles of one part for the variant the theme carries, when the part serves one of these kinds; {} otherwise. */
export function part(t: Theme, kinds: string | readonly string[], name: keyof Parts, state: PartState = {}): Style {
  const v = t.variant;
  if (!v || !(typeof kinds === 'string' ? kinds === v.kind : kinds.includes(v.kind))) { return {}; }
  return PARTS[v.kind]?.[v.id]?.(t, state)[name] ?? {};
}

/** The variant the theme carries for these kinds, or ''. */
export function variantOf(t: Theme, kinds: string | readonly string[]): string {
  const v = t.variant;
  return v && (typeof kinds === 'string' ? kinds === v.kind : kinds.includes(v.kind)) ? v.id : '';
}

/** The kinds whose variants style a field's box and label. */
export const FIELD_KINDS = ['text', 'textarea', 'password', 'number', 'date', 'daterange', 'select'] as const;

/** The component with a variant property (see above). */
export function withVariant<P extends object>(name: string, Base: ComponentType<P>) {
  const entry = VARIANTS[name];
  function Variant({ variant, ...props }: P & { variant?: string }) {
    const t = useTheme();
    const on = entry && variant && entry[1].includes(variant);
    const inner = <Base {...(props as P)} />;
    return on ? <ThemeContext.Provider value={tune(t, entry[0], variant)}>{inner}</ThemeContext.Provider> : inner;
  }
  Variant.displayName = name;
  return Variant;
}
