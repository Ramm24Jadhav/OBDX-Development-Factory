/*
 * Style variants of the feedback and status components (variants/v3.json), the React Native side of the web packs'
 * bx-<kind>--<variant> classes: each look function turns the theme and a variant into styles, so the components keep
 * one structure and one behaviour. 'default' is the look a component had before variants. The thinking orb is
 * thinking-orbs by Jakub Antalik (MIT, notice below), its frames drawn as plain views.
 */
import { ReactNode, useEffect, useState } from 'react';
import { Animated, View, ViewStyle } from 'react-native';
import { MODE_FRAMES, resolvePreset } from 'thinking-orbs/engine';

import { useCycle, useReducedMotion } from './motion';
import { Theme } from './theme';

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

/** A tone's colours (toneColors in parts). */
export interface ToneColors { fg: string; bg: string; line: string }

/** True when the theme's surface is dark. */
export const isDark = (t: Theme) => { const h = t.color.surface.replace('#', ''); return h.length >= 6 && parseInt(h.slice(0, 2), 16) + parseInt(h.slice(2, 4), 16) + parseInt(h.slice(4, 6), 16) < 384; };

/** A message box: its frame, its heading colour and its body colour. Filled uses the tone's text colour as the fill, so white text keeps its contrast. */
export function alertLook(t: Theme, variant: AlertVariant = 'default', c: ToneColors): { box: ViewStyle; fg: string; body: string } {
  if (variant === 'filled') { return { box: { backgroundColor: c.fg, borderRadius: t.radius.control }, fg: t.color.surface, body: t.color.surface }; }
  if (variant === 'outlined') { return { box: { backgroundColor: t.color.surface, borderWidth: 1, borderColor: c.line, borderRadius: t.radius.control }, fg: c.fg, body: t.color.textBody }; }
  if (variant === 'banner') { return { box: { backgroundColor: c.bg, borderRadius: 0, borderTopWidth: 3, borderTopColor: c.line, paddingHorizontal: 16 }, fg: c.fg, body: t.color.textBody }; }
  return { box: { backgroundColor: c.bg, borderRadius: t.radius.card, borderLeftWidth: 4, borderLeftColor: c.line }, fg: c.fg, body: t.color.textBody };
}

/** A toast's card, and its text colours. The snackbar sits on the inverse surface. */
export function toastLook(t: Theme, variant: ToastVariant = 'default', line: string): { box: ViewStyle; fg: string; body: string } {
  const shadow = { shadowColor: '#0f172a', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 };
  if (variant === 'snackbar') { return { box: { backgroundColor: t.color.text, borderRadius: 4, ...shadow }, fg: t.color.surface, body: t.color.surface }; }
  if (variant === 'stacked') { return { box: { backgroundColor: t.color.surface, borderRadius: 16, borderWidth: 1, borderColor: t.color.border, ...shadow, shadowOpacity: 0.14 }, fg: t.color.text, body: t.color.textBody }; }
  if (variant === 'pill') { return { box: { backgroundColor: t.color.surface, borderRadius: 999, borderWidth: 1, borderColor: t.color.border, paddingHorizontal: 16, ...shadow }, fg: t.color.text, body: t.color.textBody }; }
  return { box: { backgroundColor: t.color.surface, borderRadius: 14, borderWidth: 1, borderColor: t.color.border, borderLeftWidth: 4, borderLeftColor: line, ...shadow }, fg: t.color.text, body: t.color.textBody };
}

/** A tooltip's bubble and text colour. */
export function tooltipLook(t: Theme, variant: TooltipVariant = 'default'): { bubble: ViewStyle; fg: string } {
  if (variant === 'plain') { return { bubble: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, backgroundColor: t.color.text }, fg: t.color.surface }; }
  if (variant === 'rich') {
    return { bubble: { padding: 14, borderRadius: 12, backgroundColor: t.color.surface2, borderWidth: 1, borderColor: t.color.border, shadowColor: '#0f172a', shadowOpacity: 0.12,
      shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 }, fg: t.color.text };
  }
  if (variant === 'beak') { return { bubble: { padding: 10, borderRadius: 6, backgroundColor: t.color.surface, borderWidth: 1, borderColor: t.color.borderStrong }, fg: t.color.text }; }
  return { bubble: { padding: 10, borderRadius: t.radius.control, backgroundColor: t.color.text }, fg: t.color.surface };
}

/** A status badge's box, whether it shows its dot, and its text colour. */
export function badgeLook(t: Theme, variant: BadgeVariant = 'default', c: ToneColors): { box: ViewStyle; dot: boolean; fg: string } {
  if (variant === 'filled') { return { box: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: c.fg }, dot: false, fg: t.color.surface }; }
  if (variant === 'outlined') { return { box: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: c.line }, dot: false, fg: c.fg }; }
  if (variant === 'dot') { return { box: { paddingVertical: 2 }, dot: true, fg: t.color.text }; }
  return { box: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: c.bg }, dot: true, fg: c.fg };
}

