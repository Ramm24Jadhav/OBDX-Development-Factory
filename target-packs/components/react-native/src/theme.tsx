import { ReactNode, createContext, useContext, useMemo } from 'react';

import { darkColors, lightTokens } from './tokens';

/** The component style saved in the Component factory (the same values as the web packs). */
export interface ComponentStyle {
  look?: 'elevated' | 'soft' | 'glass' | 'outline' | 'vivid' | 'pill' | 'brutal' | 'redwood';
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
  /** The click and entrance effects of the component style (see motion.tsx); none when the style sets none. */
  motion: { click: 'press' | 'ripple' | 'bounce' | 'none'; scroll: 'fadeup' | 'scale' | 'slide' | 'blur' | 'none' };
}

/** Builds the theme from the bank tokens, the bank's brand colour and the component style. */
export function makeTheme(style: ComponentStyle = {}, brand?: string): Theme {
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
    motion: { click: style.motion?.click ?? 'none', scroll: style.motion?.scroll ?? 'none' },
  };
}

const ThemeContext = createContext<Theme>(makeTheme());

/** Gives every component below it the bank's theme. Without it the components use the neutral bank tokens. */
export function ThemeProvider({ style, brand, children }: { style?: ComponentStyle; brand?: string; children: ReactNode }) {
  const theme = useMemo(() => makeTheme(style, brand), [style, brand]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
