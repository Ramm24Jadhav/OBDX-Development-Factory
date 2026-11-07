/*
 * The motion layer, with React Native's own Animated (no other library). Each effect is named as in
 * target-packs/components/motion.json: enter (the component style's scroll effect), press (its click effect), shake,
 * pop, roll, grow, settle, spring, slide and shimmer. Durations and easing follow the bank tokens (--bx-dur-*,
 * --bx-ease-*). When the device asks for reduced motion (AccessibilityInfo), every effect shows its end state at once.
 */
import { ComponentProps, ReactNode, useEffect, useRef, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';

import { useTheme } from './theme';
import { lightTokens } from './tokens';

/**
 * The style key for a CSS gradient: experimental_backgroundImage on devices (the new architecture), backgroundImage in a
 * browser (react-native-web drops the experimental key), so the gradients show in the web gallery too.
 */
export const BG = (Platform.OS === 'web' ? 'backgroundImage' : 'experimental_backgroundImage') as 'experimental_backgroundImage';
/**
 * The Modal's own fade. On the web it is off: react-native-web makes a Modal a dialog (focus trap, Escape) when its fade
 * ends, and that event never reaches it from the portal, so a faded Modal never became one. The panels animate themselves.
 */
export const MODAL_FADE = (Platform.OS === 'web' ? 'none' : 'fade') as 'none' | 'fade';

export const DURATION = { fast: lightTokens.motion.durationFast, base: lightTokens.motion.durationBase, slow: lightTokens.motion.durationSlow };
export const EASING = { standard: Easing.bezier(0.2, 0, 0, 1), exit: Easing.bezier(0.4, 0, 1, 1) };
const SPRING = { friction: 7, tension: 120 };

/* ---------- Reduced motion ---------- */

let reduced = false;
let watching = false;
const listeners = new Set<() => void>();

function setReduced(value: boolean) {
  if (value === reduced) { return; }
  reduced = value;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  if (!watching) {
    watching = true;
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => undefined);
    AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
  }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** True while the device asks for reduced motion; every effect then shows its end state. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => reduced, () => reduced);
}

/** Runs an animation, or jumps to its end when motion is reduced. */
function run(value: Animated.Value, to: number, animation: () => Animated.CompositeAnimation) {
  if (reduced) { value.stopAnimation(); value.setValue(to); return; }
  animation().start();
}

const timing = (value: Animated.Value, toValue: number, duration: number = DURATION.base, native = true) =>
  () => Animated.timing(value, { toValue, duration, easing: EASING.standard, useNativeDriver: native });

/** Keeps a value at its end while motion is reduced. */
function useEndWhenReduced(value: Animated.Value, end: number) {
  const r = useReducedMotion();
  useEffect(() => { if (r) { value.stopAnimation(); value.setValue(end); } }, [r, value, end]);
}

/* ---------- Enter ---------- */

export type EnterEffect = 'fadeup' | 'scale' | 'slide' | 'blur' | 'fade' | 'rise' | 'slide-down' | 'settle' | 'none';

function enterStyle(effect: EnterEffect, v: Animated.Value) {
  const move = (from: number) => v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] });
  switch (effect) {
    case 'none': return {};
    case 'fade': return { opacity: v };
    case 'scale': return { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] };
    case 'slide': return { opacity: v, transform: [{ translateX: move(16) }] };
    /* React Native cannot animate a blur filter natively, so blur enters as a soft grow from a little larger */
    case 'blur': return { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1.03, 1] }) }] };
    case 'slide-down': case 'settle': return { opacity: v, transform: [{ translateY: move(-8) }] };
    default: return { opacity: v, transform: [{ translateY: move(12) }] };
  }
}

/** The style of an entrance: the component style's scroll effect unless one is named. Starts on mount. */
export function useEnter(effect?: EnterEffect) {
  const t = useTheme();
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEndWhenReduced(v, 1);
  useEffect(() => { run(v, 1, timing(v, 1)); }, [v]);
  return enterStyle(effect ?? t.motion.scroll, v);
}

