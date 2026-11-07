import { ComponentType, ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, StyleSheet, ViewStyle } from 'react-native';

import { darkColors, lightTokens } from './tokens';

/** The component style saved in the Component factory (the same values as the web packs). */
export interface ComponentStyle {
  look?: 'elevated' | 'soft' | 'glass' | 'outline' | 'vivid' | 'pill' | 'brutal' | 'redwood' | 'liquid';
  /** Phones have no hover; press and the entrance animation are used. */
  motion?: { click?: 'press' | 'ripple' | 'bounce'; scroll?: 'fadeup' | 'scale' | 'slide' | 'blur' };
  mode?: 'light' | 'dark';
}

type Colors = { -readonly [K in keyof typeof lightTokens.color]: string };

export interface Theme {
  color: Colors;
  space: typeof lightTokens.space;
  font: typeof lightTokens.font;
  /** Corner radius for single-line controls, cards, small marks (check boxes) and overlays (dialogs, sheets). */
  radius: { control: number; card: number; small: number; overlay: number };
  /** Border width, and whether surfaces have a shadow (elevation() draws it). */
  border: number;
  shadow: boolean;
  /*
   * The shared settings a design sets, the same as the web packs' (target-packs/components/styles/README.md): every
   * component reads these, not fixed values, so picking a design changes every component.
   * line: a card's or panel's edge; lineStrong: a control's edge; rule: separators; fill: controls; card: cards and
   * panels; raised: dialogs, sheets, toasts; track: recessed tracks (tabs, bars); pad, padCard: side padding of a control and of a card.
   */
  line: string; lineStrong: string; rule: string;
  fill: string; card: string; raised: string; track: string;
  weight: '600' | '700'; weightTitle: '600' | '700' | '800';
  /** The call to action: its fill, text and edge (Outline's is hollow). */
  cta: { bg: string; text: string; border: string };
  pad: number; padCard: number;
  /** The shadow of a surface at a height (1 controls and tiles, 2 cards, 3 dialogs); empty when the design is flat. */
  elevation: (level: 1 | 2 | 3) => ViewStyle;
  /** Controls are at least this tall, so they are easy to touch (WCAG 2.5.8 asks 24; 44 follows the platforms). */
  minTouch: number;
  /** Pressing a button scales it a little when the style asks for it. */
  pressScale: number;
  look: NonNullable<ComponentStyle['look']>;
  /** Liquid glass (glass.json): the translucent fill and lit rim of controls and cards; null for the other looks or when the phone asks for less transparency. */
  glass: { fill: string; rim: string; tint: 'light' | 'dark' } | null;
  /** The click and entrance effects of the component style (see motion.tsx); none when the style sets none. */
  motion: { click: 'press' | 'ripple' | 'bounce' | 'none'; scroll: 'fadeup' | 'scale' | 'slide' | 'blur' | 'none' };
}

