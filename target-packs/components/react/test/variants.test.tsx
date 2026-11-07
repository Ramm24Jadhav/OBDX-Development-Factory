import { act, cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BlurInText, Carousel, ClickBurst, CountUp, DotGrid, DURATION, EASING, EdgeBlur, FX, FadeInContent, FocusWord, GlareHover, GlassPanel, GradientBackdrop, GradientText,
  HighlightBorder, LightBeams, LineWaves, Marquee, PRESETS, ParticleBackdrop, RollingDigits, RotatingText, ScrollExpand, ScrollFloatText, ScrollReveal, ScrubField, ShimmerText,
  SilkBackdrop, SoftAurora, SwipeRow, TextReveal, Topography, TypedText, fx, keyframes, leave, play } from '../src';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); delete (HTMLElement.prototype as Partial<HTMLElement>).animate; });

const json = (f: string) => JSON.parse(readFileSync(resolve(__dirname, '../..', f), 'utf8'));
/** The effects of wave V5 in variants.json (those with a css root), their default first; v5.components is read as any. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const v5: { components: any } = { components: Object.fromEntries(Object.entries<{ css?: string }>(json('variants.json').components).filter(([, c]) => c.css)) };
const motion = json('motion.json');
const tokens = json('tokens/tokens.json').motion;
const reduce = (on: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q.includes('reduce'), media: q }));
const kid = <p>The screen&apos;s own content</p>;

/** Each effect of wave V5 with a variant. */
const SAMPLE: Record<string, (v: string) => ReactElement> = {
  'blur-in-text': (v) => <BlurInText variant={v} text="Your money, clearly." />,
  'text-reveal': (v) => <TextReveal variant={v} text="Welcome back" />,
  'rotating-text': (v) => <RotatingText variant={v} prefix="Pay" words={['bills', 'friends']} />,
  'shimmer-text': (v) => <ShimmerText variant={v} text="New offer" />,
  'gradient-text': (v) => <GradientText variant={v} text="Platinum" />,
  'typed-text': (v) => <TypedText variant={v} text="Hi" />,
  'focus-word': (v) => <FocusWord variant={v} text="Save a little" />,
  'scroll-float-text': (v) => <ScrollFloatText variant={v} text="Grow" />,
  'rolling-digits': (v) => <RollingDigits variant={v} value={12} />,
  'count-up': (v) => <CountUp variant={v} value={12} />,
  'scrub-field': (v) => <ScrubField variant={v} value={250} />,
  'fade-in-content': (v) => <FadeInContent variant={v}>{kid}</FadeInContent>,
  'scroll-reveal': (v) => <ScrollReveal variant={v}>{kid}</ScrollReveal>,
  'scroll-expand': (v) => <ScrollExpand variant={v}>{kid}</ScrollExpand>,
  'edge-blur': (v) => <EdgeBlur variant={v}>{kid}</EdgeBlur>,
  'glare-hover': (v) => <GlareHover variant={v}>{kid}</GlareHover>,
  'highlight-border': (v) => <HighlightBorder variant={v}>{kid}</HighlightBorder>,
  'click-burst': (v) => <ClickBurst variant={v}>{kid}</ClickBurst>,
  'glass-panel': (v) => <GlassPanel variant={v}>{kid}</GlassPanel>,
  'gradient-backdrop': (v) => <GradientBackdrop variant={v}>{kid}</GradientBackdrop>,
  'soft-aurora': (v) => <SoftAurora variant={v}>{kid}</SoftAurora>,
  'silk-backdrop': (v) => <SilkBackdrop variant={v}>{kid}</SilkBackdrop>,
  'dot-grid': (v) => <DotGrid variant={v}>{kid}</DotGrid>,
  'line-waves': (v) => <LineWaves variant={v}>{kid}</LineWaves>,
  'light-beams': (v) => <LightBeams variant={v}>{kid}</LightBeams>,
  topography: (v) => <Topography variant={v}>{kid}</Topography>,
  'particle-backdrop': (v) => <ParticleBackdrop variant={v}>{kid}</ParticleBackdrop>,
  marquee: (v) => <Marquee variant={v} items={['USD 0.92 EUR']} />,
  carousel: (v) => <Carousel variant={v} slides={[{ title: 'One', text: 'a' }, { title: 'Two', text: 'b' }]} />,
  'swipe-row': (v) => <SwipeRow variant={v} heading="Coffee" actions={[{ value: 'split', label: 'Split' }]} />,
};