/** A skeleton shape's fill and how much rounder its corners are. */
export function skeletonLook(t: Theme, variant: SkeletonVariant = 'default') {
  return variant === 'soft' ? { fill: t.color.surface2, round: 2 } : variant === 'pulse' ? { fill: t.color.surface3, round: 0.5 } : { fill: t.color.surface3, round: 1 };
}

/** An empty state's frame, whether it lays out in a row, and its icon disc size. */
export function emptyLook(t: Theme, variant: EmptyVariant = 'default'): { box: ViewStyle; row: boolean; disc: number } {
  if (variant === 'illustrated') { return { box: { alignItems: 'center', gap: 10, padding: 32 }, row: false, disc: 96 }; }
  if (variant === 'compact') { return { box: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }, row: true, disc: 36 }; }
  if (variant === 'card') { return { box: { alignItems: 'center', gap: 8, padding: 24, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.color.borderStrong, borderRadius: t.radius.card }, row: false, disc: 56 }; }
  return { box: { alignItems: 'center', gap: 8, padding: 24 }, row: false, disc: 56 };
}

/** The faces of the emoji rating, very poor to very good. */
export const FACES = ['😞', '🙁', '😐', '🙂', '😄'];

/** A ring of dots, the first share of them in colour (plain views: no drawing library), with its children in the middle. */
export function DotRing({ share, size, color, track, children, dots = 24 }: { share: number; size: number; color: string; track: string; children?: ReactNode; dots?: number }) {
  const on = Math.round(Math.max(0, Math.min(1, share)) * dots);
  const d = Math.max(3, size / 9);
  const r = size / 2 - d / 2;
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: dots }, (_, i) => {
        const a = (i / dots) * 2 * Math.PI - Math.PI / 2;
        return <View key={i} style={{ position: 'absolute', width: d, height: d, borderRadius: d / 2, left: size / 2 + r * Math.cos(a) - d / 2, top: size / 2 + r * Math.sin(a) - d / 2,
          backgroundColor: i < on ? color : track }} />;
      })}
      {children}
    </View>
  );
}

/** Three dots that pulse in turn; still under reduced motion. */
export function PulseDots({ color, size = 8 }: { color: string; size?: number }) {
  const v = useCycle(1000, true, 0.5);
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flexDirection: 'row', gap: size / 2 }}>
      {[0, 1, 2].map((i) => <Animated.View key={i} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color,
        opacity: v.interpolate({ inputRange: [0, i / 3, i / 3 + 0.2, 1], outputRange: [0.3, 0.3, 1, 0.3], extrapolate: 'clamp' }) }} />)}
    </View>
  );
}

/*
 * The thinking orb: thinking-orbs 0.3.1, MIT License, Copyright (c) 2026 Jakub Antalik.
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice
 * and this permission notice shall be included in all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
 */
/** A thinking orb for an AI assistant at work, 20 or 64 points; hidden from screen readers (the spinner says its label). Still under reduced motion. */
export function Orb({ state = 'working', size = 64, dark = false }: { state?: OrbState; size?: 20 | 64; dark?: boolean }) {
  const reduced = useReducedMotion();
  const { mode, speed, opts } = resolvePreset(state, size);
  const [time, setTime] = useState(0.6);
  useEffect(() => {
    if (reduced) { setTime(0.6); return undefined; }
    const start = Date.now();
    // shortcut: views redrawn about 20 times a second, not every frame; enough for a loader, react-native-skia would draw it smoother
    const timer = setInterval(() => setTime(((Date.now() - start) / 1000) * speed), 50);
    return () => clearInterval(timer);
  }, [reduced, speed]);
  const frame = MODE_FRAMES[mode](size, time, opts);
  const ink = (white: number, a = 1) => { const g = Math.round((dark ? 1 - Math.min(1, Math.max(0, white)) : Math.min(1, Math.max(0, white))) * 255); return `rgba(${g},${g},${g},${a})`; };
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: size, height: size }}>
      {frame.lines.map((l, i) => {
        const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
        return <View key={`l${i}`} style={{ position: 'absolute', left: (l.x1 + l.x2) / 2 - len / 2, top: (l.y1 + l.y2) / 2 - l.w / 2, width: len, height: l.w,
          backgroundColor: ink(l.white, l.a), transform: [{ rotate: `${Math.atan2(l.y2 - l.y1, l.x2 - l.x1)}rad` }] }} />;
      })}
      {frame.dots.map((p, i) => <View key={i} style={{ position: 'absolute', left: p.x - p.r, top: p.y - p.r, width: p.r * 2, height: p.r * 2, borderRadius: p.r, backgroundColor: ink(p.white, p.a) }} />)}
    </View>
  );
}
