/*
 * The style variants of the containers and navigation (wave V2, target-packs/components/variants/v2.json), as React
 * Native styles: what the web packs' bx-<kind>--<variant> classes draw, from the theme's colours, radius and border, so
 * the designs and dark mode carry through. A component adds variantStyle(t, kind, variant) after its own style on the
 * part the web class styles (its surface; each tile or card for tiles and cards). No variant keeps the component's look.
 */
import { StyleSheet, ViewStyle } from 'react-native';

import { Theme } from './theme';

export type CardVariant = 'default' | 'elevated' | 'filled' | 'outlined' | 'glass' | 'gradient' | 'lift';
export type CardsVariant = 'default' | 'elevated' | 'outlined' | 'glass' | 'fanned';
export type TilesVariant = 'default' | 'elevated' | 'filled' | 'outlined' | 'bento' | 'compact' | 'glass';
export type KvVariant = 'default' | 'list' | 'columns' | 'cards' | 'compact' | 'receipt';
export type TabsVariant = 'default' | 'underline' | 'scrollable' | 'pill' | 'enclosed' | 'segmented' | 'vertical';
export type AccordionVariant = 'default' | 'separated' | 'flush' | 'contained' | 'icon-start';
export type NavVariant = 'default' | 'drawer' | 'rail' | 'bottom' | 'pill' | 'dock';
export type MenuVariant = 'default' | 'list' | 'dense' | 'glass' | 'sheet';
export type DialogVariant = 'default' | 'basic' | 'alert' | 'sheet' | 'side' | 'fullscreen';
export type PagesVariant = 'default' | 'rounded' | 'outlined' | 'compact' | 'pill';
export type GridVariant = 'default' | 'compact' | 'airy' | 'bordered' | 'masonry';
export type DividerVariant = 'default' | 'full' | 'inset' | 'middle' | 'dashed' | 'gradient';
export type ListVariant = 'default' | 'divided' | 'inset' | 'cards' | 'plain';
export type QuickVariant = 'default' | 'chips' | 'circles' | 'list' | 'glass';
export type TableVariant = 'default' | 'material' | 'striped' | 'dense' | 'cards' | 'sticky';

export type VariantKind = 'card' | 'cards' | 'tiles' | 'kv' | 'tabs' | 'accordion' | 'nav' | 'menu' | 'dialog' | 'pages' | 'grid' | 'divider' | 'list' | 'quick' | 'table';

/** A colour from the tokens (#rrggbb) at an opacity. */
function alpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) { return hex; }
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const flat: ViewStyle = { shadowOpacity: 0, elevation: 0 };

