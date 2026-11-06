/*
 * The motion layer's script part, the same in every web pack (bx-motion.js in the premium JET pack). Most motion is CSS
 * in bx.css; this plays the effects a value change needs (a number that rolls, a chip that pops) with the Web
 * Animations API. Under reduced motion, or where the API is missing, nothing plays and the element shows its end state.
 * Durations and easing follow the --bx-dur-* and --bx-ease-* tokens. See target-packs/components/motion.json.
 */
export type Effect = 'roll' | 'pop' | 'shake' | 'settle' | 'pulse';

const STANDARD = 'cubic-bezier(0.2, 0, 0, 1)';
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

export const EFFECTS: Record<Effect, { frames: Keyframe[]; duration: number; easing: string }> = {
  roll: { frames: [{ transform: 'translateY(40%)', opacity: 0 }, { transform: 'none', opacity: 1 }], duration: 200, easing: STANDARD },
  pop: { frames: [{ transform: 'scale(0.85)' }, { transform: 'scale(1.06)' }, { transform: 'none' }], duration: 320, easing: SPRING },
  shake: { frames: [{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }],
    duration: 320, easing: STANDARD },
  settle: { frames: [{ transform: 'translateY(-6px)', opacity: 0 }, { transform: 'none', opacity: 1 }], duration: 200, easing: STANDARD },
  pulse: { frames: [{ transform: 'none' }, { transform: 'scale(1.04)' }, { transform: 'none' }], duration: 320, easing: STANDARD },
};

/** True when the customer asked for less motion (or there is no window, as in a test without one). */
export function reducedMotion(): boolean {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function' ? false : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Plays an effect on an element once; returns the animation, or null when nothing plays. */
export function play(element: Element | null | undefined, effect: Effect): Animation | null {
  const e = EFFECTS[effect];
  if (!element || !e || typeof (element as HTMLElement).animate !== 'function' || reducedMotion()) { return null; }
  return (element as HTMLElement).animate(e.frames, { duration: e.duration, easing: e.easing });
}
