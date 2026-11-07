import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NumberInput, play } from '../src';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete (HTMLElement.prototype as Partial<HTMLElement>).animate; });

const reduce = (on: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q.includes('reduce'), media: q }));

describe('the motion layer', () => {
  it('plays an effect once, and nothing under reduced motion or without the Web Animations API', () => {
    const el = document.createElement('span');
    expect(play(el, 'roll')).toBeNull();
    const animate = vi.fn(() => ({}) as Animation);
    el.animate = animate;
    reduce(false);
    expect(play(el, 'roll')).not.toBeNull();
    reduce(true);
    expect(play(el, 'pop')).toBeNull();
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('rolls a number in when it is stepped', async () => {
    reduce(false);
    const animate = vi.fn(() => ({}) as Animation);
    HTMLElement.prototype.animate = animate;
    function Host() { const [v, set] = useState<number | null>(1); return <NumberInput testID="n" label="Copies" value={v} onChange={set} />; }
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Increase Copies' }));
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('has a motion spec for every component the pack exports, and the same skin as the JET pack', () => {
    const spec = JSON.parse(readFileSync(resolve(__dirname, '../../motion.json'), 'utf8')).components;
    const built = Object.entries(spec).filter(([, m]) => (m as { packs: Record<string, boolean> }).packs.react).map(([id]) => id);
    expect(built.length).toBeGreaterThanOrEqual(23);
    expect(readFileSync(resolve(__dirname, '../src/bx.css'), 'utf8')).toBe(readFileSync(resolve(__dirname, '../../jet-premium/bx/bx.css'), 'utf8'));
  });
});
