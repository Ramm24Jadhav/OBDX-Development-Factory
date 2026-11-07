import { describe, expect, it } from 'vitest';

import saved from '../component-style.json';
import { Look, applyStyle, styleClasses } from '../style';

const LOOKS: Look[] = ['elevated', 'soft', 'glass', 'outline', 'vivid', 'pill', 'brutal', 'redwood', 'liquid'];

describe('The component style', () => {
  it('turns the saved style into root classes and the brand colour', () => {
    expect(styleClasses({ look: 'liquid', motion: { hover: 'lift', click: 'none', scroll: 'fadeup' }, mode: 'dark' }))
      .toEqual(['obdx-look-liquid', 'obdx-motion-hover-lift', 'obdx-motion-scroll-fadeup', 'obdx-dark']);
    const root = document.createElement('div');
    applyStyle(root, { look: 'pill', brand: 'emerald' });
    expect(root.className).toBe('obdx-look-pill');
    expect(root.style.getPropertyValue('--obdx-primary')).toBe('#059669');
    const own = document.createElement('div');
    applyStyle(own, saved.defaults as never);
    expect(own.style.getPropertyValue('--obdx-primary')).toBe('');
  });

  it('draws all nine designs, Liquid glass with every fallback of glass.json', async () => {
    // read as text (vitest turns imported CSS into nothing); the starter has no Node types, so the import is untyped
    const fsModule = 'node:fs';
    const { readFileSync } = (await import(fsModule)) as { readFileSync: (file: string, encoding: string) => string };
    const css = readFileSync('src/components/looks.css', 'utf8'); // vitest runs from the starter's folder
    expect(LOOKS.filter((l) => l !== 'elevated' && !css.includes(`.obdx-look-${l}`))).toEqual([]);
    for (const f of ['rgb(255 255 255 / 0.6)', 'rgb(40 40 40 / 0.62)', 'prefers-reduced-transparency: reduce', 'forced-colors: active', 'prefers-reduced-motion: reduce',
      '@supports not ((backdrop-filter']) {
      expect(css).toContain(f);
    }
    expect(css).not.toMatch(/look-liquid :is\([^)]*obdx-input/);
  });
});
