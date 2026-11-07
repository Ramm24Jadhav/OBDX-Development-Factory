/*
 * Micro interactions (the M2 "Micro interactions" category), our own code on React Native's Animated. Every gesture has
 * a screen reader way too (an action on the element), every control has its role and state, and under reduced motion
 * each shows its end state.
 */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from './Button';
import { formatAmount } from './TextField';
import { FieldProps, Option, options as toOptions, styles } from './field';
import { DURATION, Enter, Pop, Press, Shake, useCycle, useOpen, usePop, useProgress, useReducedMotion, useSlide } from './motion';
import { CodeBoxes, CodeBoxesProps, Tone, Touch, toneColors } from './parts';
import { useTheme } from './theme';

/* ---------- SlideToConfirm ---------- */

export interface ConfirmProps {
  testID?: string;
  /** What it does: "Slide to pay 1,250.00 USD". */
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
}

const KNOB = 52;

/** Drag the knob to the end to confirm (a payment); it springs back if let go early. Screen readers activate it. */
export function SlideToConfirm({ testID, label, onConfirm, disabled }: ConfirmProps) {
  const t = useTheme();
  const x = useRef(new Animated.Value(0)).current;
  const room = useRef(1);
  const latest = useRef({ onConfirm, disabled });
  latest.current = { onConfirm, disabled };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !latest.current.disabled,
    onPanResponderMove: (_, g) => x.setValue(Math.max(0, Math.min(g.dx, room.current))),
    onPanResponderRelease: (_, g) => {
      if (g.dx >= room.current * 0.9) {
        Animated.timing(x, { toValue: room.current, duration: DURATION.fast, useNativeDriver: true }).start();
        latest.current.onConfirm();
      } else {
        Animated.spring(x, { toValue: 0, friction: 6, useNativeDriver: true }).start();
      }
    },
  })).current;
  return (
    <View testID={testID} accessible accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
          accessibilityHint="Double-tap to confirm" accessibilityActions={[{ name: 'activate' }]}
          onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'activate' && !disabled) { onConfirm(); } }}
          onLayout={(e) => { room.current = Math.max(1, e.nativeEvent.layout.width - KNOB - 8); }}
          style={{ height: KNOB + 8, borderRadius: 999, backgroundColor: t.color.primarySoft, justifyContent: 'center', padding: 4, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ position: 'absolute', alignSelf: 'center', fontSize: 15, fontWeight: '600', color: t.color.primaryText }}>{label}</Text>
      <Animated.View {...pan.panHandlers} style={{ width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: t.color.primary, alignItems: 'center',
        justifyContent: 'center', transform: [{ translateX: x }] }}>
        <Text style={{ color: t.color.onPrimary, fontSize: 20 }}>→</Text>
      </Animated.View>
    </View>
  );
}

/* ---------- HoldToConfirm ---------- */

/** Press and hold until the bar fills to confirm; letting go early cancels. Screen readers activate it. */
export function HoldToConfirm({ testID, label, onConfirm, disabled, duration = 1200 }: ConfirmProps & { duration?: number }) {
  const t = useTheme();
  const fill = useRef(new Animated.Value(0)).current;
  const run = useRef<Animated.CompositeAnimation | null>(null);
  const start = () => {
    if (disabled) { return; }
    run.current = Animated.timing(fill, { toValue: 1, duration, easing: (n) => n, useNativeDriver: false });
    run.current.start(({ finished }) => { if (finished) { onConfirm(); fill.setValue(0); } });
  };
  const stop = () => { run.current?.stop(); Animated.timing(fill, { toValue: 0, duration: DURATION.fast, useNativeDriver: false }).start(); };
  return (
    <Press testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Double-tap to confirm, or press and hold"
           accessibilityState={{ disabled: !!disabled }} accessibilityActions={[{ name: 'activate' }]}
           onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'activate' && !disabled) { onConfirm(); } }}
           onPressIn={start} onPressOut={stop} disabled={disabled}
           style={{ minHeight: t.minTouch, borderRadius: t.radius.control, overflow: 'hidden', backgroundColor: t.color.surface3, justifyContent: 'center',
             alignItems: 'center', opacity: disabled ? 0.5 : 1 }}>
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: t.color.primary,
        width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
      <Text style={{ fontSize: 15, fontWeight: '700', color: t.color.text }}>{label}</Text>
    </Press>
  );
}

