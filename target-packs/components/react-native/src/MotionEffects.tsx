/*
 * Motion effects (the M2 "Motion" category), our own code on React Native's Animated. Phones have no hover or cursor,
 * so the hover ideas answer the finger instead: a glare on press, a button that leans towards the touch. Under reduced
 * motion each shows its end state.
 */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { BG, DURATION, EASING, useCycle, useProgress, useReducedMotion } from './motion';
import { useTheme } from './theme';

export interface WrapProps {
  testID?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/* ---------- FadeInContent and ScrollReveal ---------- */

/** Content that fades in after a delay (a section of a dashboard after its data). */
export function FadeInContent({ testID, children, style, delay = 0 }: WrapProps & { delay?: number }) {
  const v = useProgress('once', DURATION.slow, delay);
  return <Animated.View testID={testID} style={[style, { opacity: v }]}>{children}</Animated.View>;
}

export interface ScrollRevealProps extends WrapProps {
  /** True once it is on screen (from a FlatList's onViewableItemsChanged); it stays revealed. */
  visible?: boolean;
  /** rise (default), scale or slide. */
  effect?: 'rise' | 'scale' | 'slide';
}

/** Content revealed as it scrolls into view. */
export function ScrollReveal({ testID, children, style, visible = true, effect = 'rise' }: ScrollRevealProps) {
  const [seen, setSeen] = useState(visible);
  useEffect(() => { if (visible) { setSeen(true); } }, [visible]);
  const v = useProgress(seen, DURATION.slow);
  const shown = seen ? v : 0;
  const move = seen ? v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) : 1;
  const transform = effect === 'scale' ? [{ scale: seen ? v.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) : 0.94 }]
    : effect === 'slide' ? [{ translateX: Animated.multiply(move, 24) }] : [{ translateY: Animated.multiply(move, 24) }];
  return <Animated.View testID={testID} style={[style, { opacity: shown, transform }]}>{children}</Animated.View>;
}

/* ---------- ScrollExpand ---------- */

export interface ScrollExpandProps extends WrapProps {
  /** 0 → 1 as the screen scrolls (an Animated value from the ScrollView); without it the panel opens once. */
  progress?: Animated.Value;
}

/** A panel that grows from an inset card to full width as the screen scrolls. */
export function ScrollExpand({ testID, children, style, progress }: ScrollExpandProps) {
  const t = useTheme();
  const own = useProgress('once', 700);
  const p = progress ?? own;
  return (
    <Animated.View testID={testID} style={[style, { overflow: 'hidden', backgroundColor: t.color.surface,
      borderRadius: t.radius.card, transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1], extrapolate: 'clamp' }) }] }]}>
      {children}
    </Animated.View>
  );
}

/* ---------- EdgeBlur ---------- */

/** Fades the top and bottom edges of a scrolling area into the background, so content softly runs out of view. */
export function EdgeBlur({ testID, children, style, size = 28 }: WrapProps & { size?: number }) {
  const t = useTheme();
  const edge = (to: 'bottom' | 'top') => ({ position: 'absolute' as const, left: 0, right: 0, height: size, [to === 'bottom' ? 'top' : 'bottom']: 0,
    [BG]: `linear-gradient(to ${to}, ${t.color.bg}, transparent)` });
  return (
    <View testID={testID} style={[style, { overflow: 'hidden' }]}>
      {children}
      <View pointerEvents="none" importantForAccessibility="no" style={edge('bottom')} />
      <View pointerEvents="none" importantForAccessibility="no" style={edge('top')} />
    </View>
  );
}

/* ---------- GlareHover ---------- */

/** A light sweeps across the card when it is pressed (the phone's version of a glare on hover). */
export function GlareHover({ testID, children, style, onPress, label }: WrapProps & { onPress?: () => void; label?: string }) {
  const t = useTheme();
  const r = useReducedMotion();
  const x = useRef(new Animated.Value(0)).current;
  const sweep = () => { if (r) { return; } x.setValue(0); Animated.timing(x, { toValue: 1, duration: 650, easing: EASING.standard, useNativeDriver: true }).start(); };
  return (
    <Pressable testID={testID} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label} onPressIn={sweep} onPress={onPress}
               style={[{ overflow: 'hidden', borderRadius: t.radius.card }, onPress ? { minHeight: t.minTouch, justifyContent: 'center' } : null, style]}>
      {children}
      <Animated.View pointerEvents="none" importantForAccessibility="no"
                     style={{ position: 'absolute', top: -20, bottom: -20, width: 80, left: 0, opacity: x.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] }),
                       [BG]: 'linear-gradient(to right, transparent, rgba(255, 255, 255, 0.45), transparent)',
                       transform: [{ rotate: '20deg' }, { translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-120, 520] }) }] }} />
    </Pressable>
  );
}

/* ---------- MagneticButton ---------- */

