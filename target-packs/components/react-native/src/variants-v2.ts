/*
 * The style variants of the containers and navigation (wave V2, target-packs/components/variants/v2.json), as React
 * Native styles: what the web packs' bx-<kind>--<variant> classes draw, from the theme's colours, radius and border, so
 * the designs and dark mode carry through. A component adds variantStyle(t, kind, variant) after its own style on the
 * part the web class styles (its surface; each tile or card for tiles and cards). No variant keeps the component's look.
 */
import { StyleSheet, ViewStyle } from 'react-native';

import { Theme } from './theme';

export type CardVariant = 'elevated' | 'filled' | 'outlined' | 'glass' | 'gradient' | 'lift';
export type CardsVariant = 'elevated' | 'outlined' | 'glass' | 'fanned';
export type TilesVariant = 'elevated' | 'filled' | 'outlined' | 'bento' | 'compact' | 'glass';
export type KvVariant = 'list' | 'columns' | 'cards' | 'compact' | 'receipt';
export type TabsVariant = 'underline' | 'scrollable' | 'pill' | 'enclosed' | 'segmented' | 'vertical';
export type AccordionVariant = 'separated' | 'flush' | 'contained' | 'icon-start';
export type NavVariant = 'drawer' | 'rail' | 'bottom' | 'pill' | 'dock';
export type MenuVariant = 'list' | 'dense' | 'glass' | 'sheet';
export type DialogVariant = 'basic' | 'alert' | 'sheet' | 'side' | 'fullscreen';
export type PagesVariant = 'rounded' | 'outlined' | 'compact' | 'pill';
export type GridVariant = 'compact' | 'airy' | 'bordered' | 'masonry';
export type DividerVariant = 'full' | 'inset' | 'middle' | 'dashed' | 'gradient';
export type ListVariant = 'divided' | 'inset' | 'cards' | 'plain';
export type QuickVariant = 'chips' | 'circles' | 'list' | 'glass';
export type TableVariant = 'material' | 'striped' | 'dense' | 'cards' | 'sticky';

export type VariantKind = 'card' | 'cards' | 'tiles' | 'kv' | 'tabs' | 'accordion' | 'nav' | 'menu' | 'dialog' | 'pages' | 'grid' | 'divider' | 'list' | 'quick' | 'table';

/** A colour from the tokens (#rrggbb) at an opacity. */
function alpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) { return hex; }
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const shadow = (level: 1 | 2 | 3): ViewStyle => ({
  shadowColor: '#0f172a', shadowOpacity: [0, 0.08, 0.12, 0.18][level], shadowRadius: [0, 6, 14, 24][level], shadowOffset: { width: 0, height: [0, 2, 4, 10][level] },
  elevation: level * 2,
});
const flat: ViewStyle = { shadowOpacity: 0, elevation: 0 };

