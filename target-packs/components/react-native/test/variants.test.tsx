import { act, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ReactElement } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text } from 'react-native';

import { BlurInText, Carousel, ClickBurst, CountUp, DotGrid, EdgeBlur, FX, FadeInContent, FocusWord, GlareHover, GlassPanel, GradientBackdrop, GradientText, HighlightBorder,
  LightBeams, LineWaves, Marquee, Motion, PRESETS, ParticleBackdrop, RollingDigits, RotatingText, ScrollExpand, ScrollFloatText, ScrollReveal, ScrubField, ShimmerText,
  SilkBackdrop, SoftAurora, SwipeRow, TextReveal, Topography, TypedText, fx, paletteColors } from '../src';
import { makeTheme } from '../src/theme';
import { DURATION } from '../src/presets';

const json = (f: string) => JSON.parse(readFileSync(resolve(__dirname, '../..', f), 'utf8'));
const motion = json('motion.json');
const tokens = json('tokens/tokens.json').motion;
const all = json('variants.json').components as Record<string, { css?: string; variants: { id: string; params?: object }[] }>;
/** The effects of wave V5 (those with a css root), their default first. */
const components = Object.fromEntries(Object.entries(all).filter(([, c]) => c.css));
const noop = () => undefined;
const later = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); };
const byId = (id: string) => screen.getByTestId(id, { includeHiddenElements: true });
const style = (id: string) => StyleSheet.flatten(byId(id).props.style);
const kid = <Text>Content</Text>;
const slides = [{ id: 'a', label: 'One', content: <Text>One</Text> }, { id: 'b', label: 'Two', content: <Text>Two</Text> }];

/* The test renderer has no native animation thread, so the native-driver animations run in JS here, where the test can watch them. */
const { timing } = Animated;
jest.spyOn(Animated, 'timing').mockImplementation((v, c) => timing(v, { ...c, useNativeDriver: false }));

beforeEach(() => { jest.useFakeTimers(); });

/** Each effect of wave V5 with a variant. */
const SAMPLE: Record<string, (v: string) => ReactElement> = {
  'blur-in-text': (v) => <BlurInText variant={v} text="Your money" />,
  'text-reveal': (v) => <TextReveal variant={v} text="Welcome" />,
  'rotating-text': (v) => <RotatingText variant={v} prefix="Pay" words={['bills', 'friends']} />,
  'shimmer-text': (v) => <ShimmerText variant={v} text="New offer" />,
  'gradient-text': (v) => <GradientText variant={v} text="Platinum" />,
  'typed-text': (v) => <TypedText variant={v} text="Hi" />,
  'focus-word': (v) => <FocusWord variant={v} text="Save a little" />,
  'scroll-float-text': (v) => <ScrollFloatText variant={v} text="Grow" />,
  'rolling-digits': (v) => <RollingDigits variant={v} value="12.40" />,
  'count-up': (v) => <CountUp variant={v} value={12} />,
  'scrub-field': (v) => <ScrubField testID="scrub" variant={v} label="Amount" value={250} max={1000} />,
  'fade-in-content': (v) => <FadeInContent variant={v}>{kid}</FadeInContent>,
  'scroll-reveal': (v) => <ScrollReveal variant={v}>{kid}</ScrollReveal>,
  'scroll-expand': (v) => <ScrollExpand variant={v}>{kid}</ScrollExpand>,
  'edge-blur': (v) => <EdgeBlur variant={v}>{kid}</EdgeBlur>,
  'glare-hover': (v) => <GlareHover variant={v}>{kid}</GlareHover>,
  'highlight-border': (v) => <HighlightBorder variant={v}>{kid}</HighlightBorder>,
  'click-burst': (v) => <ClickBurst variant={v} label="Send">{kid}</ClickBurst>,
  'glass-panel': (v) => <GlassPanel variant={v}>{kid}</GlassPanel>,
  'gradient-backdrop': (v) => <GradientBackdrop variant={v} />,
  'soft-aurora': (v) => <SoftAurora variant={v} />,
  'silk-backdrop': (v) => <SilkBackdrop variant={v} />,
  'dot-grid': (v) => <DotGrid variant={v} />,
  'line-waves': (v) => <LineWaves variant={v} />,
  'light-beams': (v) => <LightBeams variant={v} />,
  topography: (v) => <Topography variant={v} />,
  'particle-backdrop': (v) => <ParticleBackdrop variant={v} />,
  marquee: (v) => <Marquee variant={v} items={['USD 0.92 EUR']} />,
  carousel: (v) => <Carousel variant={v} label="Offers" slides={slides} value="a" onChange={noop} />,
  'swipe-row': (v) => <SwipeRow variant={v} label="Coffee" actions={[{ id: 'split', label: 'Split' }]} onAction={noop}>{kid}</SwipeRow>,
};

