import { Component, Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent, getAllByRole, getByRole, getByText, queryByRole, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button, Card, Column, DataTable, Dialog, IconButton, Message, Tabs, Toast, styleClasses } from '../src';
import { violations } from './a11y';

async function mount<T>(host: Type<T>) {
  const fixture = TestBed.createComponent(host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  document.body.appendChild(fixture.nativeElement);
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance, settle: () => fixture.whenStable() };
}

afterEach(() => { document.body.innerHTML = ''; TestBed.resetTestingModule(); vi.useRealTimers(); });

describe('Button and IconButton', () => {
  @Component({ imports: [Button, IconButton], template: `
    <bx-button label="Pay now" [busy]="busy()" (action)="presses = presses + 1" />
    <bx-icon-button label="More actions" />` })
  class Host { busy = signal(false); presses = 0; }

  it('fires (action), and not when busy; names an icon button', async () => {
    const { el, host, settle } = await mount(Host);
    await userEvent.click(getByRole(el, 'button', { name: 'Pay now' }));
    expect(host.presses).toBe(1);
    host.busy.set(true);
    await settle();
    await userEvent.click(getByRole(el, 'button', { name: 'Pay now' }));
    expect(host.presses).toBe(1);
    expect(getByRole(el, 'button', { name: 'Pay now' }).getAttribute('aria-busy')).toBe('true');
    expect(getByRole(el, 'button', { name: 'More actions' }).getAttribute('title')).toBe('More actions');
    expect(await violations(el)).toEqual([]);
  });
});

