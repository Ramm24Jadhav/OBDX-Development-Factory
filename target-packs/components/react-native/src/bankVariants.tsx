/*
 * The banking widgets' variants (variants.json, the same ids as the web packs' bx-v-<variant> classes): a
 * widget's variant prop picks a theme for its surface, a style for its root and one for its rows. Without a variant the
 * widget keeps its own look. The list widgets also take loading: skeleton lines in place of their rows.
 */
import { View, ViewStyle } from 'react-native';

import { Theme } from './theme';

export type BillsVariant = 'default' | 'compact' | 'detailed' | 'card' | 'glass';
export type BalanceVariant = 'default' | 'compact' | 'hero' | 'glass';
export type PayeesVariant = 'default' | 'compact' | 'grid' | 'card';
export type CardTileVariant = 'default' | 'minimal' | 'glass' | 'metal';
export type TxListVariant = 'default' | 'compact' | 'detailed' | 'card' | 'glass';
export type ReceiptVariant = 'default' | 'ticket' | 'minimal' | 'glass';
export type FormVariant = 'default' | 'flat' | 'sectioned' | 'glass';
export type CalcVariant = 'default' | 'compact' | 'split' | 'glass';
export type BiometricVariant = 'default' | 'inline' | 'sheet';
export type LocatorVariant = 'default' | 'compact' | 'card';
export type ChatVariant = 'default' | 'compact' | 'flat' | 'glass';
export type PromptVariant = 'default' | 'boxed' | 'glass';
export type AvatarVariant = 'default' | 'rounded' | 'ring' | 'tonal';
export type BoardVariant = 'default' | 'light' | 'compact';
export type SensitiveVariant = 'default' | 'blur' | 'card';

/** What a list widget takes besides its own props. */
export interface ListVariantProps<V extends string> {
  variant?: V;
  /** Skeleton lines in place of the rows while the screen fetches them. */
  loading?: boolean;
}

export interface VariantLook {
  /** The theme for the widget's own text and surfaces (hero, glass and metal recolour it). */
  t: Theme;
  /** Added to the widget's root (its panel). */
  surface: ViewStyle;
  /** Added to each row, message or tile. */
  row: ViewStyle;
}

/** Kinds whose card variant makes each row a card (for the others card is their own default look). */
const LISTS = ['bills', 'payees', 'txlist', 'locator'];
const flat: ViewStyle = { backgroundColor: 'transparent', borderWidth: 0, shadowOpacity: 0, elevation: 0 };

/** The theme, root style and row style of a banking widget's variant. */
export function variantLook(base: Theme, kind: string, variant?: string): VariantLook {
  const c = base.color;
  const dark = c.onPrimary !== '#ffffff';
  // a surface of its own: the colours and the card setting panels read
  const recolour = (color: Partial<Theme['color']>): Theme => ({ ...base, card: color.surface ?? base.card, color: { ...c, ...color } });
  const glass = base.glass ? recolour({ surface: base.glass.fill }) : recolour({ surface: dark ? 'rgba(40, 40, 40, 0.62)' : 'rgba(255, 255, 255, 0.6)' });
  switch (variant) {
    case 'compact':
      return { t: base, surface: { padding: 10, gap: 6 }, row: { minHeight: base.minTouch, paddingVertical: 2 } };
    case 'detailed':
      return { t: base, surface: { padding: 20, gap: 14 }, row: { minHeight: base.minTouch + 24, paddingVertical: 8 } };
    case 'card':
      return LISTS.includes(kind)
        ? { t: base, surface: { ...flat, padding: 0, gap: 8 },
          row: { backgroundColor: base.card, borderRadius: base.radius.card, borderWidth: base.border, borderTopWidth: base.border, borderColor: base.line, paddingHorizontal: base.pad - 2, marginBottom: 8, ...base.elevation(1) } }
        : { t: base, surface: {}, row: {} };
    case 'glass':
      return { t: glass, surface: { backgroundColor: glass.card, borderColor: base.glass ? base.glass.rim : dark ? 'rgba(255, 255, 255, 0.13)' : 'rgba(255, 255, 255, 0.3)' }, row: {} };
    case 'hero': {
      const t = recolour({ surface: c.primary, text: c.onPrimary, textMuted: c.onPrimary, primaryText: c.onPrimary });
      return { t, surface: { backgroundColor: c.primary, borderColor: c.primary, padding: 24 }, row: {} };
    }
    case 'metal': {
      const t = recolour({ surface: '#1f2328', text: '#f4f6f8', textMuted: '#c9d1d9' });
      return { t, surface: { backgroundColor: '#1f2328', borderColor: '#3a4048' }, row: {} };
    }
    case 'minimal':
      return { t: base, surface: { ...flat, borderWidth: base.border, borderColor: base.lineStrong }, row: {} };
    case 'flat':
      return { t: base, surface: { ...flat, padding: 0 }, row: {} };
    case 'sectioned':
      return { t: base, surface: { gap: 20, borderTopWidth: 4, borderTopColor: c.primary }, row: {} };
    case 'split':
      return { t: base, surface: { borderLeftWidth: 6, borderLeftColor: c.primary }, row: {} };
    case 'grid':
      return { t: base, surface: { flexDirection: 'row', flexWrap: 'wrap' }, row: { width: '50%' } };
    case 'inline':
      return { t: base, surface: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', padding: 12, gap: 8 }, row: {} };
    case 'sheet':
      return { t: base, surface: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingTop: 28 }, row: {} };
    case 'ticket':
      return { t: base, surface: { borderStyle: 'dashed', borderWidth: Math.max(base.border, 1), borderColor: base.lineStrong, borderRadius: base.radius.small }, row: {} };
    case 'boxed':
      return { t: base, surface: { borderRadius: base.radius.control === 999 ? 16 : base.radius.control, minHeight: base.minTouch + 12 }, row: {} };
    case 'light':
      return { t: base, surface: { backgroundColor: base.card, borderWidth: base.border, borderColor: base.line }, row: {} };
    default:
      // the default variant of each kind (list, card, classic, bubbles, pill, circle, dots) is the widget's own look
      return { t: base, surface: {}, row: {} };
  }
}

/** A chat message in the flat or compact variant: no bubble, or a smaller one. */
export function messageLook(variant?: string): ViewStyle {
  return variant === 'flat' ? { backgroundColor: 'transparent', paddingHorizontal: 0, alignSelf: 'stretch' } : variant === 'compact' ? { paddingVertical: 4, paddingHorizontal: 8 } : {};
}

/** Skeleton lines while a list widget loads: one progress bar, busy, named Loading. */
export function LoadingLines({ testID, t }: { testID?: string; t: Theme }) {
  return (
    <View testID={testID} accessible accessibilityRole="progressbar" accessibilityLabel="Loading" accessibilityState={{ busy: true }} style={{ gap: 10, paddingVertical: 8 }}>
      {[100, 100, 60].map((w, i) => <View key={i} style={{ height: 14, borderRadius: 7, backgroundColor: t.color.surface3, width: `${w}%` }} />)}
    </View>
  );
}

/** A hue from a name (0 to 359), the same in every pack, for the tonal avatar. */
export function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) { h = (h * 31 + name.charCodeAt(i)) % 360; }
  return h;
}
