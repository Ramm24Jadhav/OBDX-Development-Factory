/*
 * Banking widget variants (variants/v4.json, the same in every pack): a variant property adds bx-<kind>--<variant> to
 * the widget's root; without one the widget keeps its default look.
 */

export type BillsVariant = 'list' | 'compact' | 'detailed' | 'card' | 'glass';
export type BalanceVariant = 'card' | 'compact' | 'hero' | 'glass';
export type PayeesVariant = 'list' | 'compact' | 'grid' | 'card';
export type CardTileVariant = 'classic' | 'minimal' | 'glass' | 'metal';
export type TxListVariant = 'list' | 'compact' | 'detailed' | 'card' | 'glass';
export type ReceiptVariant = 'card' | 'ticket' | 'minimal' | 'glass';
export type FormVariant = 'card' | 'flat' | 'sectioned' | 'glass';
export type CalcVariant = 'card' | 'compact' | 'split' | 'glass';
export type BiometricVariant = 'card' | 'inline' | 'sheet';
export type LocatorVariant = 'list' | 'compact' | 'card';
export type ChatVariant = 'bubbles' | 'compact' | 'flat' | 'glass';
export type PromptVariant = 'pill' | 'boxed' | 'glass';
export type AvatarVariant = 'circle' | 'rounded' | 'ring' | 'tonal';
export type BoardVariant = 'classic' | 'light' | 'compact';
export type SensitiveVariant = 'dots' | 'blur' | 'card';

/** A root's own classes, then bx-<kind>--<variant> when the screen sets a variant. */
export function withVariant(own: string, kind: string, variant?: string): string {
  return own + (variant ? ` bx-${kind}--${variant}` : '');
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
