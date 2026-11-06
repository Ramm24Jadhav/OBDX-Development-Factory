import { readFileSync } from 'fs';
import { resolve } from 'path';

import { Look, applyStyle, saved, styleClasses } from '../style';

const LOOKS: Look[] = ['elevated', 'soft', 'glass', 'outline', 'vivid', 'pill', 'brutal', 'redwood', 'liquid'];

describe('The component style', () => {
  it('turns the saved style into root classes, the Core Pack dark scheme and the brand colour', () => {
    expect(styleClasses({ look: 'liquid', motion: { hover: 'glow', click: 'none' }, mode: 'dark' }))
      .toEqual(['obdx-look-liquid', 'obdx-motion-hover-glow', 'obdx-dark', 'oj-c-colorscheme-dark']);
    const root = document.createElement('html');
    applyStyle(root, { look: 'brutal', brand: 'gold' });
    expect(root.className).toBe('obdx-look-brutal');
    expect(root.style.getPropertyValue('--obdx-brand')).toBe('#b45309');
    const own = document.createElement('html');
    applyStyle(own, saved.defaults);
    expect(own.className).toBe('obdx-look-elevated obdx-motion-click-press');
    expect(own.style.getPropertyValue('--obdx-brand')).toBe('');
  });

  it('draws all nine designs over Redwood, Liquid glass with every fallback of glass.json', () => {
    const css = readFileSync(resolve(__dirname, '../styles/looks.css'), 'utf8');
    expect(LOOKS.filter((l) => !css.includes(`html.obdx-look-${l}`))).toEqual([]);
    for (const f of ['rgb(255 255 255 / 0.6)', 'rgb(40 40 40 / 0.62)', 'prefers-reduced-transparency: reduce', 'forced-colors: active', 'prefers-reduced-motion: reduce',
      '@supports not ((backdrop-filter']) {
      expect(css).toContain(f);
    }
    expect(readFileSync(resolve(__dirname, '../index.html'), 'utf8')).toContain('styles/looks.css');
  });
});
