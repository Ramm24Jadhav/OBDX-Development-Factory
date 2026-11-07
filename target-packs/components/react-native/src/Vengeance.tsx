/*
 * Showcase components ported from Vengeance UI (https://github.com/Ashutoshx7/VengenceUI): the share sheet, glass dock,
 * aurora hero, reveal loader, border beam and masked avatars, rewritten on React Native's Animated, Share and Linking and
 * the pack's own parts (no framer-motion or GSAP). The web packs' Copy is the system share here (its sheet has Copy).
 * Each works with a screen reader and shows its end state under reduced motion.
 *
 * MIT License
 *
 * Copyright (c) 2025-2026 Ashutoshx7
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
 * Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
 * WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Linking, Share, StyleSheet, Text, View } from 'react-native';

import { Avatar } from './G1';
import { BG, DURATION, Enter, Press, useCycle, useReducedMotion, useSlide } from './motion';
import { Sheet, Touch, panel } from './parts';
import { useTheme } from './theme';

const decor = { pointerEvents: 'none' as const, importantForAccessibility: 'no-hide-descendants' as const, accessibilityElementsHidden: true };

/* ---------- ShareSheet ---------- */

export type ShareChannel = 'email' | 'sms' | 'system';
const safeUrl = (u?: string) => (u && /^https?:\/\//i.test(u) ? u : '');
/** The text and link as one message. */
export const shareBody = (text: string, url?: string) => [text, safeUrl(url)].filter(Boolean).join('\n');

export interface ShareSheetProps { testID?: string; label?: string; heading?: string; text: string; url?: string; onShare?: (channel: ShareChannel) => void }

/** A sheet of ways to share: email, messages and the device's own share. */
export function ShareSheet({ testID, label = 'Share', heading = 'Share', text, url, onShare }: ShareSheetProps) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const body = shareBody(text, url);
  const done = (c: ShareChannel) => { setOpen(false); onShare?.(c); };
  const go = (c: 'email' | 'sms') => {
    const q = encodeURIComponent(body);
    Linking.openURL(c === 'email' ? `mailto:?subject=${encodeURIComponent(heading)}&body=${q}` : `sms:?body=${q}`).then(() => done(c), () => undefined);
  };
  const system = () => Share.share({ title: heading, message: body, url: safeUrl(url) || undefined }).then((r) => { if (r.action === Share.sharedAction) { done('system'); } }, () => undefined);
  const dests: [ShareChannel, string, string, () => void][] = [['email', 'Email', '✉', () => go('email')], ['sms', 'Messages', '✆', () => go('sms')], ['system', 'More', '⋯', system]];
  return (
    <View testID={testID}>
      <Touch label={label} onPress={() => setOpen(true)} style={{ alignSelf: 'flex-start', paddingHorizontal: 18, borderRadius: t.radius.control, borderWidth: 1, borderColor: t.color.borderStrong }}>
        <Text style={{ color: t.color.primaryText, fontWeight: '600' }}>⇪ {label}</Text>
      </Touch>
      <Sheet testID={testID ? `${testID}-sheet` : undefined} open={open} title={heading} onClose={() => setOpen(false)}>
        <Text style={{ color: t.color.textMuted }}>{body}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingTop: 8 }}>
          {dests.map(([c, name, icon, act]) => (
            <Touch key={c} testID={testID ? `${testID}-${c}` : undefined} label={name} onPress={act} style={{ alignItems: 'center', gap: 6, minWidth: 72 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c === 'system' ? t.color.surface3 : t.color.primarySoft }}>
                <Text style={{ fontSize: 18, color: t.color.primaryText }}>{icon}</Text>
              </View>
              <Text style={{ fontSize: 12, color: t.color.text }}>{name}</Text>
            </Touch>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

/* ---------- GlassDock ---------- */

export interface DockEntry { id: string; label: string; icon?: string }
export interface GlassDockProps { testID?: string; label?: string; items: ReadonlyArray<DockEntry>; value?: string; onAction?: (id: string) => void }

function GlassDockItem({ item, on, held, onHold, onPress, testID }: { item: DockEntry; on: boolean; held: boolean; onHold: (held: boolean) => void; onPress: () => void; testID?: string }) {
  const t = useTheme();
  const v = useSlide(held || on ? 1 : 0);
  return (
    <Press testID={testID} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: on }} onPress={onPress}
           onPressIn={() => onHold(true)} onPressOut={() => onHold(false)} style={{ minWidth: t.minTouch, minHeight: t.minTouch, alignItems: 'center', justifyContent: 'center' }}>
      {held ? <View {...decor} style={{ position: 'absolute', bottom: t.minTouch + 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: t.color.text }}>
        <Text style={{ color: t.color.surface, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{item.label}</Text></View> : null}
      <Animated.View style={{ transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }] }}>
        <Text style={{ fontSize: 22, color: on ? t.color.primaryText : t.color.textMuted }}>{item.icon ?? item.label.charAt(0)}</Text>
      </Animated.View>
    </Press>
  );
}

/** A frosted dock of shortcuts; the one under the finger lifts and shows its name above it. */
export function GlassDock({ testID, label = 'Shortcuts', items, value, onAction }: GlassDockProps) {
  const t = useTheme();
  const dark = t.color.bg.startsWith('#0');
  const [held, setHeld] = useState<string | null>(null);
  return (
    <View testID={testID} accessibilityLabel={label} style={{ flexDirection: 'row', alignSelf: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
      borderColor: dark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.7)', backgroundColor: dark ? 'rgba(20, 30, 43, 0.72)' : 'rgba(255, 255, 255, 0.8)',
      boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)' }}>
      {items.map((o) => <GlassDockItem key={o.id} testID={testID ? `${testID}-${o.id}` : undefined} item={o} on={o.id === value} held={held === o.id}
        onHold={(h) => setHeld(h ? o.id : null)} onPress={() => onAction?.(o.id)} />)}
    </View>
  );
}

/* ---------- AuroraHero ---------- */

export interface AuroraHeroProps { testID?: string; heading: string; text?: string; still?: boolean; children?: ReactNode }

/** A hero with drifting bands of light behind fluted glass and the heading on top. */
export function AuroraHero({ testID, heading, text, still, children }: AuroraHeroProps) {
  const t = useTheme();
  const v = useCycle(30000, !still);
  return (
    <View testID={testID} style={{ borderRadius: t.radius.card, overflow: 'hidden', backgroundColor: t.color.surface, minHeight: 200, justifyContent: 'center' }}>
      <Animated.View {...decor} style={{ position: 'absolute', top: 0, bottom: 0, left: '-50%', width: '200%', opacity: 0.55,
        [BG]: `repeating-linear-gradient(100deg, ${t.color.primary} 0%, ${t.color.info} 7%, ${t.color.successSoft} 12%, ${t.color.primary} 18%)`,
        transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, -120] }) }] }} />
      <View {...decor} style={[StyleSheet.absoluteFill, { [BG]: `repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.16) 0px, rgba(255, 255, 255, 0) 2px, rgba(255, 255, 255, 0) 14px)` }]} />
      <View {...decor} style={[StyleSheet.absoluteFill, { [BG]: `linear-gradient(200deg, transparent 20%, ${t.color.surface} 75%)` }]} />
      <View style={{ padding: 24, gap: 8 }}>
        <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '800', color: t.color.text }}>{heading}</Text>
        {text ? <Text style={{ fontSize: 16, color: t.color.textBody }}>{text}</Text> : null}
        {children}
      </View>
    </View>
  );
}