/** A view that enters with the component style's scroll effect (or the one named). */
type ViewMotionProps = Omit<ComponentProps<typeof Animated.View>, 'style' | 'children'>;

export function Enter({ effect, style, children, ...props }: { effect?: EnterEffect; style?: StyleProp<ViewStyle>; children?: ReactNode } & ViewMotionProps) {
  const motion = useEnter(effect);
  return <Animated.View {...props} style={[style, motion]}>{children}</Animated.View>;
}

/* ---------- Press ---------- */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressProps = Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; /** The current page of a menu (the web reads it; native announces selected) */ 'aria-current'?: 'page' };

/**
 * A Pressable with the component style's click effect: press (scales a little), bounce (springs back) or ripple (the
 * Android ripple; iOS has none and keeps still).
 */
export function Press({ style, onPressIn, onPressOut, disabled, ...props }: PressProps) {
  const t = useTheme();
  const r = useReducedMotion();
  const s = useRef(new Animated.Value(1)).current;
  const click = t.motion.click;
  const to = (v: number, spring: boolean) => {
    if (r || disabled) { s.setValue(1); return; }
    (spring ? Animated.spring(s, { toValue: v, ...SPRING, friction: 3, useNativeDriver: true })
      : Animated.timing(s, { toValue: v, duration: DURATION.fast, easing: EASING.standard, useNativeDriver: true })).start();
  };
  // react-native-web 0.21 reads the aria-* props, not accessibilityState, so checked and selected reach the browser too
  // (a selected button is a pressed toggle on the web: aria-selected belongs to tabs and options only)
  const st = props.accessibilityState;
  const pick = props.accessibilityRole === 'tab' || props.accessibilityRole === 'radio';
  return (
    <AnimatedPressable {...props} disabled={disabled} aria-checked={st?.checked} aria-selected={pick ? st?.selected : undefined}
                       aria-pressed={pick || props['aria-current'] ? undefined : st?.selected} aria-expanded={st?.expanded}
                       aria-disabled={st?.disabled}
                       android_ripple={click === 'ripple' && !r ? { color: t.color.primarySoft } : undefined}
                       onPressIn={(e) => { if (click === 'press' || click === 'bounce') { to(click === 'bounce' ? 0.95 : t.pressScale, false); } onPressIn?.(e); }}
                       onPressOut={(e) => { to(1, click === 'bounce'); onPressOut?.(e); }}
                       style={[style, { transform: [{ scale: s }] }]} />
  );
}

/* ---------- Value change: shake, pop, roll, grow ---------- */

/** The field shakes once when its error appears. */
export function useShake(error?: string) {
  const v = useRef(new Animated.Value(0)).current;
  const had = useRef(!!error);
  useEffect(() => {
    const now = !!error;
    if (now && !had.current && !reduced) {
      const step = (to: number) => Animated.timing(v, { toValue: to, duration: DURATION.slow / 4, easing: EASING.standard, useNativeDriver: true });
      Animated.sequence([step(-6), step(5), step(-3), step(0)]).start();
    }
    had.current = now;
  }, [error, v]);
  return { transform: [{ translateX: v }] };
}

/** Wraps a control so it shakes once when its error appears. */
export function Shake({ error, children, style, ...props }: { error?: string; children: ReactNode; style?: StyleProp<ViewStyle> } & ViewMotionProps) {
  return <Animated.View {...props} style={[style, useShake(error)]}>{children}</Animated.View>;
}

/** Pops (a quick spring of scale) each time key changes, but not on the first render. */
export function usePop(key: unknown) {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduced) { return; }
    v.setValue(0.85);
    Animated.spring(v, { toValue: 1, ...SPRING, friction: 4, useNativeDriver: true }).start();
  }, [key, v]);
  return { transform: [{ scale: v }] };
}

export function Pop({ on, children, style, ...props }: { on: unknown; children?: ReactNode; style?: StyleProp<ViewStyle> } & ViewMotionProps) {
  return <Animated.View {...props} style={[style, usePop(on)]}>{children}</Animated.View>;
}

