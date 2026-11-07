import { render, screen } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Children, Fragment, ReactElement, cloneElement } from 'react';

import { AccountBalance, ApprovalQueue, Avatar, CardTile, LoanCalculator, TransactionHistory } from '../src';
import { hueOf } from '../src/bankVariants';
import { SAMPLES } from '../gates/samples';

// Wave V4's banking widgets the pack has (38 of the 42 with variants; spend-limit takes the slider's) and the variants variants.json lists as built here; their states are in variants/v4.json
interface Entry { kind: string; wave: string; variants: Array<{ id: string; built: string[] }> }
const states = (JSON.parse(readFileSync(join(__dirname, '..', '..', 'variants', 'v4.json'), 'utf8')) as { components: Record<string, { states: { loadingProperty?: boolean } }> }).components;
const v4 = Object.entries((JSON.parse(readFileSync(join(__dirname, '..', '..', 'variants.json'), 'utf8')) as { components: Record<string, Entry> }).components)
  .filter(([, c]) => c.wave === 'V4' && c.variants.some((v) => v.id !== 'default' && v.built.includes('react-native')))
  .map(([id, c]) => ({ id, kind: c.kind, variants: c.variants, states: states[id].states }));

const noop = () => undefined;
// The five the gallery shows in its own sections, so they are not in SAMPLES
const OWN: Record<string, ReactElement> = {
  'balance-card': <AccountBalance testID="balance-card" label="Savings ·· 4821" balance={12400} available={12150} currency="USD" />,
  'transaction-list': <TransactionHistory testID="transaction-list" transactions={[{ id: 't1', description: 'Salary', date: '31 Dec', amount: 3200, currency: 'USD' }]} />,
  'card-tile': <CardTile testID="card-tile" card={{ id: 'c', name: 'Platinum', number: '4111111111114821', network: 'Visa' }} frozen={false} />,
  'approval-queue': <ApprovalQueue testID="approval-queue" items={[{ id: 'a', title: 'Payroll', meta: '12 Jan', value: '182,400.00' }]} onApprove={noop} />,
  'loan-calculator': <LoanCalculator testID="loan-calculator" value={{ amount: 10000, rate: 9.5, months: 36 }} currency="USD" />,
};
// a sample with variants is a fragment: the default instance, then each <Variant>; the default is the one to clone
const sample = (id: string) => {
  const el = (OWN[id] ?? SAMPLES[id][1]) as ReactElement<{ children?: ReactElement[] }>;
  return (el.type === Fragment ? Children.toArray(el.props.children)[0] : el) as ReactElement<Record<string, unknown>>;
};
const drawn = async (id: string, props: Record<string, unknown>) => {
  const r = await render(cloneElement(sample(id), props));
  const json = JSON.stringify(r.toJSON());
  await r.unmount();
  return json;
};

describe('wave V4 variants', () => {
  it('every V4 component the pack has is in the samples', () => {
    expect(v4.length).toBe(38);
    expect(v4.filter((c) => !OWN[c.id] && !SAMPLES[c.id]).map((c) => c.id)).toEqual([]);
  });

  for (const c of v4) {
    it(`${c.id}: the default variant is its own look and every other variant draws differently`, async () => {
      const own = await drawn(c.id, {});
      expect(await drawn(c.id, { variant: 'default' })).toBe(own);
      const looks: Array<readonly [string, string]> = [];
      for (const v of c.variants.filter((x) => x.id !== 'default')) { looks.push([v.id, await drawn(c.id, { variant: v.id })]); }
      expect(looks.filter(([, json]) => json === own).map(([id]) => id)).toEqual([]);
      // and no two variants look the same
      expect(new Set(looks.map(([, json]) => json)).size).toBe(looks.length);
    });
  }

  for (const c of v4.filter((x) => x.states.loadingProperty)) {
    it(`${c.id}: loading shows a busy progress bar named Loading in place of the rows`, async () => {
      await render(cloneElement(sample(c.id), { loading: true }));
      const bar = screen.getByLabelText('Loading');
      expect([bar.props.accessibilityRole, bar.props.accessibilityState]).toEqual(['progressbar', { busy: true }]);
    });
  }

  it('the tonal avatar takes its colour from a hue of the name, the same in every pack', async () => {
    expect(hueOf('A. Rao')).toBe(133);
    await render(<Avatar testID="av" name="A. Rao" variant="tonal" />);
    expect(JSON.stringify(screen.getByTestId('av').props.style)).toContain('hsl(133, 60%');
  });
});