/* ---------- OtpSlots ---------- */

/** One-time code slots: each digit pops into its slot (the motion layer's code boxes). */
export function OtpSlots(props: CodeBoxesProps) {
  return <CodeBoxes {...props} />;
}

/* ---------- ReceiptTear ---------- */

/** A receipt that prints out of a slot, with a torn edge at the foot. */
export function ReceiptTear({ testID, children }: { testID?: string; children: ReactNode }) {
  const t = useTheme();
  const v = useProgress('print', 700);
  return (
    <View testID={testID} style={{ overflow: 'hidden' }}>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: t.color.text, marginHorizontal: 8 }} />
      <Animated.View style={{ marginHorizontal: 16, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-160, 0] }) }] }}>
        <View style={{ backgroundColor: t.color.surface, padding: 16, gap: 8, borderWidth: 1, borderBottomWidth: 0, borderColor: t.color.border }}>{children}</View>
        <View style={{ flexDirection: 'row', overflow: 'hidden', height: 8 }} importantForAccessibility="no">
          {Array.from({ length: 40 }, (_, i) => <View key={i} style={{ width: 12, height: 12, marginTop: -6, backgroundColor: t.color.surface, borderWidth: 1,
            borderColor: t.color.border, transform: [{ rotate: '45deg' }] }} />)}
        </View>
      </Animated.View>
    </View>
  );
}

/* ---------- SuccessCheck and StatusMark ---------- */

/** A tick that draws itself in a circle, with the outcome announced. */
export function SuccessCheck({ testID, label, size = 64 }: { testID?: string; label: string; size?: number }) {
  const t = useTheme();
  const ring = useProgress(label, DURATION.slow);
  const tick = useProgress(label, DURATION.slow, DURATION.slow, false);
  useEffect(() => { AccessibilityInfo.announceForAccessibility(label); }, [label]);
  return (
    <View testID={testID} accessible accessibilityRole="summary" accessibilityLabel={label} style={{ alignItems: 'center', gap: 8 }}>
      <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.color.success, transform: [{ scale: ring }] }}>
        <View style={{ position: 'absolute', left: size * 0.28, top: size * 0.5, width: size * 0.2, height: 4, overflow: 'hidden', transform: [{ rotate: '45deg' }] }}>
          <Animated.View style={{ height: 4, borderRadius: 2, backgroundColor: '#fff', width: tick.interpolate({ inputRange: [0, 0.4, 1], outputRange: ['0%', '100%', '100%'] }) }} />
        </View>
        <View style={{ position: 'absolute', left: size * 0.38, top: size * 0.44, width: size * 0.38, height: 4, overflow: 'hidden', transform: [{ rotate: '-50deg' }] }}>
          <Animated.View style={{ height: 4, borderRadius: 2, backgroundColor: '#fff', width: tick.interpolate({ inputRange: [0, 0.4, 1], outputRange: ['0%', '0%', '100%'] }) }} />
        </View>
      </Animated.View>
      <Text style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{label}</Text>
    </View>
  );
}

export type Status = 'pending' | 'success' | 'failed';