/** A changed number rolls up into place. */
export function useRoll(key: unknown) {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduced) { return; }
    v.setValue(0);
    timing(v, 1)().start();
  }, [key, v]);
  return { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] };
}

export function Roll({ on, children, style, ...props }: { on: unknown; children?: ReactNode; style?: StyleProp<ViewStyle> } & ViewMotionProps) {
  return <Animated.View {...props} style={[style, useRoll(on)]}>{children}</Animated.View>;
}

/** Bars and meters grow to their share (0 to 1); returns a width or height in percent. */
export function useGrow(share: number) {
  const v = useRef(new Animated.Value(reduced ? share : 0)).current;
  useEndWhenReduced(v, share);
  useEffect(() => { run(v, share, timing(v, share, DURATION.slow, false)); }, [share, v]);
  return v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' });
}

/** Moves to a new place (a sliding tab or segment indicator); not native, as it animates layout. */
export function useSlide(to: number) {
  const v = useRef(new Animated.Value(to)).current;
  useEndWhenReduced(v, to);
  useEffect(() => { run(v, to, () => Animated.spring(v, { toValue: to, ...SPRING, useNativeDriver: false })); }, [to, v]);
  return v;
}

/* ---------- Open and loading ---------- */

/** Opens on a spring while open is true: a sheet rises, a dialog grows. */
export function useOpen(open: boolean, kind: 'sheet' | 'dialog' | 'drop' = 'sheet') {
  const v = useRef(new Animated.Value(open && reduced ? 1 : 0)).current;
  useEndWhenReduced(v, open ? 1 : 0);
  useEffect(() => {
    if (!open) { v.setValue(0); return; }
    run(v, 1, kind === 'drop' ? timing(v, 1, DURATION.base) : () => Animated.spring(v, { toValue: 1, ...SPRING, useNativeDriver: true }));
  }, [open, v, kind]);
  if (kind === 'dialog') { return { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }; }
  if (kind === 'drop') { return { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }; }
  return { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }] };
}

/** A soft pulse while active (a busy button, a skeleton); still under reduced motion. */
export function useShimmer(active: boolean) {
  const v = useRef(new Animated.Value(1)).current;
  const r = useReducedMotion();
  useEffect(() => {
    if (!active || r) { v.setValue(1); return undefined; }
    const loop = Animated.loop(Animated.sequence([timing(v, 0.5, 700)(), timing(v, 1, 700)()]));
    loop.start();
    return () => loop.stop();
  }, [active, r, v]);
  return { opacity: v };
}

/** Repeats a 0 → 1 cycle for the effects that move on their own (marquee, aurora, loaders); stays at rest under reduced motion. */
export function useCycle(duration: number, active = true, rest = 0) {
  const v = useRef(new Animated.Value(rest)).current;
  const r = useReducedMotion();
  useEffect(() => {
    if (!active || r) { v.setValue(rest); return undefined; }
    v.setValue(0);
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [active, r, v, duration, rest]);
  return v;
}

/** count values that go 0 → 1 one after another, step ms apart, each time key changes; all 1 under reduced motion. */
export function useStagger(count: number, step = 40, key?: unknown) {
  const values = useRef<Animated.Value[]>([]);
  const r = useReducedMotion();
  while (values.current.length < count) { values.current.push(new Animated.Value(reduced ? 1 : 0)); }
  useEffect(() => {
    const list = values.current.slice(0, count);
    if (r) { list.forEach((v) => { v.stopAnimation(); v.setValue(1); }); return; }
    list.forEach((v) => v.setValue(0));
    Animated.stagger(step, list.map((v) => timing(v, 1)())).start();
  }, [count, step, key, r]);
  return values.current.slice(0, count);
}

/** Runs to 1 over duration each time key changes, after delay; at 1 under reduced motion. */
export function useProgress(key: unknown, duration: number = DURATION.slow, delay = 0, native = true) {
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEndWhenReduced(v, 1);
  useEffect(() => {
    if (reduced) { v.setValue(1); return; }
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration, delay, easing: EASING.standard, useNativeDriver: native }).start();
  }, [key, v, duration, delay, native]);
  return v;
}