/* ---------- RevealLoader ---------- */

export type RevealOrder = 'start' | 'end' | 'center' | 'edges';
export type RevealExit = 'down' | 'up' | 'fade' | 'shrink';
const BARS = 10;
/** The stagger step of bar i for an order (0 to 9). */
export const revealStep = (i: number, order: RevealOrder = 'start') =>
  order === 'end' ? BARS - 1 - i : order === 'center' ? Math.floor(Math.abs(i - (BARS - 1) / 2)) : order === 'edges' ? 4 - Math.floor(Math.abs(i - (BARS - 1) / 2)) : i;

export interface RevealLoaderProps { testID?: string; text?: string; loading?: boolean; order?: RevealOrder; exit?: RevealExit; onComplete?: () => void; children?: ReactNode }

/** A curtain of bars and a word over the content; when loading ends the bars lift one after another. */
export function RevealLoader({ testID, text = 'Loading', loading = true, order = 'start', exit = 'down', onComplete, children }: RevealLoaderProps) {
  const t = useTheme();
  const r = useReducedMotion();
  const bars = useRef(Array.from({ length: BARS }, () => new Animated.Value(0))).current;
  const [gone, setGone] = useState(!loading);
  const done = useRef(onComplete);
  done.current = onComplete;
  useEffect(() => {
    if (loading) { bars.forEach((b) => b.setValue(0)); setGone(false); return undefined; }
    const finish = () => { setGone(true); done.current?.(); };
    if (r) { finish(); return undefined; }
    const runs = bars.map((b, i) => Animated.sequence([Animated.delay(revealStep(i, order) * 80), Animated.timing(b, { toValue: 1, duration: DURATION.slow + 180, useNativeDriver: true })]));
    const all = Animated.parallel(runs);
    all.start(({ finished }) => { if (finished) { finish(); } });
    return () => all.stop();
  }, [loading, r, order, bars]);
  const moved = (b: Animated.Value) => exit === 'fade' ? { opacity: b.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }
    : exit === 'shrink' ? { transform: [{ scaleY: b.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }] }
    : { transform: [{ translateY: b.interpolate({ inputRange: [0, 1], outputRange: ['0%', exit === 'up' ? '-100%' : '100%'] }) }] };
  return (
    <View testID={testID} style={{ overflow: 'hidden' }}>
      <View accessibilityElementsHidden={!gone} importantForAccessibility={gone ? 'auto' : 'no-hide-descendants'}>{children}</View>
      {gone ? null : (
        <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]} accessible accessibilityRole="progressbar" accessibilityLabel={text} accessibilityState={{ busy: true }}>
          {bars.map((b, i) => <Animated.View key={i} {...decor} style={[{ flex: 1, backgroundColor: t.color.primary }, moved(b)]} />)}
          <View {...decor} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 32, fontWeight: '800', letterSpacing: 2, color: t.color.onPrimary, opacity: loading ? 1 : 0 }}>{text.toUpperCase()}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