export interface MagneticButtonProps {
  testID?: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

/** A button that leans a little towards the finger while it is held, and springs back. */
export function MagneticButton({ testID, label, onPress, disabled }: MagneticButtonProps) {
  const t = useTheme();
  const r = useReducedMotion();
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const size = useRef({ w: 1, h: 1 });
  const latest = useRef({ r, onPress, disabled });
  latest.current = { r, onPress, disabled };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !latest.current.disabled,
    onPanResponderGrant: (e) => lean(e.nativeEvent.locationX, e.nativeEvent.locationY),
    onPanResponderMove: (e) => lean(e.nativeEvent.locationX, e.nativeEvent.locationY),
    onPanResponderRelease: (_, g) => { back(); if (Math.abs(g.dx) < 12 && Math.abs(g.dy) < 12) { latest.current.onPress(); } },
    onPanResponderTerminate: () => back(),
  })).current;
  function lean(x: number, y: number) {
    if (latest.current.r) { return; }
    pos.setValue({ x: ((x / size.current.w) - 0.5) * 10, y: ((y / size.current.h) - 0.5) * 8 });
  }
  function back() { Animated.spring(pos, { toValue: { x: 0, y: 0 }, friction: 4, useNativeDriver: true }).start(); }
  return (
    <Animated.View testID={testID} accessible accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
                   onAccessibilityTap={() => { if (!disabled) { onPress(); } }} {...pan.panHandlers}
                   onLayout={(e) => { size.current = { w: e.nativeEvent.layout.width || 1, h: e.nativeEvent.layout.height || 1 }; }}
                   style={{ minHeight: t.minTouch, paddingHorizontal: 24, borderRadius: 999, backgroundColor: t.color.primary, alignItems: 'center', justifyContent: 'center',
                     opacity: disabled ? 0.5 : 1, transform: pos.getTranslateTransform() }}>
      <Text style={{ color: t.color.onPrimary, fontSize: 15, fontWeight: '700' }}>{label}</Text>
    </Animated.View>
  );
}

/* ---------- HighlightBorder ---------- */

/** A border that glows softly while active (a field being listened to, a card waiting for the customer). */
export function HighlightBorder({ testID, children, style, active = true }: WrapProps & { active?: boolean }) {
  const t = useTheme();
  const glow = useCycle(1600, active, 0.5);
  return (
    <View testID={testID} style={[{ borderRadius: t.radius.card }, style]}>
      {children}
      {active ? (
        <Animated.View pointerEvents="none" importantForAccessibility="no"
                       style={[StyleSheet.absoluteFill, { borderRadius: t.radius.card, borderWidth: 2, borderColor: t.color.primary,
                         opacity: glow.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 1, 0.35] }) }]} />
      ) : null}
    </View>
  );
}

/* ---------- ClickBurst ---------- */

const RAYS = 8;

/** A small burst of dots from the centre on each press (a payment sent, a goal reached). */
export function ClickBurst({ testID, children, style, onPress, label }: WrapProps & { onPress?: () => void; label: string }) {
  const t = useTheme();
  const r = useReducedMotion();
  const v = useRef(new Animated.Value(1)).current;
  const fire = () => {
    onPress?.();
    if (r) { return; }
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 520, easing: EASING.standard, useNativeDriver: true }).start();
  };
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={fire}
               style={[{ minHeight: t.minTouch, alignItems: 'center', justifyContent: 'center' }, style]}>
      {children}
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        {Array.from({ length: RAYS }, (_, i) => {
          const a = (i / RAYS) * Math.PI * 2;
          return (
            <Animated.View key={i} style={{ position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: i % 2 ? t.color.primary : t.color.warning,
              opacity: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
              transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * 34] }) },
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * 34] }) }] }} />
          );
        })}
      </View>
    </Pressable>
  );
}

/* ---------- Marquee ---------- */

export interface MarqueeProps {
  testID?: string;
  /** What it says: rates, notices. Screen readers hear them all, once. */
  items: ReadonlyArray<string>;
  /** Points a second. */
  speed?: number;
}

/** A line of notices that runs across the screen; it stands still (and wraps) under reduced motion. */
export function Marquee({ testID, items, speed = 40 }: MarqueeProps) {
  const t = useTheme();
  const r = useReducedMotion();
  const [width, setWidth] = useState(0);
  const cycle = useCycle(Math.max(1000, (width / speed) * 1000), !r && width > 0);
  const row = (key: string) => (
    <View key={key} style={{ flexDirection: 'row' }} onLayout={key === 'a' ? (e) => setWidth(e.nativeEvent.layout.width) : undefined}>
      {items.map((x, i) => <Text key={i} style={{ fontSize: 14, color: t.color.textBody, paddingHorizontal: 16 }}>{x}  ·</Text>)}
    </View>
  );
  return (
    <View testID={testID} accessible accessibilityLabel={items.join('. ')} style={{ overflow: 'hidden', paddingVertical: 8, backgroundColor: t.color.surface2,
      borderRadius: t.radius.control }}>
      {r ? <Text style={{ fontSize: 14, color: t.color.textBody, paddingHorizontal: 12 }}>{items.join('  ·  ')}</Text> : (
        <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: cycle.interpolate({ inputRange: [0, 1], outputRange: [0, -width || -1] }) }] }}>
          {row('a')}{row('b')}
        </Animated.View>
      )}
    </View>
  );
}