/** A mark that turns from waiting into a tick or a cross (a payment's state), and says the state in words. */
export function StatusMark({ testID, status, label }: { testID?: string; status: Status; label: string }) {
  const t = useTheme();
  const spin = useCycle(900, status === 'pending');
  const pop = usePop(status);
  const color = status === 'success' ? t.color.success : status === 'failed' ? t.color.danger : t.color.primary;
  const word = status === 'success' ? 'done' : status === 'failed' ? 'failed' : 'in progress';
  return (
    <View testID={testID} accessible accessibilityLabel={`${label}, ${word}`} accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Animated.View style={[{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
        borderWidth: 3, borderColor: color, ...(status === 'pending' ? { borderTopColor: 'transparent' } : { backgroundColor: color }) },
      status === 'pending' ? { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] } : pop]}>
        {status === 'pending' ? null : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{status === 'success' ? '✓' : '×'}</Text>}
      </Animated.View>
      <Text style={{ fontSize: 15, color: t.color.text }}>{label}</Text>
    </View>
  );
}

/* ---------- SwipeRow and SwipeToast ---------- */

export interface SwipeAction {
  id: string;
  label: string;
  tone?: Tone;
}

export interface SwipeRowProps {
  testID?: string;
  /** What the row is, read with its actions. */
  label: string;
  children: ReactNode;
  actions: ReadonlyArray<SwipeAction>;
  onAction: (id: string) => void;
}

const ACTION = 84;

/** A row (a transaction) that slides aside to show its actions; screen readers find the same actions on the row. */
export function SwipeRow({ testID, label, children, actions, onAction }: SwipeRowProps) {
  const t = useTheme();
  const x = useRef(new Animated.Value(0)).current;
  const width = actions.length * ACTION;
  const open = useRef(false);
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: (_, g) => x.setValue(Math.max(-width, Math.min(0, g.dx + (open.current ? -width : 0)))),
    onPanResponderRelease: (_, g) => { open.current = g.dx + (open.current ? -width : 0) < -width / 2; settle(); },
  })).current;
  function settle() { Animated.spring(x, { toValue: open.current ? -width : 0, friction: 7, useNativeDriver: true }).start(); }
  const act = (id: string) => { open.current = false; settle(); onAction(id); };
  return (
    <View testID={testID} style={{ overflow: 'hidden', borderRadius: t.radius.control }}>
      <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row' }} importantForAccessibility="no-hide-descendants">
        {actions.map((a) => (
          <Touch key={a.id} testID={testID ? `${testID}-${a.id}` : undefined} label={a.label} onPress={() => act(a.id)}
                 style={{ width: ACTION, alignItems: 'center', backgroundColor: toneColors(t, a.tone ?? 'info').line }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13.5 }}>{a.label}</Text>
          </Touch>
        ))}
      </View>
      <Animated.View {...pan.panHandlers} accessible accessibilityLabel={label} accessibilityHint="Actions available"
                     accessibilityActions={actions.map((a) => ({ name: a.id, label: a.label }))} onAccessibilityAction={(e) => act(e.nativeEvent.actionName)}
                     style={{ backgroundColor: t.color.surface, minHeight: t.minTouch + 8, justifyContent: 'center', paddingHorizontal: 14,
                       borderWidth: t.border, borderColor: t.color.border, borderRadius: t.radius.control, transform: [{ translateX: x }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

/** A message that can be swiped away (or closed with its button). */
export function SwipeToast({ testID, message, tone = 'info', onDismiss }: { testID?: string; message: string; tone?: Tone; onDismiss: () => void }) {
  const t = useTheme();
  const c = toneColors(t, tone);
  const x = useRef(new Animated.Value(0)).current;
  const gone = useRef(onDismiss);
  gone.current = onDismiss;
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10,
    onPanResponderMove: (_, g) => x.setValue(g.dx),
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > 100) { Animated.timing(x, { toValue: Math.sign(g.dx) * 500, duration: DURATION.base, useNativeDriver: true }).start(() => gone.current()); }
      else { Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(); }
    },
  })).current;
  return (
    <Enter effect="slide-down" testID={testID}>
      <Animated.View {...pan.panHandlers} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: t.color.surface,
        borderLeftWidth: 4, borderLeftColor: c.line, boxShadow: '0 4px 12px rgba(15, 23, 42, 0.12)',
        opacity: x.interpolate({ inputRange: [-300, 0, 300], outputRange: [0, 1, 0] }), transform: [{ translateX: x }] }}>
        <Text style={{ flex: 1, fontSize: 14, color: t.color.text }} accessibilityLiveRegion="polite">{message}</Text>
        <Touch testID={testID ? `${testID}-close` : undefined} label="Close the message" onPress={onDismiss} style={{ width: t.minTouch, alignItems: 'center' }}>
          <Text style={{ fontSize: 18, color: t.color.textMuted }}>×</Text>
        </Touch>
      </Animated.View>
    </Enter>
  );
}

