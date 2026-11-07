import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DURATION, EASING, FX, G7_COMPONENTS, PRESETS, TypedText, fx, play } from '../src';

afterEach(() => { document.body.innerHTML = ''; TestBed.resetTestingModule(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const json = (f: string) => JSON.parse(readFileSync(resolve(__dirname, '../..', f), 'utf8'));
const motion = json('motion.json');
const tokens = json('tokens/tokens.json').motion;
const all = json('variants.json').components as Record<string, { css?: string; variants: { id: string; params?: object }[] }>;
/** The effects of wave V5 (those with a css root), their default first. */
const components = Object.fromEntries(Object.entries(all).filter(([, c]) => c.css));

/** One of each effect of wave V5, all on the host's variant. */
const SAMPLE: Record<string, string> = {
  'blur-in-text': 'text="Hello there"', 'text-reveal': 'text="Hi"', 'rotating-text': 'prefix="Pay" [words]="[\'bills\', \'friends\']"', 'shimmer-text': 'text="Hi"',
  'gradient-text': 'text="Hi"', 'typed-text': 'text="Hi"', 'focus-word': 'text="Save a little"', 'scroll-float-text': 'text="Grow"', 'rolling-digits': '[value]="12"',
  'count-up': '[value]="12"', 'scrub-field': '[value]="250"', marquee: '[items]="[\'USD 0.92 EUR\']"', carousel: '[slides]="[{ title: \'One\' }]"',
  'swipe-row': 'heading="Coffee" [actions]="[{ value: \'split\', label: \'Split\' }]"',
};
const template = Object.keys(components).map((id) => `<bx-${id} [variant]="v()" ${SAMPLE[id] ?? ''}><p>Content</p></bx-${id}>`).join('');

describe('the motion library and effect variants', () => {
  it('are generated from motion.json, the variants and the design tokens', () => {
    const { $comment: _, ...presets } = motion.presets;
    expect(PRESETS).toEqual(presets);
    expect(DURATION.base).toBe(parseInt(tokens['duration-base'].$value, 10));
    expect(EASING.exit).toBe(tokens['ease-exit'].$value);
    for (const [id, c] of Object.entries(components)) { expect(FX[id]).toEqual(Object.fromEntries(c.variants.map((v) => [v.id, v.params ?? {}]))); }
  });

  it('play an enter preset with its token timing; nothing under reduced motion', () => {
    const el = document.createElement('div');
    const animate = vi.fn(() => ({}) as Animation);
    el.animate = animate;
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    play(el, 'scale', 'enter');
    expect(animate).toHaveBeenCalledWith([{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: DURATION.base, easing: EASING.standard, fill: 'none' });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(play(el, 'scale', 'enter')).toBeNull();
    expect(fx('marquee', 'reverse')).toEqual({ speed: 1, intensity: 1, density: 1, sensitivity: 1, direction: 'right', css: ' bx-v-reverse' });
  });

  it('every variant of every effect is built: its class is on the component', async () => {
    @Component({ imports: [...G7_COMPONENTS], template })
    class Host { readonly v = signal(''); }
    const fixture = TestBed.createComponent(Host);
    fixture.autoDetectChanges();
    document.body.appendChild(fixture.nativeElement);
    const el = fixture.nativeElement as HTMLElement;
    const missing: string[] = [];
    const ids = [...new Set(Object.values(components).flatMap((c) => c.variants.map((v) => v.id)))].filter((v) => v !== 'default');
    for (const v of ids) {
      fixture.componentInstance.v.set(v);
      await fixture.whenStable();
      for (const [id, c] of Object.entries(components)) {
        if (c.variants.some((x) => x.id === v) && !el.querySelector(`bx-${id} .bx-v-${v}`)) { missing.push(`${id}/${v}`); }
      }
    }
    expect(missing).toEqual([]);
  }, 60000);

  it('timers follow the variant\'s speed', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.useFakeTimers();
    @Component({ imports: [TypedText], template: '<bx-typed-text testID="q" variant="quick" text="Hello" /><bx-typed-text testID="d" variant="deliberate" text="Hello" />' })
    class Host {}
    const fixture = TestBed.createComponent(Host);
    fixture.autoDetectChanges();
    document.body.appendChild(fixture.nativeElement);
    await vi.advanceTimersByTimeAsync(100);
    const typed = (id: string) => (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"] [aria-hidden="true"]`)!.textContent;
    expect([typed('q'), typed('d')]).toEqual(['Hello', 'H']);
  });
});