/* ---------- BorderBeam ---------- */

export interface BorderBeamProps { testID?: string; duration?: number; still?: boolean; children?: ReactNode }

/** A card with a light that runs round its border, to draw the eye to an offer or a pending task. */
export function BorderBeam({ testID, duration = 8, still, children }: BorderBeamProps) {
  const t = useTheme();
  const lap = Math.min(Math.max(Math.round(duration), 2), 20);
  const v = useCycle(lap * 1000, !still);
  return (
    <View testID={testID} style={{ borderRadius: t.radius.card, overflow: 'hidden', padding: 2, backgroundColor: t.color.border }}>
      <Animated.View {...decor} style={{ position: 'absolute', width: '200%', aspectRatio: 1, left: '-50%', top: '-100%',
        [BG]: `linear-gradient(90deg, transparent 40%, ${t.color.primary} 50%, ${t.color.info} 55%, transparent 60%)`,
        transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }} />
      <View style={[panel(t), { borderWidth: 0, borderRadius: Math.max(t.radius.card - 2, 0) }]}>{children}</View>
    </View>
  );
}

/* ---------- MaskedAvatars ---------- */

export interface Person { name: string; src?: string }
export interface MaskedAvatarsProps { testID?: string; label?: string; people: ReadonlyArray<Person>; max?: number }

/** People as overlapping avatars, each ringed in the surface colour where the next one sits; a press shows the name. */
export function MaskedAvatars({ testID, label = 'People', people, max = 5 }: MaskedAvatarsProps) {
  const t = useTheme();
  const [shownName, setShownName] = useState<string | null>(null);
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const ring = { borderRadius: 24, borderWidth: 3, borderColor: t.color.surface };
  return (
    <Enter testID={testID} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((p, i) => (
        <Press key={`${p.name}-${i}`} accessibilityRole="button" accessibilityLabel={p.name} onPress={() => setShownName(shownName === p.name ? null : p.name)}
               style={[ring, { marginLeft: i ? -14 : 0, zIndex: shownName === p.name ? 10 : shown.length - i, minHeight: t.minTouch, justifyContent: 'center' }]}>
          <Avatar name={p.name} src={p.src} />
          {shownName === p.name ? <View {...decor} style={{ position: 'absolute', bottom: t.minTouch + 4, alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: t.color.text }}>
            <Text style={{ color: t.color.surface, fontSize: 12 }} numberOfLines={1}>{p.name}</Text></View> : null}
        </Press>
      ))}
      {rest > 0 ? <View accessible accessibilityLabel={`and ${rest} more`} style={[ring, { marginLeft: -14, width: 46, height: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: t.color.surface3 }]}>
        <Text style={{ fontWeight: '700', color: t.color.text }}>+{rest}</Text></View> : null}
    </Enter>
  );
}