/* ---------- BellToggle, SquishSwitch, FavouriteHeart ---------- */

export type ToggleProps = Pick<FieldProps<boolean>, 'label' | 'value' | 'onChange' | 'disabled'> & { testID?: string };

/** Alerts on or off: the bell rings when they are turned on. */
export function BellToggle({ testID, label, value, onChange, disabled }: ToggleProps) {
  const t = useTheme();
  const r = useReducedMotion();
  const ring = useRef(new Animated.Value(0)).current;
  const flip = () => {
    const next = !value;
    onChange?.(next);
    if (next && !r) {
      ring.setValue(0);
      Animated.timing(ring, { toValue: 1, duration: 600, easing: (n) => n, useNativeDriver: true }).start();
    }
  };
  return (
    <Press testID={testID} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: !!value, disabled: !!disabled }}
           disabled={disabled} onPress={flip} style={{ minHeight: t.minTouch, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Animated.Text style={{ fontSize: 24, opacity: value ? 1 : 0.45, transform: [{ rotate: ring.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1],
        outputRange: ['0deg', '18deg', '-14deg', '10deg', '-6deg', '0deg'] }) }] }}>🔔</Animated.Text>
      <Text style={{ fontSize: 15, color: t.color.text }}>{label}</Text>
      <Text style={{ fontSize: 13, color: t.color.textMuted }}>{value ? 'On' : 'Off'}</Text>
    </Press>
  );
}

/** A switch whose knob squashes as it travels. */
export function SquishSwitch({ testID, label, value, onChange, disabled }: ToggleProps) {
  const t = useTheme();
  const at = useSlide(value ? 1 : 0);
  const squash = at.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.35, 1] });
  return (
    <Press testID={testID} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: !!value, disabled: !!disabled }}
           disabled={disabled} onPress={() => onChange?.(!value)}
           style={{ minHeight: t.minTouch, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ fontSize: 15, color: t.color.text, flexShrink: 1 }}>{label}</Text>
      <View style={{ width: 52, height: 30, borderRadius: 15, padding: 3, backgroundColor: value ? t.color.primary : t.color.borderStrong }}>
        <Animated.View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.color.surface,
          transform: [{ translateX: at.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }) }, { scaleX: squash }] }} />
      </View>
    </Press>
  );
}

/** Mark a payee as a favourite: the heart pops and a ring spreads from it. */
export function FavouriteHeart({ testID, label, value, onChange, disabled }: ToggleProps) {
  const t = useTheme();
  const pop = usePop(value);
  const ring = useProgress(value, 500);
  return (
    <Press testID={testID} accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: !!value, disabled: !!disabled }}
           disabled={disabled} onPress={() => onChange?.(!value)} style={{ width: t.minTouch, height: t.minTouch, alignItems: 'center', justifyContent: 'center' }}>
      {value ? <Animated.View pointerEvents="none" style={{ position: 'absolute', width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: t.color.danger,
        opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.4] }) }] }} />
        : null}
      <Animated.Text style={[{ fontSize: 24, color: value ? t.color.danger : t.color.textMuted }, pop]}>{value ? '♥' : '♡'}</Animated.Text>
    </Press>
  );
}

