/*
 * Style variants of the feedback and status components (variants/v3.json): the root of each component gets
 * bx-<kind>--<variant>; 'standard' is the look the component had before variants.
 */
export type AlertVariant = 'standard' | 'filled' | 'outlined' | 'banner';
export type ToastVariant = 'standard' | 'snackbar' | 'stacked' | 'pill';
export type TooltipVariant = 'standard' | 'plain' | 'rich' | 'beak';
export type BadgeVariant = 'standard' | 'filled' | 'outlined' | 'dot';
export type SpinnerVariant = 'standard' | 'material' | 'dots' | 'orbs';
export type SkeletonVariant = 'standard' | 'pulse' | 'soft';
export type EmptyVariant = 'standard' | 'illustrated' | 'compact' | 'card';
export type ProgressVariant = 'standard' | 'linear' | 'ring' | 'segmented';
export type GaugeVariant = 'standard' | 'ring' | 'thin';
export type StepperVariant = 'standard' | 'material' | 'vertical' | 'segmented';
export type TimelineVariant = 'standard' | 'compact' | 'cards' | 'horizontal';
export type StatusVariant = 'standard' | 'filled' | 'soft';
export type TimeoutVariant = 'standard' | 'countdown' | 'sheet';
export type ChartVariant = 'standard' | 'rounded' | 'lollipop' | 'meter';
export type RatingVariant = 'standard' | 'emoji' | 'numbers';
/** The nine states of a thinking orb (thinking-orbs, MIT). */
export type OrbState = 'working' | 'searching' | 'solving' | 'listening' | 'connecting' | 'weaving' | 'composing' | 'breathing' | 'shaping';

/** The variant class of a kind: bx-alert--filled. */
export const vx = (kind: string, variant = 'standard') => `bx-${kind}--${variant}`;

/** Severity and tone to the MUI colour names. */
export const MUI_SEVERITY = { error: 'error', warning: 'warning', confirmation: 'success', info: 'info' } as const;
export const MUI_TONE = { neutral: 'default', info: 'info', success: 'success', warning: 'warning', danger: 'error' } as const;
/** The faces of the emoji rating, very poor to very good. */
export const FACES = ['😞', '🙁', '😐', '🙂', '😄'];
