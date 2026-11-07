/*
 * Style variants of the containers and navigation (wave V2, target-packs/components/variants/v2.json). A component
 * with no variant keeps its own look; a variant adds bx-<kind>--<id> to its root, styled in bx.css. The Material 3
 * variants (MATERIAL) render with @mui/material core in this pack.
 */
export type CardVariant = 'default' | 'elevated' | 'filled' | 'outlined' | 'glass' | 'gradient' | 'lift';
export type CardsVariant = 'default' | 'elevated' | 'outlined' | 'glass' | 'fanned';
export type TilesVariant = 'default' | 'elevated' | 'filled' | 'outlined' | 'bento' | 'compact' | 'glass';
export type KvVariant = 'default' | 'list' | 'columns' | 'cards' | 'compact' | 'receipt';
export type TabsVariant = 'default' | 'underline' | 'scrollable' | 'pill' | 'enclosed' | 'segmented' | 'vertical';
export type AccordionVariant = 'default' | 'separated' | 'flush' | 'contained' | 'icon-start';
export type NavVariant = 'default' | 'drawer' | 'rail' | 'bottom' | 'pill' | 'dock';
export type MenuVariant = 'default' | 'list' | 'dense' | 'glass' | 'sheet';
export type DialogVariant = 'default' | 'basic' | 'alert' | 'sheet' | 'side' | 'fullscreen';
export type CrumbsVariant = 'default' | 'chevron' | 'slash' | 'pill' | 'collapsed';
export type PagesVariant = 'default' | 'rounded' | 'outlined' | 'compact' | 'pill';
export type GridVariant = 'default' | 'compact' | 'airy' | 'bordered' | 'masonry';
export type DividerVariant = 'default' | 'full' | 'inset' | 'middle' | 'dashed' | 'gradient';
export type ListVariant = 'default' | 'divided' | 'inset' | 'cards' | 'plain';
export type QuickVariant = 'default' | 'chips' | 'circles' | 'list' | 'glass';
export type TableVariant = 'default' | 'material' | 'striped' | 'dense' | 'cards' | 'sticky';

/** The variants drawn with @mui/material, per kind. */
export const MATERIAL: Readonly<Record<string, ReadonlyArray<string>>> = {
  card: ['elevated', 'filled', 'outlined'], cards: ['elevated'], tiles: ['elevated', 'filled'], kv: ['list'], tabs: ['underline', 'scrollable'],
  accordion: ['separated'], nav: ['drawer'], menu: ['list'], dialog: ['basic'], crumbs: ['chevron'], pages: ['rounded', 'outlined'],
  divider: ['full', 'inset', 'middle'], list: ['divided'], quick: ['chips'], table: ['material'],
};

/** True when this kind's variant is drawn with @mui/material. */
export const isMaterial = (kind: string, variant?: string) => !!variant && (MATERIAL[kind] ?? []).includes(variant);

/** The variant's class (bx-v-<id>), with a leading space, or '' for none and default. The kind names whose variant it is. */
export const vc = (_kind: string, variant?: string) => (variant && variant !== 'default' ? ` bx-v-${variant}` : '');

/** Breadcrumb items to show: collapsed keeps the first and the last two, with null for the gap. */
export function collapse<T>(items: ReadonlyArray<T>, open: boolean): Array<T | null> {
  return open || items.length <= 3 ? [...items] : [items[0], null, ...items.slice(-2)];
}