/* ---------- JellyRadio, GlideSelect, RubberSegment ---------- */

export interface PickProps extends FieldProps<string> {
  options: ReadonlyArray<string | Option>;
}

function JellyDot({ on }: { on: boolean }) {
  const t = useTheme();
  const v = useProgress(on, 600, 0);
  const wobble = on ? { transform: [{ scaleX: v.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: [0.6, 1.25, 0.92, 1] }) },
    { scaleY: v.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: [0.6, 0.85, 1.1, 1] }) }] } : null;
  return (
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? t.color.primary : t.color.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
      {on ? <Animated.View style={[{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.color.primary }, wobble]} /> : null}
    </View>
  );
}

/** Radio buttons whose dot wobbles like jelly when chosen. */
export function JellyRadio({ testID, label, value, onChange, options, disabled, error }: PickProps) {
  const t = useTheme();
  const s = styles(t);
  return (
    <View testID={testID} style={s.field} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={s.label} importantForAccessibility="no">{label}</Text>
      <Shake error={error}>
        {toOptions(options).map((o) => (
          <Touch key={o.value} testID={testID ? `${testID}-option-${o.value}` : undefined} role="radio" label={o.label} selected={o.value === value}
                 disabled={disabled || o.disabled} onPress={() => onChange?.(o.value)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <JellyDot on={o.value === value} />
              <Text style={{ fontSize: 15, color: t.color.text }}>{o.label}</Text>
            </View>
          </Touch>
        ))}
      </Shake>
      {error ? <Text style={s.error} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}

/** A list of choices where a highlight glides to the one chosen. */
export function GlideSelect({ testID, label, value, onChange, options, disabled }: PickProps) {
  const t = useTheme();
  const s = styles(t);
  const list = toOptions(options);
  const at = list.findIndex((o) => o.value === value);
  const y = useSlide(Math.max(0, at) * t.minTouch);
  return (
    <View testID={testID} style={s.field} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={s.label} importantForAccessibility="no">{label}</Text>
      <View style={{ borderRadius: t.radius.card, backgroundColor: t.color.surface2, padding: 4 }}>
        {at >= 0 ? <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 4, right: 4, top: 4, height: t.minTouch, borderRadius: t.radius.control,
          backgroundColor: t.color.surface, borderWidth: 1, borderColor: t.color.primary, transform: [{ translateY: y }] }} /> : null}
        {list.map((o) => (
          <Touch key={o.value} testID={testID ? `${testID}-option-${o.value}` : undefined} role="radio" label={o.label} selected={o.value === value}
                 disabled={disabled || o.disabled} onPress={() => onChange?.(o.value)} style={{ height: t.minTouch, paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 15, color: o.value === value ? t.color.primaryText : t.color.text, fontWeight: o.value === value ? '700' : '400' }}>{o.label}</Text>
          </Touch>
        ))}
      </View>
    </View>
  );
}

/** A segmented choice whose marker stretches like rubber as it moves. */
export function RubberSegment({ testID, label, value, onChange, options, disabled }: PickProps) {
  const t = useTheme();
  const s = styles(t);
  const list = toOptions(options);
  const at = Math.max(0, list.findIndex((o) => o.value === value));
  const slide = useSlide(at);
  const stretch = useProgress(at, 420, 0, false);
  return (
    <View testID={testID} style={s.field} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={s.label} importantForAccessibility="no">{label}</Text>
      <View style={{ flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: t.track, borderWidth: t.look === 'brutal' ? t.border : 0, borderColor: t.line }}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Animated.View style={{ position: 'absolute', top: 3, bottom: 3, width: `${100 / list.length}%`, borderRadius: 999, backgroundColor: t.color.surface,
            left: slide.interpolate({ inputRange: [0, list.length], outputRange: ['0%', '100%'] }),
            transform: [{ scaleX: stretch.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 1.18, 1] }) }] }} />
        </View>
        {list.map((o) => (
          <Touch key={o.value} testID={testID ? `${testID}-option-${o.value}` : undefined} role="radio" label={o.label} selected={o.value === value}
                 disabled={disabled || o.disabled} onPress={() => onChange?.(o.value)} style={{ flex: 1, alignItems: 'center', minHeight: t.minTouch - 4 }}>
            <Text style={{ fontSize: 14, fontWeight: o.value === value ? '700' : '500', color: o.value === value ? t.color.primaryText : t.color.textBody }}>{o.label}</Text>
          </Touch>
        ))}
      </View>
    </View>
  );
}

