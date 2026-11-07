import { fireEvent, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ComponentType, ReactElement } from 'react';
import { StyleSheet, Text } from 'react-native';

import * as P from '../src';
import { VARIANTS, VariantKind, makeTheme, variantStyle } from '../src';
import { accessibilityProblems } from './a11y';

/* Wave V2 (variants.json): every variant of every container and navigation component reaches the screen as its style. */
interface Spec { id: string; kind: VariantKind; variants: Array<{ id: string }>; packs: Record<string, { name: string }> }
// the first render loads the whole pack, which can take longer than jest's 5 s on a slow machine
jest.setTimeout(30000);
const read = (p: string) => JSON.parse(readFileSync(resolve(__dirname, '..', '..', p), 'utf8'));
const names = new Map<string, Record<string, string>>();
for (const cat of read('catalogue.json').categories) { for (const x of cat.components) { names.set(x.id, x.names ?? {}); } }
const spec: { components: Spec[] } = { components: Object.entries(read('variants.json').components as Record<string, { kind: string; wave: string; variants: Array<{ id: string; built: string[] }> }>)
  .filter(([, c]) => c.wave === 'V2')
  .map(([id, c]) => ({ id, kind: c.kind as VariantKind, variants: c.variants.filter((v) => v.id !== 'default'),
    packs: Object.fromEntries(Object.entries(names.get(id) ?? {}).filter(([p]) => c.variants.some((v) => v.built.includes(p))).map(([p, name]) => [p, { name }])) })) };

const noop = () => undefined;
const tiles = { tiles: [{ id: 's', title: 'Savings', value: '12,400.00' }, { id: 'c', title: 'Current', value: '3,210.50' }] };
const rows = { rows: [{ label: 'From', value: 'Savings ·· 4821' }, { label: 'Amount', value: '1,250.00 USD', emphasis: 'total' as const }] };
const quick = { actions: [{ id: 'send', label: 'Send', icon: '↗' }], onAction: noop };
const info = { title: 'Travel card', body: 'No fees abroad' };
const acc = { items: [{ title: 'Fees', body: 'None inside the bank.' }] };
const nav = { label: 'Main', items: [{ id: 'a', label: 'Accounts' }, { id: 'p', label: 'Payments' }], value: 'a', onChange: noop };
const summary = { label: 'Accounts', tabs: [{ id: 'cur', label: 'Current', summary: '1,200.00 USD' }, { id: 'sav', label: 'Savings', summary: '9,000.00 USD' }] };
const deck = { label: 'Offers', cards: [{ id: 'a', label: 'Travel card', content: <Text>No fees abroad</Text> }] };
const SAMPLE: Record<string, object> = {
  ActionMenu: { items: ['Download statement'] }, Card: { heading: 'Savings' },
  Tabs: { label: 'Accounts', selection: 'a', onSelectionChange: noop, tabs: [{ id: 'a', label: 'Current' }, { id: 'b', label: 'Savings' }] },
  Accordion: acc, Faq: acc, Drawer: { items: ['Accounts', 'Payments'], open: true, onOpenChange: noop }, BottomSheet: { heading: 'Filters', open: true, onOpenChange: noop },
  Stack: { children: [<Text key="a">One</Text>, <Text key="b">Two</Text>] }, Divider: { label: 'Or' },
  DataTable: { caption: 'Payments', keyField: 'id', rows: [{ id: '1', payee: 'Asha' }], columns: [{ field: 'payee', headerText: 'Payee' }] },
  Pagination: { page: 2, pageCount: 6 }, Dialog: { open: true, onOpenChange: noop, title: 'Delete the payee?' },
  AccountCard: { account: { id: 'sav', name: 'Savings', number: '0012004821', balance: 12400, currency: 'USD' } },
  QuickActions: quick, QuickLinksWidget: quick, BeneficiaryCard: { payee: { id: 'ar', name: 'A. Rao', bank: 'HSBC', number: 'GB29NWBK60161331926819' } },
  RepaymentSchedule: { instalments: [{ due: '1 Dec', principal: 180, interest: 20 }], currency: 'USD' },
  PromiseToPay: { label: 'Promise to pay', value: '', onChange: noop, onSubmit: noop, ...rows },
  SecureConfirmation: { ...rows, code: '', onCodeChange: noop, onConfirm: noop }, ApprovalDetail: { ...rows, onApprove: noop, onReject: noop },
  ProductCard: info, FinancialAdvisorWidget: info, SpecialOffersWidget: info, AccountsWidget: summary, TransactionsWidget: summary,
  AnimatedList: { items: ['Paid Asha', 'Salary in'], keyOf: (x: string) => x, renderItem: (x: string) => <Text>{x}</Text> },
  SpotlightCard: { children: <Text>Spotlight</Text> }, TiltCard: { children: <Text>Tilt</Text> }, GlowBorderCard: { children: <Text>Glow</Text> },
  FlipCard: { front: <Text>Front</Text>, back: <Text>Back</Text> }, CardStack: deck, BentoGrid: { tiles: [{ id: 'a', title: 'Spend', value: '420 USD' }] },
  PillNav: nav, DockNav: nav, CardNav: { groups: [{ id: 'g', title: 'Accounts', links: [{ id: 'l', label: 'Balances' }] }], onNavigate: noop },
  StaggeredMenu: { open: true, onOpenChange: noop, items: [{ id: 'd', label: 'Download' }], onSelect: noop },
  DocumentFolder: { title: 'Statements', documents: [{ id: 'd1', title: 'October' }], open: true, onOpenChange: noop },
  ScrollStack: { cards: [{ id: 'a', content: <Text>One</Text> }] }, ProfileCard: { name: 'Asha Rao', role: 'Relationship manager' },
};
const sampleFor = (c: Spec) => SAMPLE[c.packs['react-native'].name] ?? (c.kind === 'tiles' ? tiles : c.kind === 'kv' ? rows : {});

