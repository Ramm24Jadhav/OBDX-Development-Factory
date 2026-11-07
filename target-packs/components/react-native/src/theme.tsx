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
  /** Corner radius for controls and for cards. */
  radius: { control: number; card: number };
  /** Field and button border width, and whether controls have a shadow. */
  border: number;
  shadow: boolean;
  /** Controls are at least this tall, so they are easy to touch (WCAG 2.5.8 asks 24; 44 follows the platforms). */
  minTouch: number;
  /** Pressing a button scales it a little when the style asks for it. */
  pressScale: number;
  look: NonNullable<ComponentStyle['look']>;
  /** Liquid glass (glass.json): the translucent fill and lit rim of controls and cards; null for the other looks or when the phone asks for less transparency. */
  glass: { fill: string; rim: string; tint: 'light' | 'dark' } | null;
  /** The click and entrance effects of the component style (see motion.tsx); none when the style sets none. */
  motion: { click: 'press' | 'ripple' | 'bounce' | 'none'; scroll: 'fadeup' | 'scale' | 'slide' | 'blur' | 'none' };
  /** The variant a component was given (variants.tsx): its kind and id. */
  variant?: { kind: string; id: string };
}

/** Builds the theme from the bank tokens, the bank's brand colour and the component style. */
export function makeTheme(style: ComponentStyle = {}, brand?: string, reduceTransparency = false): Theme {
  const look = style.look ?? 'elevated';
  const color: Colors = { ...lightTokens.color, ...(style.mode === 'dark' ? darkColors : {}) } as Colors;
  if (look === 'redwood') { color.primary = '#c74634'; color.primaryText = '#a33b2b'; }
  if (brand) { color.primary = brand; }
  const radius = look === 'pill' ? { control: 999, card: 20 } : look === 'brutal' ? { control: 4, card: 4 } : look === 'redwood' ? { control: 6, card: 8 }
    : { control: 10, card: 14 };
  return {
    color, space: lightTokens.space, font: lightTokens.font, radius,
    border: look === 'brutal' ? 2 : look === 'outline' ? 1.5 : 1,
    shadow: look === 'elevated' || look === 'vivid',
    minTouch: 48,
    pressScale: style.motion?.click === 'press' || style.motion?.click === 'bounce' ? 0.97 : 1,
    look,
    // the fill and rim; GlassBlur adds expo-blur's frost behind them where the app has it
    glass: look !== 'liquid' || reduceTransparency ? null : style.mode === 'dark' ? { fill: 'rgba(40, 40, 40, 0.62)', rim: 'rgba(255, 255, 255, 0.13)', tint: 'dark' }
      : { fill: 'rgba(255, 255, 255, 0.6)', rim: 'rgba(255, 255, 255, 0.3)', tint: 'light' },
    motion: { click: style.motion?.click ?? 'none', scroll: style.motion?.scroll ?? 'none' },
  };
}

export const ThemeContext = createContext<Theme>(makeTheme());

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
