import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button, Card, DataTable, Dialog, IconButton, Message, Tabs, Toast, styleClasses } from '../src';
import { violations } from './a11y';

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Button and IconButton', () => {
  it('fires onAction, and not when disabled or busy', async () => {
    const pressed = vi.fn();
    const { rerender } = render(<Button label="Pay now" onAction={pressed} />);
    await userEvent.click(screen.getByRole('button', { name: 'Pay now' }));
    expect(pressed).toHaveBeenCalledTimes(1);
    rerender(<Button label="Pay now" onAction={pressed} busy />);
    await userEvent.click(screen.getByRole('button', { name: 'Pay now' }));
    expect(pressed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button').className).toBe('bx-btn bx-btn--callToAction');
  });

  it('names an icon button for screen readers', async () => {
    render(<div><IconButton label="More actions" /><Button label="Cancel" chroming="outlined" /></div>);
    expect(screen.getByRole('button', { name: 'More actions' }).getAttribute('title')).toBe('More actions');
    expect(await violations()).toEqual([]);
  });
});

function DialogHarness({ cancelBehavior }: { cancelBehavior?: 'icon' | 'none' }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button label="Delete beneficiary" onAction={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen} title="Delete A. Sharma?" description="You can add them again later." cancelBehavior={cancelBehavior}
              footer={<Button label="Delete" chroming="danger" onAction={() => setOpen(false)} />}>
        <p>Payments scheduled to A. Sharma will stop.</p>
      </Dialog>
    </div>
  );
}

describe('Dialog', () => {
  it('opens as a named modal, moves focus in, closes on Escape and gives focus back', async () => {
    render(<DialogHarness />);
    const opener = screen.getByRole('button', { name: 'Delete beneficiary' });
    await userEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Delete A. Sharma?' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(await violations(dialog)).toEqual([]);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('stays open on Escape when cancelBehavior is none', async () => {
    render(<DialogHarness cancelBehavior="none" />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete beneficiary' }));
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Toast', () => {
  it('announces errors as alerts that stay, others as status that close after five seconds', () => {
    vi.useFakeTimers();
    const closed: string[] = [];
    function Harness() {
      const [list, setList] = useState<Message[]>([
        { id: '1', severity: 'error', summary: 'Payment failed', detail: 'The account is blocked. Call the bank.' },
        { id: '2', severity: 'confirmation', summary: 'Beneficiary added' },
      ]);
      return <Toast messages={list} onClose={(m) => { closed.push(m.id); setList((l) => l.filter((x) => x.id !== m.id)); }} />;
    }
    render(<Harness />);
    expect(screen.getByRole('alert').textContent).toContain('Payment failed');
    expect(screen.getByRole('status').textContent).toContain('Beneficiary added');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(closed).toEqual(['2']);
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close the message' }));
    expect(closed).toEqual(['2', '1']);
  });

  it('has no accessibility problems', async () => {
    render(<Toast messages={[{ id: '1', severity: 'warning', summary: 'Your session ends in 2 minutes' }]} onClose={() => undefined} />);
    expect(await violations()).toEqual([]);
  });
});

describe('Card', () => {
  it('is a button only when it has an action, and works from the keyboard', async () => {
    const opened = vi.fn();
    const { rerender } = render(<Card heading="Savings •••• 4521" subheading="Available 85,000.00">Body</Card>);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<Card heading="Savings •••• 4521" onAction={opened}>Body</Card>);
    const card = screen.getByRole('button');
    card.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(opened).toHaveBeenCalledTimes(2);
    expect(await violations()).toEqual([]);
  });
});

describe('Tabs', () => {
  it('selects with a click and with the arrow keys, and ties panels to tabs', async () => {
    function Harness() {
      const [tab, setTab] = useState('c');
      return <Tabs label="Accounts" selection={tab} onSelectionChange={setTab} tabs={[
        { id: 'c', label: 'Current', content: <p>Current accounts</p> }, { id: 's', label: 'Savings', content: <p>Savings accounts</p> },
        { id: 'd', label: 'Deposits', content: <p>Deposits</p> }]} />;
    }
    render(<Harness />);
    expect(screen.getByRole('tablist', { name: 'Accounts' })).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Savings' }));
    expect(screen.getByRole('tab', { name: 'Savings' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toBe('Savings accounts');
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Deposits' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Deposits' }).className).toContain('is-on');
    expect(await violations()).toEqual([]);
  });
});

describe('DataTable', () => {
  const rows = [
    { id: 't1', date: '2026-11-12', text: 'Electricity bill', amount: -1240 },
    { id: 't2', date: '2026-11-11', text: 'Salary', amount: 85000 },
    { id: 't3', date: '2026-11-09', text: 'Card payment', amount: -3499 },
  ];
  const columns = [
    { field: 'date' as const, headerText: 'Date', sortable: true },
    { field: 'text' as const, headerText: 'Description' },
    { field: 'amount' as const, headerText: 'Amount', sortable: true, align: 'end' as const, render: (r: typeof rows[number]) => r.amount.toFixed(2) },
  ];

  it('sorts numbers as numbers and says how it is sorted', async () => {
    const sorted = vi.fn();
    render(<DataTable caption="Recent transactions" rows={rows} columns={columns} keyField="id" onSort={sorted} />);
    await userEvent.click(screen.getByRole('button', { name: 'Amount' }));
    const amounts = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[2].textContent);
    expect(amounts()).toEqual(['-3499.00', '-1240.00', '85000.00']);
    expect(screen.getByRole('columnheader', { name: /Amount/ }).getAttribute('aria-sort')).toBe('ascending');
    await userEvent.click(screen.getByRole('button', { name: /Amount/ }));
    expect(amounts()).toEqual(['85000.00', '-1240.00', '-3499.00']);
    expect(sorted).toHaveBeenLastCalledWith('amount', 'descending');
    expect(await violations()).toEqual([]);
  });

  it('selects rows and shows the empty state', async () => {
    let seen: string[] = [];
    function Harness() {
      const [sel, setSel] = useState<string[]>([]);
      return <DataTable caption="Transactions" rows={rows} columns={columns} keyField="id" selectionMode="multiple" selected={sel}
                        onSelectedChange={(k) => { seen = k; setSel(k); }} />;
    }
    render(<Harness />);
    await userEvent.click(screen.getByLabelText('Select row t2'));
    await userEvent.click(screen.getByLabelText('Select row t3'));
    expect(seen).toEqual(['t2', 't3']);
    expect(await violations()).toEqual([]);
    cleanup();
    render(<DataTable caption="Transactions" rows={[]} columns={columns} keyField="id" />);
    expect(screen.getByText('No data to show.')).toBeTruthy();
  });
});

describe('The skin and the component style', () => {
  it('uses the premium JET pack\'s skin unchanged, so both web packs look the same', () => {
    const here = readFileSync(resolve(__dirname, '../src/bx.css'), 'utf8');
    const jet = readFileSync(resolve(__dirname, '../../jet-premium/bx/bx.css'), 'utf8');
    expect(here).toBe(jet);
  });

  it('turns a component style into the same classes as the JET pack', () => {
    expect(styleClasses({ look: 'glass', motion: { hover: 'lift', click: 'ripple' }, mode: 'dark' }))
      .toBe('bx-theme bx-look-glass bx-motion-hover-lift bx-motion-click-ripple bx-dark');
    expect(styleClasses()).toBe('bx-theme bx-look-elevated');
  });
});