/** Every variant's style, by kind; each is non-empty so a test can find it on the component. */
function table(t: Theme): Record<VariantKind, Record<string, ViewStyle>> {
  const c = t.color;
  // a translucent fill and a light rim; Liquid glass's own fill when the design is Liquid glass
  const glass: ViewStyle = { backgroundColor: t.glass ? t.glass.fill : alpha(c.surface, 0.62), borderColor: t.glass ? t.glass.rim : alpha(c.border, 0.5), borderWidth: 1, overflow: 'hidden' };
  const surface = {
    elevated: { backgroundColor: c.surface, borderWidth: 0, ...shadow(2) },
    filled: { backgroundColor: c.surface2, borderWidth: 0, ...flat },
    outlined: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, ...flat },
    glass,
  };
  return {
    // shortcut: React Native has no gradient border without a gradient library, so gradient is a brand-coloured border; upgrade with expo-linear-gradient if the app has it
    card: { ...surface, gradient: { borderWidth: 2, borderColor: c.primary }, lift: { borderWidth: 0, ...shadow(3) } },
    cards: { elevated: surface.elevated, outlined: surface.outlined, glass, fanned: { transform: [{ rotate: '-2deg' }] } },
    tiles: { ...surface, bento: { minHeight: 96, borderRadius: t.radius.card + 6 }, compact: { padding: 10, gap: 2 } },
    kv: {
      list: { backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0, ...flat }, columns: { paddingHorizontal: 20 },
      cards: { backgroundColor: c.surface2, borderWidth: 0, ...flat }, compact: { padding: 10, gap: 6 },
      receipt: { borderStyle: 'dashed', borderWidth: 1, borderColor: c.borderStrong, ...flat },
    },
    tabs: {
      underline: { borderBottomWidth: 1, borderColor: c.border, backgroundColor: 'transparent' }, scrollable: { flexWrap: 'nowrap' },
      pill: { gap: 6, backgroundColor: 'transparent' }, enclosed: { borderWidth: 1, borderColor: c.border, borderRadius: t.radius.control },
      segmented: { backgroundColor: c.surface2, borderRadius: t.radius.control, padding: 3 }, vertical: { flexDirection: 'column', alignItems: 'stretch' },
    },
    accordion: {
      separated: { gap: 8, backgroundColor: 'transparent', borderWidth: 0, ...flat }, flush: { backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0, ...flat },
      contained: { borderWidth: 1, borderColor: c.border, ...flat }, 'icon-start': { paddingLeft: 8 },
    },
    nav: {
      drawer: { backgroundColor: c.surface, borderRadius: t.radius.card, padding: 8 }, rail: { width: 88, alignItems: 'center' },
      bottom: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderColor: c.border, backgroundColor: c.surface },
      pill: { flexDirection: 'row', gap: 6, backgroundColor: c.surface2, borderRadius: 999, padding: 4 },
      dock: { ...glass, flexDirection: 'row', alignSelf: 'center', borderRadius: 24, padding: 8, ...shadow(3) },
    },
    menu: { list: { borderRadius: 8, ...shadow(2) }, dense: { paddingVertical: 2 }, glass, sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20 } },
    dialog: {
      basic: { borderRadius: 28 }, alert: { borderRadius: 14, maxWidth: 320, alignSelf: 'center' }, sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20 },
      side: { maxWidth: 400, alignSelf: 'flex-end' }, fullscreen: { borderRadius: 0, flexGrow: 1 },
    },
    pages: { rounded: { gap: 4 }, outlined: { gap: 6 }, compact: { justifyContent: 'space-between' }, pill: { backgroundColor: c.surface2, borderRadius: 999, paddingHorizontal: 6 } },
    grid: { compact: { rowGap: 6 }, airy: { rowGap: 24 }, bordered: { borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }, masonry: { alignItems: 'flex-start' } },
    divider: { full: { marginHorizontal: 0 }, inset: { marginLeft: 16 }, middle: { marginHorizontal: 16 }, dashed: { borderStyle: 'dashed' }, gradient: { opacity: 0.6 } },
    list: {
      divided: { gap: 0 }, inset: { marginHorizontal: 16, borderRadius: t.radius.card, backgroundColor: c.surface, overflow: 'hidden' },
      cards: { gap: 8 }, plain: { gap: 2 },
    },
    quick: { chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, circles: { gap: 14 }, list: { flexDirection: 'column' }, glass },
    table: { material: { borderRadius: 4, ...shadow(1) }, striped: { backgroundColor: c.surface2 }, dense: { padding: 8, gap: 2 }, cards: { borderRadius: t.radius.card + 4 }, sticky: { borderTopWidth: 2, borderColor: c.border } },
  };
}

/** The variant's style for a kind, or undefined when there is no variant (or it is not one of the kind's). */
export function variantStyle(t: Theme, kind: VariantKind, variant?: string): ViewStyle | undefined {
  return variant ? table(t)[kind][variant] : undefined;
}

/** The variants of each kind, as the pack draws them (the same ids as variants/v2.json). */
export const VARIANTS: Readonly<Record<VariantKind, ReadonlyArray<string>>> = Object.fromEntries(
  (Object.entries(table({ color: {}, radius: { control: 0, card: 0 }, glass: null } as unknown as Theme)) as Array<[VariantKind, object]>).map(([k, v]) => [k, Object.keys(v)]),
) as unknown as Record<VariantKind, ReadonlyArray<string>>;