/* ---------- ScrubField ---------- */

export interface ScrubFieldProps extends FieldProps<number> {
  min?: number;
  max: number;
  step?: number;
  currency?: string;
}

/** An amount changed by dragging across it (each step of the finger is one step of the amount); screen readers swipe up and down. */
export function ScrubField({ testID, label, value, onChange, min = 0, max, step = 10, currency, disabled, error, helpText }: ScrubFieldProps) {
  const t = useTheme();
  const s = styles(t);
  const at = value ?? min;
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n / step) * step));
  const startAt = useRef(at);
  const latest = useRef({ at, onChange, disabled });
  latest.current = { at, onChange, disabled };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !latest.current.disabled,
    onPanResponderGrant: () => { startAt.current = latest.current.at; },
    onPanResponderMove: (_, g) => { const n = clamp(startAt.current + Math.round(g.dx / 8) * step); if (n !== latest.current.at) { latest.current.onChange?.(n); } },
  })).current;
  const shown = `${currency ? `${currency} ` : ''}${formatAmount(at, currency)}`;
  return (
    <View testID={testID} style={s.field}>
      <Text style={s.label} importantForAccessibility="no">{label}</Text>
      <Shake error={error}>
        <View {...pan.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min, max, now: at, text: shown }}
              aria-valuemin={min} aria-valuemax={max} aria-valuenow={at} aria-valuetext={shown}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} accessibilityState={{ disabled: !!disabled }}
              onAccessibilityAction={(e) => onChange?.(clamp(at + (e.nativeEvent.actionName === 'increment' ? step : -step)))}
              style={{ minHeight: t.minTouch + 8, borderRadius: t.radius.control, borderWidth: t.border, borderColor: error ? t.color.danger : t.color.borderStrong,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, backgroundColor: t.color.surface }}>
          <Text style={{ color: t.color.textMuted, fontSize: 18 }}>‹</Text>
          <Pop on={at}><Text style={{ fontSize: 22, fontWeight: '700', color: t.color.text, fontVariant: ['tabular-nums'] }}>{shown}</Text></Pop>
          <Text style={{ color: t.color.textMuted, fontSize: 18 }}>›</Text>
        </View>
      </Shake>
      {error ? <Text style={s.error} accessibilityRole="alert">{error}</Text> : <Text style={s.help}>{helpText ?? 'Drag left or right to change it.'}</Text>}
    </View>
  );
}

/* ---------- BudgetGauge ---------- */

