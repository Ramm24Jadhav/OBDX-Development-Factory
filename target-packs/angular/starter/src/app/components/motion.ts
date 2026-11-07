/*
 * The motion layer's script part, the same in every web pack (bx-motion.js in the premium JET pack). Most motion is CSS
 * in bx.css (the bx-m-<phase>-<name> classes of the motion library and each kind's own); this plays a preset on an
 * element with the Web Animations API (a number that rolls, a chip that pops, a panel that leaves) and resolves an
 * effect variant's settings. Under reduced motion, or where the API is missing, nothing plays and the element shows its
 * end state. Presets, durations and easing come from presets.ts, generated from motion.json and the design tokens.
 */
import { DURATION, EASING, FX, Frame, FxParams, PRESETS, Phase } from './presets';

export type Effect = 'roll' | 'pop' | 'shake' | 'settle' | 'pulse';

/** Neutral frames (opacity, x, y, scale, blur, rotate) as Web Animations keyframes; keys missing from a frame are at rest. */
export function keyframes(frames: ReadonlyArray<Frame>): Keyframe[] {
  const keys = new Set(frames.flatMap((f) => Object.keys(f)));
  const moves = keys.has('x') || keys.has('y') || keys.has('scale') || keys.has('rotate');
  return frames.map((f) => {
    const k: Keyframe = {};
    if (keys.has('opacity')) { k.opacity = f.opacity ?? 1; }
    if (moves) {
      const t = [f.x || f.y ? `translate(${f.x || 0}px, ${f.y || 0}px)` : '', f.scale !== undefined ? `scale(${f.scale})` : '', f.rotate ? `rotate(${f.rotate}deg)` : ''].filter(Boolean);
      k.transform = t.length ? t.join(' ') : 'none';
    }
    if (keys.has('blur')) { k.filter = f.blur ? `blur(${f.blur}px)` : 'none'; }
    return k;
  });
}

const timed = (phase: Phase, name: string) => {
  const p = PRESETS[phase]?.[name];
  return p?.frames ? { frames: keyframes(p.frames), duration: DURATION[p.duration], easing: EASING[p.easing] } : null;
};

/** The value-change effects the components play, from the motion library's change presets. */
export const EFFECTS = Object.fromEntries((['roll', 'pop', 'shake', 'settle', 'pulse'] as Effect[]).map((e) => [e, timed('change', e)!])) as
  Record<Effect, { frames: Keyframe[]; duration: number; easing: string }>;

/** True when the customer asked for less motion (or there is no window, as in a test without one). */
export function reducedMotion(): boolean {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function' ? false : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Plays a preset (a change effect unless another phase is named) on an element once; returns the animation, or null when nothing plays. */
export function play(element: Element | null | undefined, effect: Effect | string, phase: Phase = 'change'): Animation | null {
  const e = timed(phase, effect);
  if (!element || !e || typeof (element as HTMLElement).animate !== 'function' || reducedMotion()) { return null; }
  return (element as HTMLElement).animate(e.frames, { duration: e.duration, easing: e.easing, fill: phase === 'exit' ? 'forwards' : 'none' });
}

/** Plays an exit preset and resolves when it ends (at once when nothing plays), so the caller can then remove the element. */
export function leave(element: Element | null | undefined, preset = 'fade'): Promise<void> {
  const a = play(element, preset, 'exit');
  return a?.finished ? a.finished.then(() => undefined, () => undefined) : Promise.resolve();
}

export interface FxSettings extends FxParams { speed: number; intensity: number; density: number; sensitivity: number; /** The variant's class (' is-v-<id>'), or '' */ css: string }

/** An effect variant's settings (variants/*.json), with the defaults for any it leaves out; an unknown variant is the default. */
export function fx(component: string, variant?: string): FxSettings {
  const p = variant ? FX[component]?.[variant] : undefined;
  return { speed: 1, intensity: 1, density: 1, sensitivity: 1, ...p, css: p ? ` is-v-${variant}` : '' };
}