describe('the motion library and effect variants', () => {
  it('are generated from motion.json, the variants and the design tokens', () => {
    const { $comment: _, ...presets } = motion.presets;
    expect(PRESETS).toEqual(presets);
    expect(DURATION.slow).toBe(parseInt(tokens['duration-slow'].$value, 10));
    for (const [id, c] of Object.entries(components)) { expect(FX[id]).toEqual(Object.fromEntries(c.variants.map((v) => [v.id, v.params ?? {}]))); }
  });

  it('resolve a variant\'s settings and palette in the theme\'s colours', () => {
    const t = makeTheme();
    expect(fx('soft-aurora', 'calm')).toEqual({ speed: 0.5, intensity: 1, density: 0.7, sensitivity: 1, palette: 'mono' });
    expect(fx('soft-aurora', 'nope')).toEqual({ speed: 1, intensity: 1, density: 1, sensitivity: 1 });
    expect(paletteColors(t, 'mono')).toEqual([t.color.text, t.color.textMuted, t.color.borderStrong]);
    expect(paletteColors(t, undefined)).toBeUndefined();
  });

  it('every variant of every effect renders', async () => {
    expect(Object.keys(SAMPLE).sort()).toEqual(Object.keys(components).sort());
    for (const [id, c] of Object.entries(components)) {
      for (const v of c.variants) {
        const r = await render(SAMPLE[id](v.id));
        await r.unmount();
      }
    }
  });

  it('a variant sets how many parts a backdrop has and how fast text types', async () => {
    const dots = await render(<DotGrid testID="g" variant="calm" />);
    expect(byId('g').children.length).toBe(Math.round(10 * 0.7));
    await dots.unmount();
    await render(<><TypedText testID="q" variant="quick" text="Hello" /><TypedText testID="d" variant="deliberate" text="Hello" /></>);
    await later(60);
    const typed = (id: string) => (byId(id).props.children as unknown[])[0];
    expect([typed('q'), typed('d')]).toEqual(['Hell', 'H']);
  });

  it('a preset enters, and plays again on a change; under reduced motion it is at its end at once', async () => {
    const { rerender } = await render(<Motion testID="m" phase="change" preset="fade" on={1} />);
    expect(style('m').opacity).toBe(1);
    await rerender(<Motion testID="m" phase="change" preset="fade" on={2} />);
    expect(style('m').opacity).toBe(0);
    await later(DURATION.slow + 50);
    expect(style('m').opacity).toBe(1);
    await render(<Motion testID="e" phase="enter" preset="rise" />);
    expect(style('e').opacity).toBe(0);
    const listener = (AccessibilityInfo.addEventListener as jest.Mock).mock.calls.find((c) => c[0] === 'reduceMotionChanged')?.[1];
    await act(async () => { listener(true); });
    await render(<Motion testID="r" phase="enter" preset="rise" />);
    expect(style('r').opacity).toBe(1);
    await act(async () => { listener(false); });
  });
});
