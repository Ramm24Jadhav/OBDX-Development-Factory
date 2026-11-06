import { cleanup, render, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button, Tabs, styleClasses } from '../src';

// jsdom has no backdrop or ResizeObserver; the test checks the pack's wiring, Glisse's own drawing is checked in the browser gates
vi.mock('glisse', () => ({ Glass: (p: { className?: string }) => <div data-glass="" className={p.className} /> }));

afterEach(cleanup);

describe('Liquid glass', () => {
  it('is a look of the component style', () => {
    expect(styleClasses({ look: 'liquid', mode: 'dark' })).toBe('bx-theme bx-look-liquid bx-dark');
  });

  it('puts a Glisse lens in the controls only under the liquid look', async () => {
    const { container } = render(<div className={styleClasses({ look: 'liquid' })}><Button label="Pay" />
      <Tabs label="Views" tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} selection="a" onSelectionChange={() => undefined} /></div>);
    await waitFor(() => expect(container.querySelectorAll('.bx-btn > .bx-lens, .bx-tabs > .bx-lens')).toHaveLength(2));
    cleanup();
    const other = render(<div className={styleClasses({ look: 'glass' })}><Button label="Pay" /></div>);
    await new Promise((r) => setTimeout(r, 20));
    expect(other.container.querySelector('.bx-lens')).toBeNull();
  });

  it('keeps no lens when the user asks for less transparency', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduced-transparency') }));
    const { container } = render(<div className="bx-look-liquid"><Button label="Pay" /></div>);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector('.bx-lens')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('frosts controls, keeps fields and tables solid, and has every fallback', () => {
    const css = readFileSync(resolve(__dirname, '../src/bx.css'), 'utf8');
    const glass = css.slice(css.indexOf('.bx-look-liquid :is('), css.indexOf('{', css.indexOf('.bx-look-liquid :is(')));
    expect(glass).toContain('.bx-btn');
    expect(glass).not.toMatch(/\.bx-control,|\.bx-grid-wrap|\.bx-textarea/);
    for (const f of ['prefers-reduced-transparency: reduce', 'forced-colors: active', 'prefers-reduced-motion: reduce', '@supports not ((backdrop-filter']) {
      expect(css).toContain(f);
    }
    expect(css).toContain('rgb(255 255 255 / 0.6)');
    expect(css).toContain('rgb(40 40 40 / 0.62)');
    expect(css).toContain('.bx-look-liquid .bx-range-input::-webkit-slider-thumb');
    expect(css).toContain('.bx-look-liquid .bx-range-input::-moz-range-thumb');
  });
});