interface Node { props?: Record<string, unknown>; children?: unknown[] | null }
/** Every host node the screen rendered. */
function nodes(): Node[] {
  const out: Node[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n && typeof n === 'object') { out.push(n as Node); ((n as Node).children ?? []).forEach(walk); }
  };
  walk(screen.toJSON());
  return out;
}
/** True when some rendered node's style (or content container style) has every key of the variant's style. */
function drawn(patch: object): boolean {
  const want = Object.entries(patch);
  return nodes().some((n) => [n.props?.style, n.props?.contentContainerStyle].some((st) => {
    const got = StyleSheet.flatten(st as never) as Record<string, unknown> | undefined;
    return !!got && want.every(([k, v]) => JSON.stringify(got[k]) === JSON.stringify(v));
  }));
}

const lib = P as unknown as Record<string, ComponentType<Record<string, unknown>>>;
const native = spec.components.filter((c) => c.packs['react-native']);
const theme = makeTheme();

describe('variants (V2): every component and variant in the React Native pack', () => {
  it('draws every variant the spec lists for each kind, and nothing for none', () => {
    for (const c of native) { expect([c.kind, [...VARIANTS[c.kind]].sort()]).toEqual([c.kind, c.variants.map((v) => v.id).sort()]); }
    expect(variantStyle(theme, 'card', undefined)).toBeUndefined();
  });
  for (const c of native) {
    it(`${c.packs['react-native'].name}: ${c.variants.map((v) => v.id).join(', ')}`, async () => {
      const Component = lib[c.packs['react-native'].name];
      expect(Component).toBeTruthy();
      for (const v of c.variants) {
        const patch = variantStyle(theme, c.kind, v.id)!;
        expect(Object.keys(patch).length).toBeGreaterThan(0);
        const view = await render(<Component testID="x" {...sampleFor(c)} variant={v.id} /> as ReactElement);
        expect([v.id, drawn(patch)]).toEqual([v.id, true]);
        await view.unmount();
      }
      await render(<Component testID="x" {...sampleFor(c)} /> as ReactElement);
      expect(accessibilityProblems()).toEqual([]);
    });
  }
});

describe('variants (V2): structural variants', () => {
  it('compact pagination says Page x of y and still moves', async () => {
    const go = jest.fn();
    await render(<P.Pagination testID="pg" page={2} pageCount={6} onPageChange={go} variant="compact" />);
    expect(screen.getByText('Page 2 of 6')).toBeTruthy();
    expect(screen.queryByLabelText('Page 3 of 6')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Next page'));
    expect(go).toHaveBeenCalledWith(3);
  });
  it('bento tiles: the first takes the whole row', async () => {
    await render(<P.AccountSummary testID="t" {...tiles} variant="bento" />);
    expect(StyleSheet.flatten(screen.getByTestId('t-s').props.style).flexBasis).toBe('100%');
    expect(StyleSheet.flatten(screen.getByTestId('t-c').props.style).flexBasis).toBe('45%');
  });
  it('icon-start accordion puts the sign before the title; vertical tabs stack', async () => {
    await render(<P.Accordion testID="a" {...acc} variant="icon-start" />);
    expect(drawn({ flexDirection: 'row-reverse' })).toBe(true);
    await render(<P.Tabs testID="tb" label="Settings" selection="a" onSelectionChange={noop} variant="vertical" tabs={[{ id: 'a', label: 'Profile' }]} />);
    expect(nodes().some((n) => n.props?.horizontal === false)).toBe(true);
  });
});