/** Builds the theme from the bank tokens, the bank's brand colour and the component style. */
export function makeTheme(style: ComponentStyle = {}, brand?: string, reduceTransparency = false): Theme {
  const look = style.look ?? 'elevated';
  const color: Colors = { ...lightTokens.color, ...(style.mode === 'dark' ? darkColors : {}) } as Colors;
  if (look === 'redwood') { color.primary = '#ad3c2c'; color.primaryText = '#8f3224'; }
  if (brand) { color.primary = brand; }
  const c = color;
  const radius = look === 'pill' ? { control: 999, card: 22, small: 6, overlay: 28 } : look === 'brutal' ? { control: 4, card: 6, small: 2, overlay: 8 }
    : look === 'redwood' ? { control: 6, card: 8, small: 3, overlay: 10 } : look === 'soft' ? { control: 12, card: 18, small: 7, overlay: 22 }
    : look === 'glass' || look === 'vivid' ? { control: 12, card: 18, small: 6, overlay: 24 } : look === 'liquid' ? { control: 10, card: 20, small: 6, overlay: 26 }
    : { control: 10, card: 14, small: 6, overlay: 18 };
  const ink = look === 'brutal' ? c.text : null;
  const glassy = (a: number) => (look === 'glass' ? alpha(c.surface, a) : c.surface);
  const shadowColor = look === 'vivid' ? c.primary : '#0f172a';
  // [offset y, blur, opacity] per height; Neo-brutalist draws a hard offset in the text colour instead
  const soft: Record<1 | 2 | 3, [number, number, number]> = look === 'redwood' ? { 1: [1, 1, 0.08], 2: [2, 6, 0.1], 3: [10, 24, 0.16] }
    : look === 'soft' ? { 1: [2, 8, 0.05], 2: [4, 18, 0.08], 3: [16, 40, 0.12] } : { 1: [1, 2, 0.06], 2: [4, 14, 0.08], 3: [18, 40, 0.16] };
  const flat = look === 'outline' || look === 'liquid';
  const elevation = (level: 1 | 2 | 3): ViewStyle => ink
    ? { shadowColor: ink, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: [3, 4, 6][level - 1], height: [3, 4, 6][level - 1] }, elevation: 0 }
    : flat && level < 3 ? {}
    : { shadowColor, shadowOpacity: soft[level][2], shadowRadius: soft[level][1], shadowOffset: { width: 0, height: soft[level][0] }, elevation: level };
  return {
    color, space: lightTokens.space, font: lightTokens.font, radius,
    border: look === 'brutal' ? 2 : look === 'outline' ? 1.5 : 1,
    shadow: !flat,
    line: ink ?? (look === 'soft' ? 'transparent' : look === 'glass' ? alpha(c.text, 0.12) : look === 'outline' ? c.borderStrong : c.border),
    lineStrong: ink ?? (look === 'soft' ? 'transparent' : c.borderStrong),
    rule: ink ?? (look === 'soft' ? c.surface3 : c.border),
    fill: look === 'soft' ? c.surface2 : glassy(0.62), card: glassy(0.58), raised: glassy(0.8),
    track: look === 'brutal' ? c.surface : look === 'vivid' ? mix(c.primary, c.surface3, 0.08) : look === 'redwood' ? mix(c.primary, c.surface3, 0.05) : c.surface3,
    weight: look === 'brutal' ? '700' : '600', weightTitle: look === 'brutal' || look === 'vivid' ? '800' : look === 'redwood' || look === 'soft' ? '600' : '700',
    cta: look === 'outline' ? { bg: 'transparent', text: c.primaryText, border: c.primary } : { bg: c.primary, text: c.onPrimary, border: ink ?? 'transparent' },
    pad: look === 'pill' ? 18 : 14, padCard: look === 'pill' ? 20 : look === 'redwood' ? 16 : 18,
    elevation,
    minTouch: 48,
    pressScale: style.motion?.click === 'press' || style.motion?.click === 'bounce' ? 0.97 : 1,
    look,
    // the fill and rim; GlassBlur adds expo-blur's frost behind them where the app has it
    glass: look !== 'liquid' || reduceTransparency ? null : style.mode === 'dark' ? { fill: 'rgba(40, 40, 40, 0.62)', rim: 'rgba(255, 255, 255, 0.13)', tint: 'dark' }
      : { fill: 'rgba(255, 255, 255, 0.6)', rim: 'rgba(255, 255, 255, 0.3)', tint: 'light' },
    motion: { click: style.motion?.click ?? 'none', scroll: style.motion?.scroll ?? 'none' },
  };
}

/** A #rrggbb colour at an opacity, as rgba(). */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Two #rrggbb colours mixed, `share` of the first (like CSS color-mix). */
export function mix(a: string, b: string, share: number): string {
  const x = parseInt(a.slice(1, 7), 16), y = parseInt(b.slice(1, 7), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) * share + ((y >> s) & 255) * (1 - share));
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}

const ThemeContext = createContext<Theme>(makeTheme());

/** Gives every component below it the bank's theme. Without it the components use the neutral bank tokens. */
export function ThemeProvider({ style, brand, children }: { style?: ComponentStyle; brand?: string; children: ReactNode }) {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceTransparencyEnabled?.().then(setSolid, () => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', setSolid);
    return () => sub?.remove();
  }, []);
  const theme = useMemo(() => makeTheme(style, brand, solid), [style, brand, solid]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

type BlurProps = { intensity?: number; tint?: 'light' | 'dark'; style?: ViewStyle; pointerEvents?: 'none' };
let blurView: ComponentType<BlurProps> | null | undefined;

/** expo-blur's BlurView, or null where the app has no expo-blur (a bare React Native app, the web gallery): then the fill and rim stay alone. */
function loadBlur(): ComponentType<BlurProps> | null {
  if (blurView === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional: Metro and jest resolve it if installed
    try { blurView = (require('expo-blur') as { BlurView?: ComponentType<BlurProps> }).BlurView ?? null; } catch { blurView = null; }
  }
  return blurView;
}

/** Liquid glass's frost: a BlurView filling its surface, behind the content. Put it first in a surface with overflow hidden; nothing off liquid. */
export function GlassBlur() {
  const t = useTheme();
  const Blur = t.glass ? loadBlur() : null;
  return Blur ? <Blur intensity={20} tint={t.glass!.tint} style={StyleSheet.absoluteFill as ViewStyle} pointerEvents="none" /> : null;
}
