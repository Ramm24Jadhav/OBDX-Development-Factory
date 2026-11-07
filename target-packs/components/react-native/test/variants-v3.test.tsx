import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ComponentType } from 'react';

import * as bx from '../src';
import { accessibilityProblems } from './a11y';

interface Entry { kind: string; packs: Record<string, { name: string; variants: string[] } | null> }
const v3 = JSON.parse(readFileSync(resolve(__dirname, '../../variants/v3.json'), 'utf8')) as { components: Record<string, Entry> };

const noop = () => undefined;
const tl = [{ label: 'Initiated', meta: 'A. Rao · 09:12' }, { label: 'Waiting, level 2', meta: 'Finance head', state: 'current' as const }];
const meters = { items: [{ label: 'Groceries', value: 320, max: 400 }, { label: 'Eating out', value: 210, max: 200 }] };
const bars = { label: 'Spending', currency: 'USD', bars: [{ label: 'Jan', value: 1240 }, { label: 'Feb', value: 980 }] };
/** A sample per kind (and per component where its props differ), enough to draw every part of a variant. */
const SAMPLE: Record<string, Record<string, unknown>> = {
  alert: { heading: 'Heads up', message: 'Transfers after 6 pm arrive the next working day.', actionLabel: 'Details', onAction: noop, dismissible: true },
  toast: { messages: [{ id: '1', summary: 'Payment sent', detail: 'Ref PAY-4410', severity: 'confirmation' }], onClose: noop },
  tooltip: { label: 'APR', text: 'The yearly rate, with fees' },
  badges: { label: 'Paid', tone: 'success' },
  spinner: { label: 'Loading accounts' },
  skeleton: { lines: 2 },
  empty: { heading: 'No payees yet', text: 'Add one to pay them faster.', actionLabel: 'Add payee', onAction: noop },
  progress: meters,
  stepper: { steps: ['Details', 'Verify', 'Done'], selectedStep: 'Verify' },
  timeline: { items: tl },
  status: { label: 'Payment sent' },
  timeout: { open: true, seconds: 60, onStay: noop, onSignOut: noop },
  chart: bars,
  rating: { label: 'How was it?', value: 3, onChange: noop },
};
const BY_NAME: Record<string, Record<string, unknown>> = {
  PaymentStatus: { value: 2 },
  SavingsGoal: { label: 'Holiday fund', saved: 1800, target: 3000, currency: 'USD' },
  CreditScoreWidget: { score: 742, max: 900, band: 'Good' },
  DelinquencyNotice: { overdue: true },
  SwipeToast: { message: 'Saved', onDismiss: noop },
  StatusMark: { label: 'Payment', status: 'success' },
  BudgetGauge: { label: 'Groceries', value: 320, max: 400 },
};

const rows = Object.entries(v3.components).flatMap(([id, c]) => (c.packs['react-native']
  ? c.packs['react-native'].variants.filter((v) => v !== 'standard').map((variant) => ({ id, kind: c.kind, name: c.packs['react-native']!.name, variant })) : []));

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };
const A11Y = ['accessibilityRole', 'role', 'accessibilityLabel', 'aria-label', 'accessibilityValue', 'aria-valuenow', 'aria-valuemax', 'aria-valuetext', 'accessibilityState',
  'accessibilityLiveRegion', 'accessible'];
/** What a screen reader gets: every node's accessibility props, in order (the look left out). */
function a11y(node: Node | Node[] | string | null, out: string[] = []): string[] {
  if (!node || typeof node === 'string') { return out; }
  if (Array.isArray(node)) { node.forEach((n) => a11y(n, out)); return out; }
  if (node.props['aria-hidden'] || node.props.importantForAccessibility === 'no-hide-descendants') { return out; }
  const own = A11Y.filter((k) => node.props[k] !== undefined).map((k) => `${k}=${JSON.stringify(node.props[k])}`);
  if (own.length) { out.push(own.join(' ')); }
  (node.children ?? []).forEach((c) => a11y(c as Node, out));
  return out;
}

async function draw(name: string, kind: string, variant: string) {
  const C = (bx as unknown as Record<string, ComponentType<Record<string, unknown>>>)[name];
  const view = await render(<C testID="x" {...SAMPLE[kind]} {...BY_NAME[name]} variant={variant} />);
  // tooltips show their bubble when the button is pressed
  if (kind === 'tooltip') { await fireEvent.press(screen.getByLabelText(/^About /)); }
  const tree = view.toJSON() as unknown as Node;
  const out = { look: JSON.stringify(tree), said: a11y(tree), problems: accessibilityProblems() };
  await view.unmount();
  return out;
}

describe('V3 variants (feedback and status)', () => {
  it('lists every React Native component of the wave', () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(Object.values(v3.components).filter((c) => c.packs['react-native']).length);
    rows.forEach((r) => expect(typeof (bx as Record<string, unknown>)[r.name]).toBe('function'));
  });

  it.each(rows.map((r) => [`${r.name} ${r.variant}`, r] as const))('%s: a new look, the same for screen readers', async (_, r) => {
    const standard = await draw(r.name, r.kind, 'standard');
    const variant = await draw(r.name, r.kind, r.variant);
    expect(variant.look).not.toBe(standard.look);
    expect(variant.said).toEqual(standard.said);
    expect(variant.problems).toEqual([]);
  });

  it('the orb is drawn from thinking-orbs frames, hidden from screen readers, and moves', async () => {
    jest.useFakeTimers();
    await render(<bx.ActivityIndicator variant="orbs" orbState="searching" size="lg" label="Searching your statements" />);
    expect(screen.getByLabelText('Searching your statements').props.accessibilityRole).toBe('progressbar');
    const before = JSON.stringify(screen.toJSON());
    await act(async () => { jest.advanceTimersByTime(200); });
    expect(JSON.stringify(screen.toJSON())).not.toBe(before);
    jest.useRealTimers();
  });

  it('ring meters show the share, the countdown ring the seconds, faces and numbers rate like stars', async () => {
    await render(<bx.ProgressBar testID="x" variant="ring" items={[{ label: 'Groceries', value: 320, max: 400 }]} />);
    expect(screen.getByText('80%', { includeHiddenElements: true })).toBeTruthy();
    await render(<bx.SessionExpiryWarning testID="t" open seconds={45} variant="countdown" onStay={noop} onSignOut={noop} />);
    expect(screen.getByText('45', { includeHiddenElements: true })).toBeTruthy();
    const onChange = jest.fn();
    await render(<bx.FeedbackRating testID="r" label="Rate" value={null} onChange={onChange} variant="emoji" />);
    await fireEvent.press(screen.getByTestId('r-4'));
    expect(onChange).toHaveBeenCalledWith(4);
  });
});
