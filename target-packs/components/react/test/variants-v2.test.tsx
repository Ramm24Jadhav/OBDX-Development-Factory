import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ComponentType, ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as P from '../src';
import { violations } from './a11y';

afterEach(cleanup);

/* Wave V2 (variants.json): every variant of every container and navigation component renders its bx-v-<id> class, the Material ones with MUI. */
interface Spec { id: string; kind: string; variants: Array<{ id: string }>; packs: Record<string, { name: string }> }
const read = (p: string) => JSON.parse(readFileSync(resolve(process.cwd(), '..', p), 'utf8'));
const names = new Map<string, Record<string, string>>();
for (const cat of read('catalogue.json').categories) { for (const x of cat.components) { names.set(x.id, x.names ?? {}); } }
const spec: { components: Spec[] } = { components: Object.entries(read('variants.json').components as Record<string, { kind: string; wave: string; variants: Array<{ id: string; built: string[] }> }>)
  .filter(([, c]) => c.wave === 'V2')
  .map(([id, c]) => ({ id, kind: c.kind, variants: c.variants.filter((v) => v.id !== 'default'),
    packs: Object.fromEntries(Object.entries(names.get(id) ?? {}).filter(([p]) => c.variants.some((v) => v.built.includes(p))).map(([p, name]) => [p, { name }])) })) };

const tiles = { heading: 'Accounts', items: [{ label: 'Savings', value: '1,000.00 USD' }, { label: 'Current', value: '250.00 USD' }] };
const thing = { heading: 'Savings', text: 'Everyday account', actionLabel: 'View details' };
const kv = { heading: 'Details', items: [{ label: 'Amount', value: '100.00 USD' }, { label: 'Total', value: '101.00 USD', total: true }] };
const quick = { items: [{ id: 'pay', label: 'Pay', icon: '→' }, { id: 'top', label: 'Top up', icon: '+' }] };
const acc = { items: [{ title: 'Fees', body: 'None inside the bank.' }, { title: 'Limits', body: 'Up to 10,000 USD a day.' }] };
const deck = { label: 'Offers', items: [{ title: 'Travel card', text: 'No fees abroad' }, { title: 'Saver', text: '4% a year' }] };
const summary = { items: [{ id: 'cur', label: 'Current', summary: '1,200.00 USD' }, { id: 'sav', label: 'Savings', summary: '9,000.00 USD' }] };
const rows = { caption: 'Payments', keyField: 'id' as const, rows: [{ id: '1', payee: 'Asha', amount: 20 }, { id: '2', payee: 'Ben', amount: 5 }],
  columns: [{ field: 'payee' as const, headerText: 'Payee', sortable: true }, { field: 'amount' as const, headerText: 'Amount', align: 'end' as const }] };
const SAMPLE: Record<string, object> = {
  'action-menu': { items: ['Download statement', 'Set a nickname'] }, 'staggered-menu': { items: ['Download statement', 'Set a nickname'] },
  card: { heading: 'Savings', children: 'Everyday account' },
  tabs: { label: 'Accounts', selection: 'a', onSelectionChange: () => undefined, tabs: [{ id: 'a', label: 'Current', content: 'One' }, { id: 'b', label: 'Savings', content: 'Two' }] },
  accordion: acc, 'account-structure': acc, faq: acc, breadcrumb: { items: ['Home', 'Accounts', 'Savings', 'Statement'] },
  'side-nav': { items: ['Accounts', 'Payments'], selection: 'Accounts' }, 'pill-nav': { items: ['Accounts', 'Payments'], selection: 'Accounts' },
  'dock-nav': quick, 'card-nav': { items: [{ id: 'acc', title: 'Accounts', text: 'Balances' }] },
  sheet: { open: true, heading: 'Filters', onOpenChange: () => undefined }, dialog: { open: true, title: 'Delete the payee?', onOpenChange: () => undefined },
  grid: { children: [<div key="a">One</div>, <div key="b">Two</div>] }, divider: { label: 'Or' }, 'data-grid': rows,
  'loan-schedule': { rows: [{ date: '1 Dec', amount: '200.00 USD' }] }, pagination: { page: 2, pageCount: 6 },
  'quick-actions': quick, 'quick-links-corp': quick, 'accounts-corp': summary, 'transactions-widget': summary,
  'animated-list': { label: 'Activity', items: ['Paid Asha', 'Salary in'] }, 'document-folder': { items: [{ id: 'd1', title: 'Statement' }] },
  'flip-card': { heading: 'Card', front: 'Front', back: 'Back' }, 'card-stack': deck, 'scroll-stack': deck,
  'bento-grid': { label: 'Overview', items: [{ id: 'a', title: 'Spend', figure: '420 USD', size: 'wide' }, { id: 'b', title: 'Save' }] },
  'profile-card': { name: 'Asha Rao', jobTitle: 'Relationship manager', items: [{ label: 'Phone', value: '+1 555 0100' }] },
};
const sampleFor = (c: Spec) => SAMPLE[c.id] ?? ({ tiles, card: thing, kv } as Record<string, object>)[c.kind] ?? {};

const lib = P as unknown as Record<string, ComponentType<Record<string, unknown>>>;
const react = spec.components.filter((c) => c.packs.react);