/** Every variant's style, by kind, from the theme's shared settings (so the nine designs reach it); each is non-empty so a test can find it. */
function table(t: Theme): Record<VariantKind, Record<string, ViewStyle>> {
  const c = t.color;
  const edge: ViewStyle = { borderWidth: t.border, borderColor: t.lineStrong };
  // a translucent fill and a light rim; Liquid glass's own fill when the design is Liquid glass
  const glass: ViewStyle = { backgroundColor: t.glass ? t.glass.fill : alpha(c.surface, 0.62), borderColor: t.glass ? t.glass.rim : alpha(c.border, 0.5), borderWidth: t.border, overflow: 'hidden' };
  const surface = {
    elevated: { backgroundColor: t.raised, borderWidth: 0, ...t.elevation(2) },
    filled: { backgroundColor: c.surface2, borderWidth: 0, ...flat },
    outlined: { backgroundColor: t.card, ...edge, ...flat },
    glass,
  };
  return {
    // shortcut: React Native has no gradient border without a gradient library, so gradient is a brand-coloured border; upgrade with expo-linear-gradient if the app has it
    card: { ...surface, gradient: { borderWidth: Math.max(2, t.border), borderColor: c.primary }, lift: { borderWidth: 0, ...t.elevation(3) } },
    cards: { elevated: surface.elevated, outlined: surface.outlined, glass, fanned: { transform: [{ rotate: '-2deg' }] } },
    tiles: { ...surface, bento: { minHeight: 96, borderRadius: t.radius.overlay }, compact: { padding: t.pad - 4, gap: 2 } },
    kv: {
      list: { backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0, ...flat }, columns: { paddingHorizontal: t.padCard + 2 },
      cards: { backgroundColor: c.surface2, borderWidth: 0, ...flat }, compact: { padding: t.pad - 4, gap: 6 },
      receipt: { borderStyle: 'dashed', ...edge, ...flat },
    },
    tabs: {
      underline: { borderBottomWidth: t.border, borderColor: t.line, backgroundColor: 'transparent', borderRadius: 0 }, scrollable: { flexWrap: 'nowrap' },
      pill: { gap: 6, backgroundColor: 'transparent' }, enclosed: { ...edge, borderRadius: t.radius.control, backgroundColor: t.card },
      segmented: { backgroundColor: t.track, borderRadius: t.radius.control, padding: 3 }, vertical: { flexDirection: 'column', alignItems: 'stretch' },
    },
    accordion: {
      separated: { gap: 8, backgroundColor: 'transparent', borderWidth: 0, ...flat }, flush: { backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0, ...flat },
      contained: { ...edge, ...flat }, 'icon-start': { paddingLeft: t.pad - 6 },
    },
    nav: {
      drawer: { backgroundColor: t.card, borderRadius: t.radius.card, padding: 8 }, rail: { width: 88, alignItems: 'center' },
      bottom: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: t.border, borderColor: t.line, backgroundColor: t.raised },
      pill: { flexDirection: 'row', gap: 6, backgroundColor: c.surface2, borderRadius: 999, padding: 4 },
      dock: { ...glass, flexDirection: 'row', alignSelf: 'center', borderRadius: t.radius.overlay, padding: 8, ...t.elevation(3) },
    },
    menu: { list: { borderRadius: t.radius.small, ...t.elevation(2) }, dense: { paddingVertical: 2 }, glass, sheet: { borderTopLeftRadius: t.radius.overlay, borderTopRightRadius: t.radius.overlay } },
    dialog: {
      basic: { borderRadius: t.radius.overlay + 8 }, alert: { borderRadius: t.radius.card, maxWidth: 320, alignSelf: 'center' },
      sheet: { borderTopLeftRadius: t.radius.overlay, borderTopRightRadius: t.radius.overlay }, side: { maxWidth: 400, alignSelf: 'flex-end' }, fullscreen: { borderRadius: 0, flexGrow: 1 },
    },
    pages: { rounded: { gap: 4 }, outlined: { gap: 6 }, compact: { justifyContent: 'space-between' }, pill: { backgroundColor: t.track, borderRadius: 999, paddingHorizontal: 6 } },
    grid: { compact: { rowGap: 6 }, airy: { rowGap: 24 }, bordered: { borderWidth: StyleSheet.hairlineWidth, borderColor: t.line }, masonry: { alignItems: 'flex-start' } },
    divider: { full: { marginHorizontal: 0 }, inset: { marginLeft: 16 }, middle: { marginHorizontal: 16 }, dashed: { borderStyle: 'dashed' },
      // shortcut: no gradient without a gradient library, so the line is shorter and centred; upgrade with expo-linear-gradient
      gradient: { marginHorizontal: '15%' } },
    list: {
      divided: { gap: 0 }, inset: { marginHorizontal: 16, borderRadius: t.radius.card, backgroundColor: t.card, overflow: 'hidden' },
      cards: { gap: 8 }, plain: { gap: 2 },
    },
    quick: { chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, circles: { gap: 14 }, list: { flexDirection: 'column' }, glass },
    table: { material: { borderRadius: t.radius.small, ...t.elevation(1) }, striped: { backgroundColor: c.surface2 }, dense: { padding: 8, gap: 2 }, cards: { borderRadius: t.radius.overlay },
      sticky: { borderTopWidth: Math.max(2, t.border), borderColor: t.line } },
  };
}

/** The variant's style for a kind, or undefined when there is no variant (or it is not one of the kind's). */
export function variantStyle(t: Theme, kind: VariantKind, variant?: string): ViewStyle | undefined {
  return variant && variant !== 'default' ? table(t)[kind][variant] : undefined;
}

/** The variants of each kind, as the pack draws them (the same ids as variants/v2.json). */
export const VARIANTS: Readonly<Record<VariantKind, ReadonlyArray<string>>> = Object.fromEntries(
  (Object.entries(table({ color: {}, radius: { control: 0, card: 0, small: 0, overlay: 0 }, glass: null, border: 1, pad: 0, padCard: 0, elevation: () => ({}) } as unknown as Theme)) as Array<[VariantKind, object]>).map(([k, v]) => [k, Object.keys(v)]),
) as unknown as Record<VariantKind, ReadonlyArray<string>>;
