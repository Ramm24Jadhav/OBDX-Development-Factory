/*
 * Style variants of the containers and navigation (wave V2, variants.json): the ids each kind takes. A component with
 * no variant (or default) keeps its own look; another adds bx-v-<id> to its root, styled in bx.css. Part's variant input
 * takes them; the foundation components (card, tabs, dialog, data grid) type theirs with these.
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