describe('the motion library', () => {
  it('is generated from motion.json, the variants and the design tokens', () => {
    const { $comment: _, ...presets } = motion.presets;
    expect(PRESETS).toEqual(presets);
    expect(DURATION).toEqual({ fast: parseInt(tokens['duration-fast'].$value, 10), base: parseInt(tokens['duration-base'].$value, 10), slow: parseInt(tokens['duration-slow'].$value, 10) });
    expect([EASING.standard, EASING.exit]).toEqual([tokens['ease-standard'].$value, tokens['ease-exit'].$value]);
    for (const [id, c] of Object.entries<{ variants: { id: string; params: object }[] }>(v5.components)) {
      expect(FX[id]).toEqual(Object.fromEntries(c.variants.map((v) => [v.id, v.params ?? {}])));
    }
  });

  it('names only presets it has, for every phase of every variant', () => {
    const missing: string[] = [];
    for (const [id, c] of Object.entries<{ variants: { id: string; motion: Record<string, string | null> }[] }>(v5.components)) {
      for (const v of c.variants) {
        for (const [phase, name] of Object.entries(v.motion ?? {})) {
          if (name !== null && name !== 'effect' && !motion.presets[phase]?.[name]) { missing.push(`${id}/${v.id}/${phase}: ${name}`); }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('turns neutral frames into keyframes, at rest where a frame leaves a key out', () => {
    expect(keyframes([{ opacity: 0, y: 12 }, {}])).toEqual([{ opacity: 0, transform: 'translate(0px, 12px)' }, { opacity: 1, transform: 'none' }]);
    expect(keyframes([{ blur: 6 }, {}])).toEqual([{ filter: 'blur(6px)' }, { filter: 'none' }]);
  });

  it('plays a preset of any phase with its token timing, and nothing under reduced motion', async () => {
    const el = document.createElement('div');
    const animate = vi.fn(() => ({ finished: Promise.resolve() }) as unknown as Animation);
    el.animate = animate;
    reduce(false);
    play(el, 'rise', 'enter');
    expect(animate).toHaveBeenLastCalledWith([{ opacity: 0, transform: 'translate(0px, 12px)' }, { opacity: 1, transform: 'none' }], { duration: DURATION.base, easing: EASING.standard, fill: 'none' });
    await leave(el, 'sink');
    expect(animate).toHaveBeenLastCalledWith(expect.any(Array), { duration: DURATION.fast, easing: EASING.exit, fill: 'forwards' });
    expect(play(el, 'nothing', 'enter')).toBeNull();
    reduce(true);
    expect(play(el, 'rise', 'enter')).toBeNull();
    await expect(leave(el)).resolves.toBeUndefined();
    expect(animate).toHaveBeenCalledTimes(2);
  });
});

describe('effect variants', () => {
  it('resolve to their settings with defaults; an unknown variant is the default', () => {
    expect(fx('blur-in-text', 'gentle')).toEqual({ speed: 0.6, intensity: 0.5, density: 1, sensitivity: 1, css: ' bx-v-gentle' });
    expect(fx('blur-in-text', 'default').css).toBe('');
    expect(fx('blur-in-text', 'nope')).toEqual({ speed: 1, intensity: 1, density: 1, sensitivity: 1, css: '' });
    expect(fx('blur-in-text')).toEqual(fx('blur-in-text', 'nope'));
  });

  it('every variant of every effect is built: its class is on the component', () => {
    expect(Object.keys(SAMPLE).sort()).toEqual(Object.keys(v5.components).sort());
    const missing: string[] = [];
    for (const [id, c] of Object.entries<{ variants: { id: string }[] }>(v5.components)) {
      for (const v of c.variants) {
        const { container, unmount } = render(SAMPLE[id](v.id));
        if (v.id !== 'default' && !container.querySelector(`.bx-v-${v.id}`)) { missing.push(`${id}/${v.id}`); }
        unmount();
      }
    }
    expect(missing).toEqual([]);
  });

  it('timers follow the variant\'s speed, and a chosen interval still wins', () => {
    reduce(false);
    vi.useFakeTimers();
    render(<><TypedText testID="q" variant="quick" text="Hello" /><TypedText testID="d" variant="deliberate" text="Hello" /><TypedText testID="s" variant="quick" speed={70} text="Hello" /></>);
    act(() => { vi.advanceTimersByTime(36); });
    const typed = (id: string) => screen.getByTestId(id).querySelector('[aria-hidden="true"]')!.textContent;
    expect([typed('q'), typed('d'), typed('s')]).toEqual(['He', '', '']);
  });

  it('a steady count-up counts at an even rate', () => {
    reduce(false);
    vi.useFakeTimers();
    render(<CountUp testID="c" variant="steady" value={300} duration={300} />);
    act(() => { vi.advanceTimersByTime(150); });
    expect(screen.getByTestId('c').querySelector('[aria-hidden="true"]')!.textContent).toBe('150.00');
  });

  it('a variant can choose the movement: the carousel fades, the content scales in', () => {
    const { container } = render(<><Carousel variant="fade" slides={[{ title: 'One', text: 'a' }]} /><FadeInContent variant="scale">{kid}</FadeInContent><FadeInContent variant="scale" effect="blur">{kid}</FadeInContent></>);
    expect(container.querySelector('.bx-carousel')!.className).toBe('bx-carousel is-fade bx-v-fade');
    expect([...container.querySelectorAll('.bx-fade-in')].map((e) => e.className)).toEqual(['bx-fx bx-fade-in is-scale bx-v-scale', 'bx-fx bx-fade-in is-blur bx-v-scale']);
  });
});
