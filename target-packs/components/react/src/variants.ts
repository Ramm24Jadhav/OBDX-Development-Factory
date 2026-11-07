/*
 * Style variants of the feedback and status components (variants.json, wave V3): a variant adds bx-v-<id> to the
 * component's root; 'default' is the look the component had before variants and adds nothing.
 */
export type AlertVariant = 'default' | 'filled' | 'outlined' | 'banner';
export type ToastVariant = 'default' | 'snackbar' | 'stacked' | 'pill';
export type TooltipVariant = 'default' | 'plain' | 'rich' | 'beak';
export type BadgeVariant = 'default' | 'filled' | 'outlined' | 'dot';
export type SpinnerVariant = 'default' | 'material' | 'dots' | 'orbs';
export type SkeletonVariant = 'default' | 'pulse' | 'soft';
export type EmptyVariant = 'default' | 'illustrated' | 'compact' | 'card';
export type ProgressVariant = 'default' | 'linear' | 'ring' | 'segmented';
export type GaugeVariant = 'default' | 'ring' | 'thin';
export type StepperVariant = 'default' | 'material' | 'vertical' | 'segmented';
export type TimelineVariant = 'default' | 'compact' | 'cards' | 'horizontal';
export type StatusVariant = 'default' | 'filled' | 'soft';
export type TimeoutVariant = 'default' | 'countdown' | 'sheet';
export type ChartVariant = 'default' | 'rounded' | 'lollipop' | 'meter';
export type RatingVariant = 'default' | 'emoji' | 'numbers';
/** The nine states of a thinking orb (thinking-orbs, MIT). */
export type OrbState = 'working' | 'searching' | 'solving' | 'listening' | 'connecting' | 'weaving' | 'composing' | 'breathing' | 'shaping';

/** A variant's class with its leading space, " bx-v-filled"; nothing for the default look. */
export const vx = (variant?: string) => (variant && variant !== 'default' ? ` bx-v-${variant}` : '');

/** Severity and tone to the MUI colour names. */
export const MUI_SEVERITY = { error: 'error', warning: 'warning', confirmation: 'success', info: 'info' } as const;
export const MUI_TONE = { neutral: 'default', info: 'info', success: 'success', warning: 'warning', danger: 'error' } as const;
/** The faces of the emoji rating, very poor to very good. */
export const FACES = ['😞', '🙁', '😐', '🙂', '😄'];
