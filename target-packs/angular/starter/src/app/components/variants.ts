/*
 * Style variants of the feedback and status components (variants/v3.json): the root of each component gets
 * bx-<kind>--<variant>; 'default' is the look the component had before variants. The Material variants are drawn by
 * bx.css (React's use MUI). The thinking orb is thinking-orbs by Jakub Antalik (MIT, see the notice below).
 */
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, input } from '@angular/core';
import { MODE_DRAWS, resolvePreset } from 'thinking-orbs/engine';

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
export type OrbState = 'working' | 'searching' | 'solving' | 'listening' | 'connecting' | 'weaving' | 'composing' | 'breathing' | 'shaping';

/** A variant's class with its leading space, " bx-v-filled"; nothing for the default look. */
export const vx = (variant?: string) => (variant && variant !== 'default' ? ` bx-v-${variant}` : '');
/** The faces of the emoji rating, very poor to very good. */
export const FACES = ['😞', '🙁', '😐', '🙂', '😄'];
/** A ring's dash offset for a share (0 to 1) of a circle of radius r. */
export const ringOffset = (share: number, r: number) => Math.round(2 * Math.PI * r * (1 - Math.max(0, Math.min(1, share))) * 10) / 10;

/*
 * The thinking orb: thinking-orbs 0.3.1, MIT License, Copyright (c) 2026 Jakub Antalik.
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice
 * and this permission notice shall be included in all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
 */
/** Paints an orb on a canvas until the returned stop is called; reduced motion paints one still frame. */
export function paintOrb(canvas: HTMLCanvasElement, state: OrbState, px: 20 | 64): () => void {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(px * ratio);
  canvas.height = Math.round(px * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) { return () => undefined; }
  const { mode, speed, opts } = resolvePreset(state, px);
  const draw = MODE_DRAWS[mode];
  const dark = !!canvas.closest('.bx-dark');
  const frame = (t: number) => { ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, px, px); draw(ctx, px, t, dark, opts); };
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { frame(0.6); return () => undefined; }
  let raf = 0;
  const loop = () => { frame((performance.now() / 1000) * speed); raf = requestAnimationFrame(loop); };
  loop();
  return () => cancelAnimationFrame(raf);
}

/** A thinking orb for an AI assistant at work; hidden from screen readers (the spinner says its label). */
@Component({
  selector: 'bx-orb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas [class]="'bx-orb is-' + size()" aria-hidden="true"></canvas>`,
})
export class Orb {
  readonly state = input<OrbState>('working');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  private readonly host = inject(ElementRef<HTMLElement>);
  constructor() {
    let stop = () => undefined as void;
    effect(() => {
      const state = this.state();
      const px = this.size() === 'lg' ? 64 : 20;
      stop();
      queueMicrotask(() => { const c = (this.host.nativeElement as HTMLElement).querySelector('canvas'); stop(); if (c) { stop = paintOrb(c, state, px); } });
    });
    inject(DestroyRef).onDestroy(() => stop());
  }
}