describe('variants (V2): every component and variant in the React pack', () => {
  it('covers the 16 kinds', () => {
    expect(new Set(react.map((c) => c.kind)).size).toBe(16);
  });
  for (const c of react) {
    describe(c.id, () => {
      for (const v of c.variants) {
        // the components whose markup has no MUI part draw their kind's Material variants with bx.css
        const mui = P.MATERIAL[c.kind]?.includes(v.id) && !['sheet', 'dock-nav', 'card-nav'].includes(c.id);
        it(`${v.id}${mui ? ' (MUI)' : ''}`, async () => {
          const Component = lib[c.packs.react.name];
          expect(Component, c.packs.react.name).toBeTypeOf('function');
          render(<Component {...sampleFor(c)} variant={v.id} /> as ReactElement);
          if (c.kind === 'menu') { fireEvent.click(document.querySelector('.bx-menu-button')!); }
          if (c.id === 'document-folder') { fireEvent.click(document.querySelector('.bx-folder-tab')!); }
          expect(document.querySelector(`.bx-v-${v.id}`), `.bx-v-${v.id}`).not.toBeNull();
          if (mui) {
            expect(document.querySelector('[class*="Mui"]'), 'a MUI part').not.toBeNull();
            // one axe run per kind and Material variant (the plain variants change classes only)
            if (react.find((x) => x.kind === c.kind) === c) { expect(await violations()).toEqual([]); }
          }
        });
      }
    });
  }
});

describe('variants (V2): behaviour stays the same in the Material and structural variants', () => {
  it('Material tabs: a click chooses and the panel follows', () => {
    const change = vi.fn();
    render(<P.Tabs label="Accounts" selection="a" onSelectionChange={change} variant="underline" tabs={[{ id: 'a', label: 'Current', content: 'One' }, { id: 'b', label: 'Savings', content: 'Two' }]} />);
    expect(screen.getByRole('tabpanel').textContent).toBe('One');
    fireEvent.click(screen.getByRole('tab', { name: 'Savings' }));
    expect(change).toHaveBeenCalledWith('b');
  });
  it('vertical tabs say their orientation', () => {
    render(<P.Tabs label="Settings" selection="a" onSelectionChange={() => undefined} variant="vertical" tabs={[{ id: 'a', label: 'Profile' }, { id: 'b', label: 'Security' }]} />);
    expect(screen.getByRole('tablist').getAttribute('aria-orientation')).toBe('vertical');
  });
  it('Material accordion opens a section and ties its region', () => {
    render(<P.Accordion variant="separated" items={acc.items} />);
    const button = screen.getByRole('button', { name: 'Fees' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('region', { name: 'Fees' }).textContent).toContain('None inside the bank.');
  });
  it('Material menu: opens and says what was chosen', () => {
    const pick = vi.fn();
    render(<P.ActionMenu variant="list" items={['Download statement', 'Set a nickname']} onAction={pick} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Set a nickname' }));
    expect(pick).toHaveBeenCalledWith('Set a nickname');
  });
  it('Material pagination keeps the page labels; compact says Page x of y', () => {
    const go = vi.fn();
    render(<P.Pagination variant="rounded" page={2} pageCount={6} onPageChange={go} />);
    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(go.mock.calls).toEqual([[3], [3]]);
    cleanup();
    render(<P.Pagination variant="compact" page={2} pageCount={6} onPageChange={go} />);
    expect(screen.getByText('Page 2 of 6')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(go).toHaveBeenLastCalledWith(1);
  });
  it('Material dialog closes on Escape unless it must be answered; alert is an alertdialog', () => {
    const close = vi.fn();
    const { rerender } = render(<P.Dialog variant="basic" open title="Delete the payee?" onOpenChange={close} />);
    expect(screen.getByRole('dialog', { name: 'Delete the payee?' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(close).toHaveBeenCalledWith(false);
    close.mockClear();
    rerender(<P.Dialog variant="basic" open title="Delete the payee?" onOpenChange={close} cancelBehavior="none" />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    cleanup();
    render(<P.Dialog variant="alert" open title="Sign out?" onOpenChange={close} />);
    expect(screen.getByRole('alertdialog', { name: 'Sign out?' })).toBeTruthy();
  });
  it('collapsed breadcrumb shows the full path on request', () => {
    render(<P.Breadcrumb variant="collapsed" items={['Home', 'Accounts', 'Savings', 'Statement']} />);
    expect(screen.queryByRole('button', { name: 'Accounts' })).toBeNull();
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Show the full path' })); });
    expect(screen.getByRole('button', { name: 'Accounts' })).toBeTruthy();
    expect(screen.getByText('Statement').getAttribute('aria-current')).toBe('page');
  });
  it('Material breadcrumb keeps the current page', () => {
    render(<P.Breadcrumb variant="chevron" items={['Home', 'Statement']} />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeTruthy();
    expect(screen.getByText('Statement').getAttribute('aria-current')).toBe('page');
  });
  it('Material table still sorts; cards gives each cell its label', () => {
    const sort = vi.fn();
    render(<P.DataTable {...rows} variant="material" onSort={sort} />);
    fireEvent.click(screen.getByRole('button', { name: /Payee/ }));
    expect(sort).toHaveBeenCalledWith('payee', 'ascending');
    cleanup();
    render(<P.DataTable {...rows} variant="cards" />);
    expect(document.querySelector('td[data-label="Payee"]')).not.toBeNull();
  });
  it('Material tab summary shows the chosen figure', () => {
    render(<P.AccountsWidget {...summary} variant="underline" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Savings' }));
    expect(screen.getByRole('tabpanel').textContent).toContain('9,000.00 USD');
  });
  it('Material nav marks the current page; chips still act', () => {
    const go = vi.fn();
    render(<P.SideNav variant="drawer" items={['Accounts', 'Payments']} selection="Accounts" onSelectionChange={go} />);
    expect(screen.getByRole('button', { name: 'Accounts' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
    expect(go).toHaveBeenCalledWith('Payments');
    cleanup();
    render(<P.QuickActions variant="chips" {...quick} onAction={go} />);
    fireEvent.click(screen.getByRole('button', { name: /Top up/ }));
    expect(go).toHaveBeenLastCalledWith('top');
  });
});
