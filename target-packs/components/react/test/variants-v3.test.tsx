import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ComponentType } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as bx from '../src';
import { violations } from './a11y';

afterEach(cleanup);

interface Entry { kind: string; variants: { id: string }[]; packs: Record<string, { name: string; variants: string[] } | null> }
const v3 = JSON.parse(readFileSync(resolve(process.cwd(), '../variants/v3.json'), 'utf8')) as { components: Record<string, Entry> };

const tl = [{ label: 'Initiated', meta: 'A. Rao · 09:12' }, { label: 'Waiting, level 2', meta: 'Finance head', state: 'current' as const }];
const meters = { items: [{ label: 'Groceries', value: 320, max: 400 }, { label: 'Eating out', value: 210, max: 200 }] };
/** A sample per kind (and per component where it differs), enough to draw every part of a variant. */
const SAMPLE: Record<string, Record<string, unknown>> = {
  alert: { heading: 'Heads up', message: 'Transfers after 6 pm arrive the next working day.', actionLabel: 'Details', dismissible: true },
  toast: { messages: [{ id: '1', summary: 'Payment sent', detail: 'Ref PAY-4410', severity: 'confirmation' }], onClose: () => undefined },
  tooltip: { label: 'APR', text: 'The yearly rate, with fees' },
  badges: { label: 'Paid', tone: 'success' },
  spinner: { label: 'Loading accounts' },
  skeleton: { lines: 2, shape: 'card' },
  empty: { heading: 'No payees yet', text: 'Add one to pay them faster.', actionLabel: 'Add payee' },
  progress: meters,
  stepper: { steps: ['Details', 'Verify', 'Done'], selectedStep: 'Verify' },
  timeline: { items: tl },
  status: { label: 'Payment sent', text: 'Ref PAY-4410' },
  timeout: { open: true, seconds: 60 },
  chart: { heading: 'Spending', unit: 'USD', items: [{ label: 'Oct', value: 820 }, { label: 'Nov', value: 1640 }] },
  rating: { value: 3 },
};
const BY_NAME: Record<string, Record<string, unknown>> = {
  SwipeToast: { message: 'Saved' },
  StatusMark: { label: 'Paid', status: 'success' },
  BudgetGauge: { label: 'Groceries', value: 320, max: 400, unit: 'USD' },
};

const rows = Object.entries(v3.components).flatMap(([id, c]) => (c.packs.react
  ? c.packs.react.variants.map((variant) => ({ id, kind: c.kind, name: c.packs.react!.name, variant })) : []));

describe('V3 variants (feedback and status)', () => {
  it('lists every React component of the wave', () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(47);
    rows.forEach((r) => expect(typeof (bx as Record<string, unknown>)[r.name], r.name).toBe('function'));
  });

  it.each(rows.map((r) => [`${r.name} ${r.variant}`, r] as const))('%s: has its class and passes axe', async (_, r) => {
    const C = (bx as unknown as Record<string, ComponentType<Record<string, unknown>>>)[r.name];
    render(<C testID="it" {...SAMPLE[r.kind]} {...BY_NAME[r.name]} variant={r.variant} />);
    expect(document.querySelector(`.bx-${r.kind}--${r.variant}`), `${r.name} ${r.variant}`).not.toBeNull();
    if (r.kind === 'progress') { expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0); }
    if (r.kind === 'spinner') { expect(screen.getByRole('status').textContent).toContain('Loading accounts'); }
    if (r.kind === 'rating') { expect(screen.getAllByRole('radio')).toHaveLength(5); }
    if (r.kind === 'stepper') { expect(document.querySelector('[aria-current="step"]')).not.toBeNull(); }
    expect(await violations()).toEqual([]);
  });

  it('Material alert on MUI keeps Dismiss and the action', async () => {
    const onClose = vi.fn();
    const onAction = vi.fn();
    render(<bx.Alert message="Card blocked" severity="error" actionLabel="Unblock" onAction={onAction} dismissible onClose={onClose} variant="filled" />);
    expect(screen.getByRole('alert').className).toContain('MuiAlert');
    await userEvent.click(screen.getByRole('button', { name: 'Unblock' }));
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onAction).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('snackbar toast closes the message it belongs to', async () => {
    const onClose = vi.fn();
    render(<bx.Toast variant="snackbar" onClose={onClose} messages={[{ id: 'a', summary: 'Saved' }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close the message' }));
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('faces and numbers ratings choose like the stars', async () => {
    const onChange = vi.fn();
    render(<><bx.FeedbackRating variant="emoji" value={0} onChange={onChange} /><bx.FeedbackRating label="Score" variant="numbers" value={2} /></>);
    await userEvent.click(screen.getAllByRole('radio', { name: /4 stars/ })[0]);
    expect(onChange).toHaveBeenCalledWith(4);
    expect(document.querySelector('.bx-rating--numbers .is-chosen')?.textContent).toContain('2');
  });

  it('ring and segmented meters show the share; the countdown ring shows the seconds', () => {
    render(<><bx.ProgressBar variant="ring" items={[{ label: 'Groceries', value: 320, max: 400 }]} /><bx.ProgressBar variant="segmented" items={[{ label: 'Fuel', value: 50, max: 100 }]} /></>);
    expect(document.querySelector('.bx-meter-pct')?.textContent).toBe('80%');
    expect(document.querySelectorAll('.bx-meter-segs .is-on')).toHaveLength(5);
    cleanup();
    render(<bx.SessionExpiryWarning open seconds={45} variant="countdown" />);
    expect(document.querySelector('.bx-countdown-num')?.textContent).toBe('45');
  });

  it('the orb spinner draws a thinking orb in the state asked for, with the label for screen readers', () => {
    render(<bx.Spinner variant="orbs" orbState="searching" size="lg" label="Searching your statements" />);
    const orb = document.querySelector('canvas.bx-orb');
    expect(orb?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('Searching your statements');
  });

  it('the meter chart splits one bar by the figures', () => {
    render(<bx.BarChart heading="Mix" variant="meter" items={[{ label: 'A', value: 25 }, { label: 'B', value: 75 }]} />);
    expect([...document.querySelectorAll('.bx-meter-seg')].map((s) => s.className)).toEqual(['bx-meter-seg bx-w-25 bx-seg-0', 'bx-meter-seg bx-w-75 bx-seg-1']);
  });
});
