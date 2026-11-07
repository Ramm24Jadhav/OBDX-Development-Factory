import { Type, reflectComponentType } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import * as bx from '../src';
import { hueOf } from '../src/variant';
import { violations } from './a11y';

afterEach(() => { document.body.innerHTML = ''; TestBed.resetTestingModule(); });

// Wave V4's banking widgets and the variants variants.json lists as built here; their states are in variants/v4.json
interface Entry { kind: string; wave: string; variants: Array<{ id: string; built: string[] }> }
const states = (JSON.parse(readFileSync(join(__dirname, '..', '..', 'variants', 'v4.json'), 'utf8')) as { components: Record<string, { states: { loadingProperty?: boolean } }> }).components;
const v4 = Object.entries((JSON.parse(readFileSync(join(__dirname, '..', '..', 'variants.json'), 'utf8')) as { components: Record<string, Entry> }).components)
  .filter(([, c]) => c.wave === 'V4' && c.variants.some((v) => v.id !== 'default' && v.built.includes('angular')))
  .map(([id, c]) => ({ id, kind: c.kind, variants: c.variants.filter((v) => v.id !== 'default'), states: states[id].states }));
// Each component class by its selector (bx-<id>)
const bySelector = new Map<string, Type<unknown>>();
for (const value of Object.values(bx)) {
  const meta = typeof value === 'function' ? reflectComponentType(value as Type<unknown>) : null;
  if (meta) { bySelector.set(meta.selector, value as Type<unknown>); }
}

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

async function draw(id: string, kind: string, extra: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(bySelector.get('bx-' + id)!);
  const inputs = { ...(id === 'prompt-bar' ? { suggestions: ['Balance'] } : SAMPLE[kind]), ...extra };
  for (const [k, v] of Object.entries(inputs)) { fixture.componentRef.setInput(k, v); }
  fixture.autoDetectChanges();
  await fixture.whenStable();
  document.body.appendChild(fixture.nativeElement);
  return fixture.nativeElement as HTMLElement;
}

describe('wave V4 variants', () => {
  for (const c of v4) {
    it(`${c.id}: each variant puts bx-v-<variant> on the root; none without a variant`, async () => {
      expect((await draw(c.id, c.kind)).querySelector('[class*="bx-v-"]')).toBeNull();
      for (const v of c.variants) {
        TestBed.resetTestingModule();
        expect((await draw(c.id, c.kind, { variant: v.id })).querySelector(`.bx-v-${v.id}`), v.id).not.toBeNull();
      }
    });
  }

  for (const c of v4.filter((x) => x.states.loadingProperty)) {
    it(`${c.id}: loading shows a skeleton with role status, without the empty line, and passes axe`, async () => {
      const el = await draw(c.id, c.kind, { loading: true, ...(c.kind === 'chat' ? { messages: [] } : c.kind === 'balance' ? {} : { items: [] }) });
      expect(el.querySelector('.bx-skeleton[role="status"][aria-busy="true"]')).not.toBeNull();
      expect(el.querySelector('.bx-panel-empty')).toBeNull();
      expect(await violations(el)).toEqual([]);
    });
  }

  it('compact payees and transactions leave out the initials; the tonal avatar takes a hue from the name', async () => {
    for (const id of ['payee-list', 'transaction-list', 'recent-transactions']) {
      const kind = id === 'payee-list' ? 'payees' : 'txlist';
      expect((await draw(id, kind, { variant: 'list' })).querySelector('.bx-avatar'), id).not.toBeNull();
      TestBed.resetTestingModule();
      expect((await draw(id, kind, { variant: 'compact' })).querySelector('.bx-avatar'), id).toBeNull();
      TestBed.resetTestingModule();
    }
    const tonal = (await draw('avatar', 'avatar', { variant: 'tonal' })).querySelector<HTMLElement>('.bx-avatar')!;
    // 133: the same hue the JET, React and React Native packs work out for the name
    expect([tonal.style.getPropertyValue('--bx-avatar-hue'), hueOf('A. Rao')]).toEqual(['133', 133]);
  });
});