describe('Dialog', () => {
  @Component({ imports: [Dialog, Button], template: `
    <bx-button label="Delete beneficiary" (action)="open.set(true)" />
    <bx-dialog [(open)]="open" dialogTitle="Delete A. Sharma?" description="You can add them again later." [cancelBehavior]="cancel">
      <p>Payments scheduled to A. Sharma will stop.</p>
      <bx-button footer label="Delete" chroming="danger" (action)="open.set(false)" />
    </bx-dialog>` })
  class Host { open = signal(false); cancel: 'icon' | 'none' = 'icon'; }

  it('opens as a named modal, moves focus in, closes on Escape and gives focus back', async () => {
    const { el, host, settle } = await mount(Host);
    const opener = getByRole(el, 'button', { name: 'Delete beneficiary' });
    opener.focus();
    await userEvent.click(opener);
    await settle();
    await new Promise((r) => setTimeout(r, 0));
    const dialog = getByRole(el, 'dialog', { name: 'Delete A. Sharma?' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(await violations(dialog)).toEqual([]);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await settle();
    await new Promise((r) => setTimeout(r, 0));
    expect(host.open()).toBe(false);
    expect(queryByRole(el, 'dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('stays open on Escape when cancelBehavior is none', async () => {
    TestBed.overrideComponent(Host, { set: {} });
    const { el, host, settle } = await mount(Host);
    host.cancel = 'none';
    host.open.set(true);
    await settle();
    expect(queryByRole(el, 'button', { name: 'Close' })).toBeNull();
    fireEvent.keyDown(getByRole(el, 'dialog'), { key: 'Escape' });
    await settle();
    expect(getByRole(el, 'dialog')).toBeTruthy();
    await userEvent.click(getByRole(el, 'button', { name: 'Delete' }));
    await settle();
    expect(queryByRole(el, 'dialog')).toBeNull();
  });
});

describe('Toast', () => {
  @Component({ imports: [Toast], template: '<bx-toast [messages]="list()" (closed)="close($event)" />' })
  class Host {
    closed: string[] = [];
    list = signal<Message[]>([
      { id: '1', severity: 'error', summary: 'Payment failed', detail: 'The account is blocked. Call the bank.' },
      { id: '2', severity: 'confirmation', summary: 'Beneficiary added', autoTimeout: 40 },
    ]);
    close(m: Message) { this.closed.push(m.id); this.list.update((l) => l.filter((x) => x.id !== m.id)); }
  }

  it('announces errors as alerts that stay, others as status that close on time', async () => {
    const { el, host, settle } = await mount(Host);
    expect(getByRole(el, 'alert').textContent).toContain('Payment failed');
    expect(getByRole(el, 'status').textContent).toContain('Beneficiary added');
    expect(await violations(el)).toEqual([]);
    await new Promise((r) => setTimeout(r, 80));
    await settle();
    expect(host.closed).toEqual(['2']);
    expect(queryByRole(el, 'status')).toBeNull();
    getByRole(el, 'button', { name: 'Close the message' }).click();
    await settle();
    expect(host.closed).toEqual(['2', '1']);
  });
});

describe('Card', () => {
  @Component({ imports: [Card], template: `
    <bx-card heading="Savings •••• 4521" subheading="Available 85,000.00">Body</bx-card>
    <bx-card heading="Current •••• 0187" [interactive]="true" (action)="opened = opened + 1">Body</bx-card>` })
  class Host { opened = 0; }

  it('is a button only when interactive, and works from the keyboard', async () => {
    const { el, host } = await mount(Host);
    const buttons = getAllByRole(el, 'button');
    expect(buttons.length).toBe(1);
    buttons[0].focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(host.opened).toBe(2);
    expect(await violations(el)).toEqual([]);
  });
});

describe('Tabs', () => {
  @Component({ imports: [Tabs], template: `
    <bx-tabs #t label="Accounts" [tabs]="tabs" [(selection)]="tab" />
    <div role="tabpanel" [id]="t.panelId(tab())" [attr.aria-labelledby]="t.tabId(tab())">{{ tab() }} accounts</div>` })
  class Host { tab = signal('c'); tabs = [{ id: 'c', label: 'Current' }, { id: 's', label: 'Savings' }, { id: 'd', label: 'Deposits' }]; }

  it('selects with a click and with the arrow keys, Home and End', async () => {
    const { el, host, settle } = await mount(Host);
    expect(getByRole(el, 'tablist', { name: 'Accounts' })).toBeTruthy();
    await userEvent.click(getByRole(el, 'tab', { name: 'Savings' }));
    await settle();
    expect(host.tab()).toBe('s');
    expect(getByRole(el, 'tab', { name: 'Savings' }).getAttribute('aria-selected')).toBe('true');
    expect(getByRole(el, 'tab', { name: 'Current' }).getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(getByRole(el, 'tab', { name: 'Savings' }), { key: 'ArrowRight' });
    await settle();
    expect(host.tab()).toBe('d');
    fireEvent.keyDown(getByRole(el, 'tab', { name: 'Deposits' }), { key: 'Home' });
    await settle();
    expect(host.tab()).toBe('c');
    expect(getByRole(el, 'tabpanel', { name: 'Current' })).toBeTruthy();
    expect(await violations(el)).toEqual([]);
  });
});

describe('DataTable', () => {
  const rows = [
    { id: 't1', date: '2026-11-12', text: 'Electricity bill', amount: -1240 },
    { id: 't2', date: '2026-11-11', text: 'Salary', amount: 85000 },
    { id: 't3', date: '2026-11-09', text: 'Card payment', amount: -3499 },
  ];
  const columns: Column[] = [
    { field: 'date', headerText: 'Date', sortable: true },
    { field: 'text', headerText: 'Description' },
    { field: 'amount', headerText: 'Amount', sortable: true, align: 'end', format: (r) => (r['amount'] as number).toFixed(2) },
  ];

  @Component({ imports: [DataTable], template: `
    <bx-data-grid caption="Recent transactions" [rows]="rows" [columns]="columns" selectionMode="multiple" [(selected)]="selected" (sorted)="last = $event" />` })
  class Host { rows = rows; columns = columns; selected = signal<readonly string[]>([]); last: unknown = null; }

  it('sorts numbers as numbers, says how it is sorted and selects rows', async () => {
    const { el, host, settle } = await mount(Host);
    await userEvent.click(getByRole(el, 'button', { name: 'Amount' }));
    await settle();
    const amounts = () => getAllByRole(el, 'row').slice(1).map((r) => within(r).getAllByRole('cell')[3].textContent);
    expect(amounts()).toEqual(['-3499.00', '-1240.00', '85000.00']);
    expect(getByRole(el, 'columnheader', { name: /Amount/ }).getAttribute('aria-sort')).toBe('ascending');
    await userEvent.click(getByRole(el, 'button', { name: /Amount/ }));
    await settle();
    expect(amounts()).toEqual(['85000.00', '-1240.00', '-3499.00']);
    expect(host.last).toEqual({ field: 'amount', direction: 'descending' });
    await userEvent.click(getByRole(el, 'checkbox', { name: 'Select row t2' }));
    await userEvent.click(getByRole(el, 'checkbox', { name: 'Select row t3' }));
    await settle();
    expect(host.selected()).toEqual(['t2', 't3']);
    expect(await violations(el)).toEqual([]);
  });

  it('shows the empty state', async () => {
    @Component({ imports: [DataTable], template: '<bx-data-grid caption="Transactions" [rows]="[]" [columns]="columns" />' })
    class Empty { columns = columns; }
    const { el } = await mount(Empty);
    expect(getByText(el, 'No data to show.')).toBeTruthy();
  });
});

describe('The skin and the component style', () => {
  it('uses the premium JET pack\'s skin unchanged, so every web pack looks the same', () => {
    const here = readFileSync(resolve(__dirname, '../src/bx.css'), 'utf8');
    const jet = readFileSync(resolve(__dirname, '../../jet-premium/bx/bx.css'), 'utf8');
    expect(here).toBe(jet);
  });

  it('turns a component style into the same classes as the JET pack', () => {
    expect(styleClasses({ look: 'glass', motion: { hover: 'lift', click: 'ripple' }, mode: 'dark' }))
      .toBe('bx-theme bx-look-glass bx-motion-hover-lift bx-motion-click-ripple bx-dark');
  });
});