/** A half-circle gauge of a budget: the needle swings to what is used, and turns red past the limit. */
export function BudgetGauge({ testID, label, value, max, currency, size = 180 }: { testID?: string; label: string; value: number; max: number; currency?: string; size?: number }) {
  const t = useTheme();
  const share = max > 0 ? value / max : 0;
  const swing = useSlide(Math.min(1, share));
  const tone = share > 1 ? t.color.danger : share > 0.85 ? t.color.warning : t.color.primary;
  const text = `${formatAmount(value, currency)} of ${formatAmount(max, currency)}${currency ? ` ${currency}` : ''} used`;
  return (
    <View testID={testID} accessible accessibilityRole="progressbar" accessibilityLabel={`${label}, ${text}${share > 1 ? ', over the limit' : ''}`}
          accessibilityValue={{ min: 0, max, now: Math.min(value, max) }} style={{ alignItems: 'center', gap: 6 }}>
      <View style={{ width: size, height: size / 2, overflow: 'hidden' }}>
        <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 14, borderColor: t.color.surface3 }} />
        <Animated.View style={{ position: 'absolute', left: size / 2 - 2, bottom: 0, width: 4, height: size / 2 - 10, borderRadius: 2, backgroundColor: tone,
          transform: [{ translateY: (size / 2 - 10) / 2 }, { rotate: swing.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '90deg'] }) },
            { translateY: -(size / 2 - 10) / 2 }] }} />
      </View>
      <Text style={{ fontSize: 14, fontWeight: '700', color: t.color.text }}>{label}</Text>
      <Text style={{ fontSize: 13, color: share > 1 ? t.color.dangerText : t.color.textMuted }}>{text}</Text>
    </View>
  );
}

/* ---------- PeekRating ---------- */

function Star({ n, on, onPress, testID }: { n: number; on: boolean; onPress: () => void; testID?: string }) {
  const t = useTheme();
  const lift = useSlide(on ? 1 : 0);
  return (
    <Touch testID={testID} role="radio" label={`${n} star${n > 1 ? 's' : ''}`} selected={on} onPress={onPress} style={{ width: t.minTouch, alignItems: 'center' }}>
      <Animated.Text style={{ fontSize: 28, color: on ? t.color.warning : t.color.borderStrong,
        transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }}>★</Animated.Text>
    </Touch>
  );
}

/** Stars that peek up as they are chosen. */
export function PeekRating({ testID, label, value, onChange }: Pick<FieldProps<number | null>, 'label' | 'value' | 'onChange'> & { testID?: string }) {
  return (
    <View testID={testID} accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row' }}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} testID={testID ? `${testID}-${n}` : undefined} n={n} on={!!value && n <= value} onPress={() => onChange?.(n)} />)}
    </View>
  );
}

/* ---------- WarmTooltip ---------- */

/** A tooltip that grows out of its button in a warm bubble (phones have no hover; the button opens it). */
export function WarmTooltip({ testID, label, text }: { testID?: string; label: string; text: string }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const grow = useOpen(open, 'dialog');
  return (
    <View testID={testID} style={{ alignItems: 'flex-start' }}>
      <Touch testID={testID ? `${testID}-button` : undefined} label={`About ${label}`} selected={open}
             onPress={() => { if (!open) { AccessibilityInfo.announceForAccessibility(text); } setOpen(!open); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 14, color: t.color.textBody }}>{label}</Text>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: t.color.warningSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: t.color.warningText }}>?</Text>
        </View>
      </Touch>
      {open ? (
        <Animated.View style={[{ maxWidth: 280, padding: 12, borderRadius: 14, backgroundColor: t.color.warningSoft, borderWidth: 1, borderColor: t.color.warning }, grow]}>
          <Text style={{ fontSize: 13.5, color: t.color.text }}>{text}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

/* ---------- PromptBar, VoicePill, CallChip ---------- */

export interface PromptBarProps {
  testID?: string;
  label?: string;
  value: string;
  onChange: (text: string) => void;
  onSubmit: (text: string) => void;
  /** The assistant is answering: the border glows and Send waits. */
  busy?: boolean;
  placeholder?: string;
}

/** The assistant's question bar: its border glows while it is in use or answering. */
export function PromptBar({ testID, label = 'Ask the assistant', value, onChange, onSubmit, busy, placeholder = 'Ask about your accounts' }: PromptBarProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const glow = useCycle(1600, !!busy || focused, 0.5);
  const send = () => { if (value.trim() && !busy) { onSubmit(value.trim()); } };
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 4, minHeight: t.minTouch + 8, borderRadius: 999,
      backgroundColor: t.fill, borderWidth: t.border, borderColor: t.line }}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 999, borderWidth: 2, borderColor: t.color.primary,
        opacity: busy || focused ? glow.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 1, 0.35] }) : 0 }]} />
      <TextInput testID={testID ? `${testID}-input` : undefined} style={{ flex: 1, minHeight: t.minTouch, fontSize: 16, color: t.color.text, paddingVertical: 10 }} value={value}
                 onChangeText={onChange} placeholder={placeholder} placeholderTextColor={t.color.textMuted} accessibilityLabel={label} returnKeyType="send"
                 onSubmitEditing={send} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
      <Button testID={testID ? `${testID}-send` : undefined} label="Send" busy={busy} disabled={!value.trim()} onAction={send} />
    </View>
  );
}

