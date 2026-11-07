/*
 * Text effects (the M2 "Text effects" category), our own code on React Native's Animated. Screen readers always read
 * the whole text as one label; the moving pieces are hidden from them. Under reduced motion each shows its end state.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleProp, Text, TextStyle, View } from 'react-native';

import { formatAmount } from './TextField';
import { DURATION, useCycle, useProgress, useReducedMotion, useStagger } from './motion';
import { useTheme } from './theme';
import { BoardVariant, SensitiveVariant, variantLook } from './bankVariants';

export interface TextEffectProps {
  testID?: string;
  style?: StyleProp<TextStyle>;
}

const hidden = { importantForAccessibility: 'no-hide-descendants' as const, accessibilityElementsHidden: true };

function useTextStyle(style?: StyleProp<TextStyle>, size = 18) {
  const t = useTheme();
  return [{ fontSize: size, fontWeight: '700' as const, color: t.color.text, fontVariant: ['tabular-nums' as const] }, style];
}

/* ---------- RollingDigits ---------- */

function DigitColumn({ digit, size, style }: { digit: number; size: number; style: StyleProp<TextStyle> }) {
  const y = useRef(new Animated.Value(-digit * size * 1.25)).current;
  const r = useReducedMotion();
  useEffect(() => {
    const to = -digit * size * 1.25;
    if (r) { y.setValue(to); return; }
    Animated.spring(y, { toValue: to, friction: 8, tension: 70, useNativeDriver: true }).start();
  }, [digit, size, r, y]);
  return (
    <View style={{ height: size * 1.25, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        {Array.from({ length: 10 }, (_, n) => <Text key={n} style={[style, { height: size * 1.25, lineHeight: size * 1.25 }]}>{n}</Text>)}
      </Animated.View>
    </View>
  );
}

export interface RollingDigitsProps extends TextEffectProps {
  /** The number as shown ("12,400.00"); each digit rolls to its new place when it changes. */
  value: string;
  size?: number;
}

/** A balance or rate whose digits roll into place like a counter. */
export function RollingDigits({ testID, value, size = 28, style }: RollingDigitsProps) {
  const s = useTextStyle(style, size);
  return (
    <View testID={testID} accessible accessibilityLabel={value} style={{ flexDirection: 'row' }}>
      <View {...hidden} style={{ flexDirection: 'row' }}>
        {value.split('').map((c, i) => (/\d/.test(c)
          ? <DigitColumn key={`${i}-d`} digit={Number(c)} size={size} style={s} />
          : <Text key={`${i}-${c}`} style={[s, { height: size * 1.25, lineHeight: size * 1.25 }]}>{c}</Text>))}
      </View>
    </View>
  );
}

/* ---------- CountUp ---------- */

export interface CountUpProps extends TextEffectProps {
  value: number;
  from?: number;
  currency?: string;
  duration?: number;
}

/** Counts from a start to the value, in the currency's decimals; screen readers hear only the end value. */
export function CountUp({ testID, value, from = 0, currency, duration = 900, style }: CountUpProps) {
  const s = useTextStyle(style, 24);
  const r = useReducedMotion();
  const [shown, setShown] = useState(r ? value : from);
  useEffect(() => {
    if (r) { setShown(value); return undefined; }
    const v = new Animated.Value(from);
    const id = v.addListener(({ value: n }) => setShown(n));
    Animated.timing(v, { toValue: value, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => { v.removeListener(id); v.stopAnimation(); };
  }, [value, from, duration, r]);
  const text = (n: number) => `${formatAmount(n, currency)}${currency ? ` ${currency}` : ''}`;
  return <Text testID={testID} accessibilityLabel={text(value)} style={s}>{text(shown)}</Text>;
}

/* ---------- SplitFlapBoard ---------- */

function Flap({ char, delay }: { char: string; delay: number }) {
  const t = useTheme();
  const v = useProgress(char, DURATION.slow, delay);
  const fold = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.05, 1] });
  return (
    <View style={{ width: 20, height: 30, marginRight: 2, borderRadius: 3, backgroundColor: t.color.text, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.Text style={{ color: t.color.surface, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'], transform: [{ scaleY: fold }] }}>{char}</Animated.Text>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 14.5, height: 1, backgroundColor: t.color.surface3, opacity: 0.4 }} />
    </View>
  );
}

export interface SplitFlapBoardProps {
  testID?: string;
  variant?: BoardVariant;
  label: string;
  /** Each row: "USD / EUR" and "0.9213"; a changed character flips. */
  rows: ReadonlyArray<{ label: string; value: string }>;
}

/** An exchange-rate board whose characters flip when they change. */
export function SplitFlapBoard({ testID, label, rows, variant }: SplitFlapBoardProps) {
  const t = useTheme();
  return (
    <View testID={testID} style={[{ gap: 8, padding: 12, borderRadius: t.radius.card, backgroundColor: t.color.surface2 }, variantLook(t, 'board', variant).surface]}>
      <Text accessibilityRole="header" style={{ fontSize: 14, fontWeight: '700', color: t.color.textBody }}>{label}</Text>
      {rows.map((row) => (
        <View key={row.label} accessible accessibilityLabel={`${row.label}: ${row.value}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: t.color.text, fontWeight: '600' }}>{row.label}</Text>
          <View {...hidden} style={{ flexDirection: 'row' }}>{row.value.split('').map((c, i) => <Flap key={i} char={c} delay={i * 40} />)}</View>
        </View>
      ))}
    </View>
  );
}

/* ---------- RevealDigits ---------- */

export interface RevealDigitsProps extends TextEffectProps {
  /** The full number. */
  value: string;
  /** While masked only the last four show; unmasking reveals the rest one character at a time. */
  masked: boolean;
  variant?: SensitiveVariant;
}

/** An account number that unmasks digit by digit. */
export function RevealDigits({ testID, value, masked, style, variant }: RevealDigitsProps) {
  const s = useTextStyle(style, variant === 'card' ? 22 : 18);
  const t = useTheme();
  // blur: the masked digits fade and spread (the real number is never drawn while masked); card: a surface of its own
  const v = variant === 'blur' && masked ? { opacity: 0.55, letterSpacing: 4 } : variant === 'card' ? { padding: 16, borderRadius: t.radius.card, backgroundColor: t.color.surface2, overflow: 'hidden' as const } : null;
  const r = useReducedMotion();
  /* the last four digits always show; spaces and separators stay */
  const digitsAt = value.split('').map((c, i) => (/\d/.test(c) ? i : -1)).filter((i) => i >= 0);
  const keep = new Set(digitsAt.slice(-4));
  const [open, setOpen] = useState(masked ? 0 : value.length);
  useEffect(() => {
    if (masked) { setOpen(0); return undefined; }
    if (r) { setOpen(value.length); return undefined; }
    let n = 0;
    const timer = setInterval(() => { n += 1; setOpen(n); if (n >= value.length) { clearInterval(timer); } }, 35);
    return () => clearInterval(timer);
  }, [masked, value, r]);
  const shown = value.split('').map((c, i) => (/\d/.test(c) && !keep.has(i) && i >= open ? '•' : c)).join('');
  return <Text testID={testID} accessibilityLabel={masked ? `ending ${value.replace(/\s/g, '').slice(-4)}, hidden` : value} style={[s, v]}>{shown}</Text>;
}

/* ---------- BlurInText, TextReveal, ScrollFloatText ---------- */

export interface TextProps extends TextEffectProps {
  text: string;
  size?: number;
}

/** Words come into focus one after another (a soft fade and settle; React Native cannot animate a real blur). */
export function BlurInText({ testID, text, size = 22, style }: TextProps) {
  const s = useTextStyle(style, size);
  const words = text.split(' ');
  const vs = useStagger(words.length, 70, text);
  return (
    <Text testID={testID} accessibilityLabel={text} style={s}>
      {words.map((w, i) => (
        <Animated.Text key={i} style={{ opacity: vs[i], transform: [{ scale: vs[i].interpolate({ inputRange: [0, 1], outputRange: [1.08, 1] }) }] }}>
          {w}{i < words.length - 1 ? ' ' : ''}
        </Animated.Text>
      ))}
    </Text>
  );
}

function Rising({ text, values, s, lift }: { text: string; values: Animated.Value[] | Animated.AnimatedInterpolation<number>[]; s: StyleProp<TextStyle>; lift: number }) {
  return (
    <View {...hidden} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {text.split('').map((c, i) => (
        <Animated.Text key={i} style={[s, { opacity: values[i], transform: [{ translateY: (values[i] as Animated.Value).interpolate({ inputRange: [0, 1], outputRange: [lift, 0] }) }] }]}>
          {c === ' ' ? ' ' : c}
        </Animated.Text>
      ))}
    </View>
  );
}

/** The characters rise into place one after another. */
export function TextReveal({ testID, text, size = 22, style }: TextProps) {
  const s = useTextStyle(style, size);
  const vs = useStagger(text.length, 18, text);
  return <View testID={testID} accessible accessibilityLabel={text}><Rising text={text} values={vs} s={s} lift={size * 0.6} /></View>;
}

export interface ScrollFloatTextProps extends TextProps {
  /** 0 → 1 as the text scrolls into view (from the screen's ScrollView); without it the text floats up once. */
  progress?: Animated.Value;
}

/** Characters float up in a wave as the text scrolls into view. */
export function ScrollFloatText({ testID, text, size = 26, style, progress }: ScrollFloatTextProps) {
  const s = useTextStyle(style, size);
  const own = useProgress(text, 900);
  const p = progress ?? own;
  const n = Math.max(1, text.length);
  const values = text.split('').map((_, i) => p.interpolate({ inputRange: [Math.min(0.99, (i / n) * 0.6), Math.min(1, (i / n) * 0.6 + 0.4)], outputRange: [0, 1],
    extrapolate: 'clamp' }));
  return <View testID={testID} accessible accessibilityLabel={text}><Rising text={text} values={values} s={s} lift={size} /></View>;
}

/* ---------- RotatingText ---------- */

export interface RotatingTextProps extends TextEffectProps {
  /** The words before ("Pay your"). */
  prefix?: string;
  words: ReadonlyArray<string>;
  /** Milliseconds each word shows. */
  interval?: number;
}

/** A phrase whose last word turns over to the next every few seconds; screen readers hear the phrase with every word. */
export function RotatingText({ testID, prefix, words, interval = 2400, style }: RotatingTextProps) {
  const s = useTextStyle(style, 22);
  const t = useTheme();
  const r = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (r || words.length < 2) { return undefined; }
    const timer = setInterval(() => setI((n) => (n + 1) % words.length), interval);
    return () => clearInterval(timer);
  }, [r, words.length, interval]);
  const v = useProgress(i, DURATION.slow);
  return (
    <View testID={testID} accessible accessibilityLabel={`${prefix ? `${prefix} ` : ''}${words.join(', ')}`} style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {prefix ? <Text style={s}>{prefix} </Text> : null}
      <View style={{ overflow: 'hidden' }}>
        <Animated.Text style={[s, { color: t.color.primaryText, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
          {words[i]}
        </Animated.Text>
      </View>
    </View>
  );
}

/* ---------- ShimmerText and GradientText ---------- */

/** A light runs along the text (each character brightens in turn); it rests fully lit under reduced motion. */
export function ShimmerText({ testID, text, size = 18, style }: TextProps) {
  const s = useTextStyle(style, size);
  const cycle = useCycle(1800, true, 1);
  const r = useReducedMotion();
  const n = Math.max(1, text.length);
  if (r) { return <Text testID={testID} style={s}>{text}</Text>; }
  return (
    <Text testID={testID} accessibilityLabel={text} style={s}>
      {text.split('').map((c, i) => {
        const at = i / n;
        return (
          <Animated.Text key={i} style={{ opacity: cycle.interpolate({ inputRange: [0, Math.max(0, at - 0.15), at, Math.min(1, at + 0.15), 1],
            outputRange: [0.55, 0.55, 1, 0.55, 0.55], extrapolate: 'clamp' }) }}>{c}</Animated.Text>
        );
      })}
    </Text>
  );
}

const hex = (c: string) => { const h = c.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

/** The colour between two hex colours at share (0 to 1). */
export function mix(a: string, b: string, share: number): string {
  const [x, y] = [hex(a), hex(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * share).toString(16).padStart(2, '0')).join('')}`;
}

export interface GradientTextProps extends TextProps {
  /** Two hex colours; the brand colour and a lighter tint by default. */
  colors?: [string, string];
}

/** Text in a colour gradient (each character takes its colour along it, as React Native cannot fill text with a gradient). */
export function GradientText({ testID, text, size = 26, style, colors }: GradientTextProps) {
  const t = useTheme();
  const s = useTextStyle(style, size);
  const [a, b] = colors ?? [t.color.primary, t.color.info];
  const n = Math.max(1, text.length - 1);
  const solid = !a.startsWith('#') || !b.startsWith('#');
  return (
    <Text testID={testID} accessibilityLabel={text} style={s}>
      {text.split('').map((c, i) => <Text key={i} style={{ color: solid ? a : mix(a, b, i / n) }}>{c}</Text>)}
    </Text>
  );
}

/* ---------- TypedText ---------- */

export interface TypedTextProps extends TextProps {
  /** Milliseconds per character. */
  speed?: number;
  onDone?: () => void;
}

/** The assistant's answer typed out with a cursor; the whole answer is read at once and shown at once under reduced motion. */
export function TypedText({ testID, text, size = 16, style, speed = 28, onDone }: TypedTextProps) {
  const t = useTheme();
  const r = useReducedMotion();
  const [n, setN] = useState(r ? text.length : 0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (r) { setN(text.length); done.current?.(); return undefined; }
    setN(0);
    let i = 0;
    const timer = setInterval(() => { i += 1; setN(i); if (i >= text.length) { clearInterval(timer); done.current?.(); } }, speed);
    return () => clearInterval(timer);
  }, [text, speed, r]);
  const blink = useCycle(900, n < text.length, 1);
  return (
    <Text testID={testID} accessibilityLabel={text} accessibilityLiveRegion="polite"
          style={[{ fontSize: size, color: t.color.text, lineHeight: size * 1.45 }, style]}>
      {text.slice(0, n)}
      {n < text.length ? <Animated.Text style={{ color: t.color.primary, opacity: blink.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 1] }) }}>▍</Animated.Text> : null}
    </Text>
  );
}

/* ---------- FocusWord ---------- */

export interface FocusWordProps extends TextProps {
  interval?: number;
}

/** One word at a time is in focus and the rest dim, moving through the sentence. */
export function FocusWord({ testID, text, size = 22, style, interval = 900 }: FocusWordProps) {
  const s = useTextStyle(style, size);
  const r = useReducedMotion();
  const words = text.split(' ');
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (r) { return undefined; }
    const timer = setInterval(() => setAt((n) => (n + 1) % words.length), interval);
    return () => clearInterval(timer);
  }, [r, words.length, interval]);
  return (
    <Text testID={testID} accessibilityLabel={text} style={s}>
      {words.map((w, i) => <Text key={i} style={{ opacity: r || i === at ? 1 : 0.35 }}>{w}{i < words.length - 1 ? ' ' : ''}</Text>)}
    </Text>
  );
}
