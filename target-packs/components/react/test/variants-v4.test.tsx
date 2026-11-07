import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ComponentType, createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import * as bx from '../src';
import { hueOf } from '../src/variant';
import { violations } from './a11y';

afterEach(cleanup);

// Wave V4's banking widgets and the variants variants.json lists as built here; their states are in variants/v4.json
interface Entry { kind: string; wave: string; variants: Array<{ id: string; built: string[] }> }
const states = (JSON.parse(readFileSync(join(__dirname, '..', '..', 'variants', 'v4.json'), 'utf8')) as { components: Record<string, { states: { loadingProperty?: boolean } }> }).components;
const v4 = Object.entries((JSON.parse(readFileSync(join(__dirname, '..', '..', 'variants.json'), 'utf8')) as { components: Record<string, Entry> }).components)
  .filter(([, c]) => c.wave === 'V4' && c.variants.some((v) => v.id !== 'default' && v.built.includes('react')))
  .map(([id, c]) => ({ id, kind: c.kind, variants: c.variants.filter((v) => v.id !== 'default'), states: states[id].states }));
const catalogue = JSON.parse(readFileSync(join(__dirname, '..', '..', 'catalogue.json'), 'utf8')) as { categories: Array<{ components: Array<{ id: string; names: Record<string, string> }> }> };
const names = Object.fromEntries(catalogue.categories.flatMap((c) => c.components).map((c) => [c.id, c.names.react]));

const SAMPLE: Record<string, Record<string, unknown>> = {
  bills: { items: [{ id: 'b1', title: 'Electricity', meta: 'Due 20 Jan', value: '86.20' }] },
  balance: { label: 'Savings ·· 4821', amount: 12400, currency: 'USD' },
  payees: { items: [{ id: 'p1', name: 'A. Rao', meta: 'HSBC ·· 9268' }] },
  cardtile: { label: 'Platinum', number: '4111111111114821', network: 'Visa' },
  txlist: { items: [{ id: 't1', description: 'Salary', date: '31 Dec', amount: 3200 }] },
  receipt: { amount: 1250, currency: 'USD', reference: 'FX-20391' },
  form: { heading: 'Payment' },
  calc: {},
  biometric: {},
  locator: { items: [{ id: 'b1', name: 'London Bridge', type: 'branch', address: '1 Tooley St' }] },
  chat: { messages: [{ id: 'm1', from: 'agent', text: 'Hello' }] },
  avatar: { name: 'A. Rao' },
  board: { items: [{ label: 'USD', value: '1.27' }] },
  sensitive: { value: '12345678' },
};
const props = (id: string, kind: string) => (id === 'prompt-bar' ? { suggestions: ['Balance'] } : SAMPLE[kind]);
const draw = (id: string, kind: string, extra: Record<string, unknown> = {}) =>
  render(createElement((bx as unknown as Record<string, ComponentType<Record<string, unknown>>>)[names[id]], { ...props(id, kind), ...extra }));

describe('wave V4 variants', () => {
  for (const c of v4) {
    it(`${c.id}: each variant puts bx-v-<variant> on the root; none without a variant`, () => {
      expect(draw(c.id, c.kind).container.querySelector('[class*="bx-v-"]')).toBeNull();
      cleanup();
      for (const v of c.variants) {
        const { container } = draw(c.id, c.kind, { variant: v.id });
        expect(container.querySelector(`.bx-v-${v.id}`), v.id).not.toBeNull();
        cleanup();
      }
    });
  }

  for (const c of v4.filter((x) => x.states.loadingProperty)) {
    it(`${c.id}: loading shows a skeleton with role status, without the empty line, and passes axe`, async () => {
      const { container } = draw(c.id, c.kind, { loading: true, items: [], messages: [] });
      expect(container.querySelector('.bx-skeleton[role="status"][aria-busy="true"]')).not.toBeNull();
      expect(container.querySelector('.bx-panel-empty')).toBeNull();
      expect(await violations(container)).toEqual([]);
    });
  }

  it('compact payees and transactions leave out the initials; the tonal avatar takes a hue from the name', () => {
    for (const id of ['payee-list', 'transaction-list', 'recent-transactions']) {
      const kind = id === 'payee-list' ? 'payees' : 'txlist';
      expect(draw(id, kind, { variant: 'list' }).container.querySelector('.bx-avatar'), id).not.toBeNull();
      cleanup();
      expect(draw(id, kind, { variant: 'compact' }).container.querySelector('.bx-avatar'), id).toBeNull();
      cleanup();
    }
    const tonal = draw('avatar', 'avatar', { variant: 'tonal' }).container.querySelector<HTMLElement>('.bx-avatar')!;
    // 133: the same hue the JET, Angular and React Native packs work out for the name
    expect([tonal.style.getPropertyValue('--bx-avatar-hue'), hueOf('A. Rao'), hueOf('')]).toEqual(['133', 133, 0]);
  });
});