/** The voice button of the assistant: a pill whose level bars move while it listens. */
export function VoicePill({ testID, listening, onToggle }: { testID?: string; listening: boolean; onToggle: () => void }) {
  const t = useTheme();
  const v = useCycle(700, listening);
  return (
    <Press testID={testID} accessibilityRole="button" accessibilityLabel={listening ? 'Stop listening' : 'Speak to the assistant'} accessibilityState={{ selected: listening }}
           onPress={onToggle} style={{ minHeight: t.minTouch, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, borderRadius: 999,
             backgroundColor: listening ? t.color.primary : t.color.primarySoft }}>
      <Text style={{ fontSize: 18 }}>🎙</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 20 }} importantForAccessibility="no-hide-descendants">
        {[0, 1, 2, 3, 4].map((i) => (
          <Animated.View key={i} style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: listening ? t.color.onPrimary : t.color.primaryText,
            transform: [{ scaleY: listening ? v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3 + (i % 3) * 0.2, 1 - (i % 2) * 0.4, 0.3 + (i % 3) * 0.2] }) : 0.3 }] }} />
        ))}
      </View>
      <Text style={{ fontSize: 14, fontWeight: '700', color: listening ? t.color.onPrimary : t.color.primaryText }}>{listening ? 'Listening' : 'Speak'}</Text>
    </Press>
  );
}

/** A chip to call the bank (or the relationship manager), its phone ringing softly. */
export function CallChip({ testID, label, number, onCall }: { testID?: string; label: string; number: string; onCall: () => void }) {
  const t = useTheme();
  const ring = useCycle(2000);
  return (
    <Press testID={testID} accessibilityRole="button" accessibilityLabel={`Call ${label}, ${number}`} onPress={onCall}
           style={{ minHeight: t.minTouch, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 999,
             borderWidth: 1, borderColor: t.color.success, backgroundColor: t.color.successSoft }}>
      <Animated.Text style={{ fontSize: 16, transform: [{ rotate: ring.interpolate({ inputRange: [0, 0.05, 0.1, 0.15, 0.2, 1], outputRange: ['0deg', '14deg', '-12deg', '8deg', '0deg', '0deg'] }) }] }}>
        📞
      </Animated.Text>
      <Text style={{ fontSize: 14, fontWeight: '700', color: t.color.successText }}>{label}</Text>
    </Press>
  );
}

/* ---------- LatticeLoader ---------- */

/** A loader of nine squares that light in a diagonal wave; still, and still announced, under reduced motion. */
export function LatticeLoader({ testID, label = 'Loading' }: { testID?: string; label?: string }) {
  const t = useTheme();
  const v = useCycle(1200, true, 0.5);
  return (
    <View testID={testID} accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}
          style={{ width: 42, flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
      {Array.from({ length: 9 }, (_, i) => {
        const at = ((i % 3) + Math.floor(i / 3)) / 5;
        return <Animated.View key={i} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: t.color.primary,
          opacity: v.interpolate({ inputRange: [0, at, Math.min(1, at + 0.2), 1], outputRange: [0.25, 0.25, 1, 0.25], extrapolate: 'clamp' }) }} />;
      })}
    </View>
  );
}
