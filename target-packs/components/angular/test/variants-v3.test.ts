import { Type, reflectComponentType } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { getAllByRole, getByRole } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { OBDX_COMPONENTS } from '../src';
import { violations } from './a11y';

interface Entry { kind: string; packs: Record<string, { name: string; variants: string[] } | null> }
const v3 = JSON.parse(readFileSync(resolve(__dirname, '../../variants/v3.json'), 'utf8')) as { components: Record<string, Entry> };

/** Each component class by its selector. */
const BY_SELECTOR = new Map<string, Type<unknown>>(OBDX_COMPONENTS.map((c) => [reflectComponentType(c as Type<unknown>)!.selector, c as Type<unknown>]));

const tl = [{ label: 'Initiated', meta: 'A. Rao · 09:12' }, { label: 'Waiting, level 2', meta: 'Finance head', state: 'current' }];
const SAMPLE: Record<string, Record<string, unknown>> = {
  alert: { heading: 'Heads up', message: 'Transfers after 6 pm arrive the next working day.', actionLabel: 'Details', dismissible: true },
  toast: { messages: [{ id: '1', summary: 'Payment sent', detail: 'Ref PAY-4410', severity: 'confirmation' }] },
  tooltip: { label: 'APR', text: 'The yearly rate, with fees' },
  badges: { label: 'Paid', tone: 'success' },
  spinner: { label: 'Loading accounts' },
  skeleton: { lines: 2, shape: 'card' },
  empty: { heading: 'No payees yet', text: 'Add one to pay them faster.', actionLabel: 'Add payee' },
  progress: { items: [{ label: 'Groceries', value: 320, max: 400 }, { label: 'Eating out', value: 210, max: 200 }] },
  stepper: { steps: ['Details', 'Verify', 'Done'], selectedStep: 'Verify' },
  timeline: { items: tl },
  status: { label: 'Payment sent', text: 'Ref PAY-4410' },
  timeout: { open: true, seconds: 60 },
  chart: { heading: 'Spending', unit: 'USD', items: [{ label: 'Oct', value: 820 }, { label: 'Nov', value: 1640 }] },
  rating: { value: 3 },
};
const BY_SELECTOR_SAMPLE: Record<string, Record<string, unknown>> = {
  'bx-swipe-toast': { message: 'Saved' },
  'bx-status-mark': { label: 'Paid', status: 'success' },
  'bx-budget-gauge': { label: 'Groceries', value: 320, max: 400, unit: 'USD' },
};

async function mount(c: Type<unknown>, inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(c);
  Object.entries(inputs).forEach(([k, v]) => fixture.componentRef.setInput(k, v));
  fixture.autoDetectChanges();
  await fixture.whenStable();
  document.body.appendChild(fixture.nativeElement);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

afterEach(() => { document.body.innerHTML = ''; TestBed.resetTestingModule(); });

const rows = Object.entries(v3.components).flatMap(([id, c]) => (c.packs.angular
  ? c.packs.angular.variants.map((variant) => ({ id, kind: c.kind, name: c.packs.angular!.name, variant })) : []));

describe('V3 variants (feedback and status)', () => {
  it('lists every Angular component of the wave', () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(47);
    rows.forEach((r) => expect(BY_SELECTOR.has(r.name), r.name).toBe(true));
  });

  it.each(rows.map((r) => [`${r.name} ${r.variant}`, r] as const))('%s: has its class and passes axe', async (_, r) => {
    await mount(BY_SELECTOR.get(r.name)!, { ...SAMPLE[r.kind], ...BY_SELECTOR_SAMPLE[r.name], variant: r.variant });
    expect(document.querySelector(`.bx-${r.kind}--${r.variant}`), `${r.name} ${r.variant}`).not.toBeNull();
    if (r.kind === 'progress') { expect(getAllByRole(document.body, 'progressbar').length).toBeGreaterThan(0); }
    if (r.kind === 'spinner') { expect(getByRole(document.body, 'status').textContent).toContain('Loading accounts'); }
    if (r.kind === 'rating') { expect(getAllByRole(document.body, 'radio')).toHaveLength(5); }
    if (r.kind === 'stepper') { expect(document.querySelector('[aria-current="step"]')).not.toBeNull(); }
    expect(await violations()).toEqual([]);
  });

  it('faces rating chooses like the stars; numbers mark the chosen one', async () => {
    const { fixture } = await mount(BY_SELECTOR.get('bx-feedback')!, { value: 2, variant: 'emoji' });
    await userEvent.click(getAllByRole(document.body, 'radio', { name: /4 stars/ })[0]);
    await fixture.whenStable();
    expect(document.querySelector('.bx-star.is-chosen')?.textContent).toContain('🙂');
  });

  it('ring and segmented meters show the share; the countdown ring shows the seconds', async () => {
    await mount(BY_SELECTOR.get('bx-budget-progress')!, { variant: 'ring', items: [{ label: 'Groceries', value: 320, max: 400 }] });
    expect(document.querySelector('.bx-meter-pct')?.textContent).toBe('80%');
    document.body.innerHTML = '';
    await mount(BY_SELECTOR.get('bx-budgets')!, { variant: 'segmented', items: [{ label: 'Fuel', value: 50, max: 100 }] });
    expect(document.querySelectorAll('.bx-meter-segs .is-on')).toHaveLength(5);
    document.body.innerHTML = '';
    await mount(BY_SELECTOR.get('bx-session-timeout')!, { open: true, seconds: 45, variant: 'countdown' });
    expect(document.querySelector('.bx-countdown-num')?.textContent).toBe('45');
  });

  it('the orb spinner draws a thinking orb, hidden, with the label for screen readers', async () => {
    await mount(BY_SELECTOR.get('bx-spinner')!, { variant: 'orbs', orbState: 'searching', size: 'lg', label: 'Searching your statements' });
    expect(document.querySelector('canvas.bx-orb.is-lg')?.getAttribute('aria-hidden')).toBe('true');
    expect(getByRole(document.body, 'status').textContent?.trim()).toBe('Searching your statements');
  });

  it('the meter chart splits one bar by the figures', async () => {
    await mount(BY_SELECTOR.get('bx-spending-chart')!, { variant: 'meter', items: [{ label: 'A', value: 25 }, { label: 'B', value: 75 }] });
    expect([...document.querySelectorAll('.bx-meter-seg')].map((s) => [...s.classList].sort().join(' '))).toEqual(['bx-meter-seg bx-seg-0 bx-w-25', 'bx-meter-seg bx-seg-1 bx-w-75']);
  });
});
