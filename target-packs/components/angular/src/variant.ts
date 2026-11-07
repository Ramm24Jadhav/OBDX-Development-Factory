/*
 * Banking widget variants (variants.json, the same in every pack): a variant property adds bx-v-<variant> to the
 * widget's root; without one the widget keeps its default look.
 */

export type BillsVariant = 'default' | 'compact' | 'detailed' | 'card' | 'glass';
export type BalanceVariant = 'default' | 'compact' | 'hero' | 'glass';
export type PayeesVariant = 'default' | 'compact' | 'grid' | 'card';
export type CardTileVariant = 'default' | 'minimal' | 'glass' | 'metal';
export type TxListVariant = 'default' | 'compact' | 'detailed' | 'card' | 'glass';
export type ReceiptVariant = 'default' | 'ticket' | 'flat' | 'glass';
export type FormVariant = 'default' | 'flat' | 'sectioned' | 'glass';
export type CalcVariant = 'default' | 'compact' | 'split' | 'glass';
export type BiometricVariant = 'default' | 'inline' | 'sheet';
export type LocatorVariant = 'default' | 'compact' | 'card';
export type ChatVariant = 'default' | 'compact' | 'flat' | 'glass';
export type PromptVariant = 'default' | 'boxed' | 'glass';
export type AvatarVariant = 'default' | 'rounded' | 'ring' | 'tonal';
export type BoardVariant = 'default' | 'light' | 'compact';
export type SensitiveVariant = 'default' | 'blur' | 'card';

/** A root's own classes, then bx-v-<variant> when the screen sets a variant other than the default. */
export function withVariant(own: string, variant?: string): string {
  return own + (variant && variant !== 'default' ? ` bx-v-${variant}` : '');
}

/** A hue from a name (0 to 359), the same in every pack, for the tonal avatar. */
export function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) { h = (h * 31 + name.charCodeAt(i)) % 360; }
  return h;
}

/** The skeleton a list widget shows while the screen fetches its items (loading). */
export const LOADING = `<div class="bx-skeleton is-text" role="status" aria-busy="true"><span class="bx-visually-hidden">Loading</span><span class="bx-skel-line" aria-hidden="true"></span>`
  + `<span class="bx-skel-line" aria-hidden="true"></span><span class="bx-skel-line is-short" aria-hidden="true"></span></div>`;
