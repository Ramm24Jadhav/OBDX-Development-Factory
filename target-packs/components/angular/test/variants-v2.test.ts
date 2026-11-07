import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent, getByRole, getByText, queryByRole } from '@testing-library/dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import * as P from '../src';
import { violations } from './a11y';

afterEach(() => { document.body.innerHTML = ''; TestBed.resetTestingModule(); });

/* Wave V2 (variants.json): every variant of every container and navigation component gives its root bx-v-<id>. */
interface Spec { id: string; kind: string; variants: Array<{ id: string }>; packs: Record<string, { name: string }> }
const read = (p: string) => JSON.parse(readFileSync(resolve(process.cwd(), '..', p), 'utf8'));
const names = new Map<string, Record<string, string>>();
for (const cat of read('catalogue.json').categories) { for (const x of cat.components) { names.set(x.id, x.names ?? {}); } }
const spec: { components: Spec[] } = { components: Object.entries(read('variants.json').components as Record<string, { kind: string; wave: string; variants: Array<{ id: string; built: string[] }> }>)
  .filter(([, c]) => c.wave === 'V2')
  .map(([id, c]) => ({ id, kind: c.kind, variants: c.variants.filter((v) => v.id !== 'default'),
    packs: Object.fromEntries(Object.entries(names.get(id) ?? {}).filter(([p]) => c.variants.some((v) => v.built.includes(p))).map(([p, name]) => [p, { name }])) })) };

/** The component class for a selector, from the pack's exports. */
const bySelector = new Map<string, Type<unknown>>();
for (const value of Object.values(P)) {
  const def = (value as { ɵcmp?: { selectors: string[][] } }).ɵcmp;
  if (def) { bySelector.set(def.selectors[0][0], value as Type<unknown>); }
}

const tiles = { heading: 'Accounts', items: [{ label: 'Savings', value: '1,000.00 USD' }] };
const kv = { heading: 'Details', items: [{ label: 'Amount', value: '100.00 USD' }, { label: 'Total', value: '101.00 USD', total: true }] };
const quick = { items: [{ id: 'pay', label: 'Pay', icon: '→' }, { id: 'top', label: 'Top up', icon: '+' }] };
const acc = { items: [{ title: 'Fees', body: 'None inside the bank.' }] };
const deck = { label: 'Offers', items: [{ title: 'Travel card', text: 'No fees abroad' }, { title: 'Saver', text: '4% a year' }] };
const summary = { items: [{ id: 'cur', label: 'Current', summary: '1,200.00 USD' }, { id: 'sav', label: 'Savings', summary: '9,000.00 USD' }] };
const SAMPLE: Record<string, Record<string, unknown>> = {
  'action-menu': { items: ['Download statement'] }, 'staggered-menu': { items: ['Download statement'] }, card: { heading: 'Savings' },
  tabs: { label: 'Accounts', selection: 'a', tabs: [{ id: 'a', label: 'Current' }, { id: 'b', label: 'Savings' }] },
  accordion: acc, 'account-structure': acc, faq: acc, breadcrumb: { items: ['Home', 'Accounts', 'Savings', 'Statement'] },
  'side-nav': { items: ['Accounts', 'Payments'], selection: 'Accounts' }, 'pill-nav': { items: ['Accounts', 'Payments'], selection: 'Accounts' },
  'dock-nav': quick, 'card-nav': { items: [{ id: 'acc', title: 'Accounts' }] }, sheet: { open: true, heading: 'Filters' }, dialog: { open: true, dialogTitle: 'Delete the payee?' },
  grid: {}, divider: { label: 'Or' }, 'data-grid': { caption: 'Payments', rows: [{ id: '1', payee: 'Asha' }], columns: [{ field: 'payee', headerText: 'Payee' }] },
  'loan-schedule': { rows: [{ date: '1 Dec', amount: '200.00 USD' }] }, pagination: { page: 2, pageCount: 6 },
  'quick-actions': quick, 'quick-links-corp': quick, 'accounts-corp': summary, 'transactions-widget': summary,
  'animated-list': { label: 'Activity', items: ['Paid Asha'] }, 'document-folder': { items: [{ id: 'd1', title: 'Statement' }] },
  'flip-card': { heading: 'Card', front: 'Front', back: 'Back' }, 'card-stack': deck, 'scroll-stack': deck,
  'bento-grid': { label: 'Overview', items: [{ id: 'a', title: 'Spend', figure: '420 USD' }] }, 'profile-card': { name: 'Asha Rao' },
  'spotlight-card': { heading: 'Spotlight' }, 'tilt-card': { heading: 'Tilt' }, 'glow-border-card': { heading: 'Glow' },
};
const sampleFor = (c: Spec) => SAMPLE[c.id] ?? ({ tiles, card: { heading: 'Savings', text: 'Everyday account' }, kv } as Record<string, Record<string, unknown>>)[c.kind] ?? {};

async function mount(type: Type<unknown>, inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(type);
  for (const [k, v] of Object.entries(inputs)) { fixture.componentRef.setInput(k, v); }
  fixture.autoDetectChanges();
  await fixture.whenStable();
  document.body.appendChild(fixture.nativeElement);
  return { fixture, el: fixture.nativeElement as HTMLElement, settle: async () => { fixture.detectChanges(); await fixture.whenStable(); } };
}

const angular = spec.components.filter((c) => c.packs.angular);

describe('variants (V2): every component and variant in the Angular pack', () => {
  it('covers the 16 kinds', () => { expect(new Set(angular.map((c) => c.kind)).size).toBe(16); });
  for (const c of angular) {
    it(`${c.id}: ${c.variants.map((v) => v.id).join(', ')}`, async () => {
      const type = bySelector.get(c.packs.angular.name);
      expect(type, c.packs.angular.name).toBeTruthy();
      for (const v of c.variants) {
        const { el, fixture } = await mount(type!, { ...sampleFor(c), variant: v.id });
        expect(el.querySelector(`.bx-v-${v.id}`), `${c.id} ${v.id}`).not.toBeNull();
        fixture.destroy();
        document.body.innerHTML = '';
      }
      const { el } = await mount(type!, sampleFor(c));
      expect(el.querySelector('[class*="bx-v-"]'), 'no variant class by default').toBeNull();
      // a lone bx-tabs points at panels the screen draws, and a grid is only a layout
      if (c.id !== 'tabs' && c.kind !== 'grid') { expect(await violations(el)).toEqual([]); }
    });
  }
});

describe('variants (V2): structural variants keep the behaviour', () => {
  it('collapsed breadcrumb shows the full path on request', async () => {
    const { el, settle } = await mount(P.Breadcrumb, { items: ['Home', 'Accounts', 'Savings', 'Statement'], variant: 'collapsed' });
    expect(queryByRole(el, 'button', { name: 'Accounts' })).toBeNull();
    fireEvent.click(getByRole(el, 'button', { name: 'Show the full path' }));
    await settle();
    expect(getByRole(el, 'button', { name: 'Accounts' })).toBeTruthy();
    expect(getByText(el, 'Statement').getAttribute('aria-current')).toBe('page');
  });
  it('compact pagination says Page x of y and still moves', async () => {
    const { el, fixture, settle } = await mount(P.Pagination, { page: 2, pageCount: 6, variant: 'compact' });
    expect(getByText(el, 'Page 2 of 6')).toBeTruthy();
    fireEvent.click(getByRole(el, 'button', { name: 'Next page' }));
    await settle();
    expect((fixture.componentInstance as { page: () => number }).page()).toBe(3);
  });
  it('alert dialogs and sheets are alertdialogs; vertical tabs say so; table cards label their cells', async () => {
    let m = await mount(P.Dialog, { open: true, dialogTitle: 'Sign out?', variant: 'alert' });
    expect(getByRole(m.el, 'alertdialog', { name: 'Sign out?' })).toBeTruthy();
    m.fixture.destroy();
    m = await mount(P.Sheet, { open: true, heading: 'Filters', variant: 'alert' });
    expect(getByRole(m.el, 'alertdialog', { name: 'Filters' })).toBeTruthy();
    m.fixture.destroy();
    m = await mount(P.Tabs, { label: 'Settings', selection: 'a', tabs: [{ id: 'a', label: 'Profile' }], variant: 'vertical' });
    expect(getByRole(m.el, 'tablist').getAttribute('aria-orientation')).toBe('vertical');
    m.fixture.destroy();
    m = await mount(P.DataTable, { caption: 'Payments', rows: [{ id: '1', payee: 'Asha' }], columns: [{ field: 'payee', headerText: 'Payee' }], variant: 'cards' });
    expect(m.el.querySelector('td[data-label="Payee"]')).not.toBeNull();
    m.fixture.destroy();
    m = await mount(P.RepaymentSchedule, { rows: [{ date: '1 Dec', amount: '200' }], variant: 'cards' });
    expect(m.el.querySelector('td[data-label="Due date"]')).not.toBeNull();
  });
  it('the dock carries the nav variant; pill nav and staggered menu pass theirs on', async () => {
    let m = await mount(P.DockNav, { items: quick.items, variant: 'dock' });
    expect(m.el.querySelector('.bx-fx-dock.bx-v-dock')).not.toBeNull();
    m.fixture.destroy();
    m = await mount(P.PillNav, { items: ['Accounts'], variant: 'pill' });
    expect(m.el.querySelector('.bx-nav.bx-v-pill')).not.toBeNull();
    m.fixture.destroy();
    m = await mount(P.StaggeredMenu, { items: ['Download'], variant: 'glass' });
    expect(m.el.querySelector('.bx-menu.bx-v-glass')).not.toBeNull();
  });
});
