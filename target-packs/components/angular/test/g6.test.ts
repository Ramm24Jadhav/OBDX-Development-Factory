import { Component, Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent, getByRole } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { AccountsWidget, BulkUploadWidget, CorporateLimitsWidget, CreditLineWidget, CurrencyPositionWidget, FinancialOverviewWidget, LastPaymentsWidget, MyLimitsWidget,
  NotificationsWidget, PendingActionWidget, PendingApprovalsWidget, QuickLinksWidget, ReportsWidget, TradeBillsWidget, TradeInstrumentsWidget, TransactionsWidget,
  WorkSnapshotWidget } from '../src';
import { violations } from './a11y';

async function mount<T>(host: Type<T>) {
  const fixture = TestBed.createComponent(host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  document.body.appendChild(fixture.nativeElement);
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance, settle: () => fixture.whenStable() };
}

afterEach(() => { document.body.innerHTML = ''; TestBed.resetTestingModule(); });

describe('group 6', () => {
  it('every widget renders with its sample and passes axe', async () => {
    @Component({ imports: [FinancialOverviewWidget, CurrencyPositionWidget, CreditLineWidget, TradeBillsWidget, TradeInstrumentsWidget, ReportsWidget, AccountsWidget,
      CorporateLimitsWidget, TransactionsWidget, LastPaymentsWidget, BulkUploadWidget, QuickLinksWidget, WorkSnapshotWidget, NotificationsWidget, PendingActionWidget,
      MyLimitsWidget, PendingApprovalsWidget], template: `
      <bx-financial-overview [items]="tiles" />
      <bx-position-by-currency [items]="bars" />
      <bx-credit-line-usage [items]="meters" />
      <bx-bills-receivable-payable [items]="tiles" />
      <bx-trade-instruments [items]="rows" />
      <bx-reports [items]="rows" />
      <bx-accounts-corp [items]="tabs" />
      <bx-corporate-limits [items]="meters" />
      <bx-transactions-widget [items]="[{ id: 'p', label: 'Pending', summary: '6 waiting' }]" />
      <bx-last-5-payments [items]="rows" />
      <bx-bulk-file-upload />
      <bx-quick-links-corp [items]="[{ id: 'own', label: 'Own account', icon: '⇄' }]" />
      <bx-work-snapshot [items]="tiles" />
      <bx-notifications-widget [items]="rows" />
      <bx-pending-for-action [items]="bars" />
      <bx-my-limits [items]="meters" />
      <bx-pending-approvals [items]="rows" />` })
    class Host {
      tiles = [{ label: 'Assets', value: '4.2M', meta: 'CASA, deposits' }, { label: 'Liabilities', value: '1.1M', meta: 'Loans' }];
      rows = [{ title: 'LC ILC2201', meta: 'Expires in 9 days', value: '250,000.00' }];
      bars = [{ label: 'USD', value: 88 }, { label: 'EUR', value: 60 }];
      meters = [{ label: 'Working capital', value: 720, max: 1000 }];
      tabs = [{ id: 'casa', label: 'Current and savings', summary: '12 accounts · 3.4M' }, { id: 'td', label: 'Term deposits', summary: '4 deposits · 1.2M' }];
    }
    const { el } = await mount(Host);
    expect(el.querySelector('bx-financial-overview button')).toBeNull();
    expect(el.querySelector('bx-work-snapshot button')).not.toBeNull();
    expect(getByRole(el, 'button', { name: 'Approve: LC ILC2201' })).toBeTruthy();
    expect((getByRole(el, 'button', { name: 'Upload' }) as HTMLButtonElement).disabled).toBe(true);
    expect(await violations(el)).toEqual([]);
  });

  it('AccountsWidget shows the first tab, moves with arrows and says which on View all', async () => {
    @Component({ imports: [AccountsWidget], template: `<bx-accounts-corp [items]="tabs" [(selection)]="tab" (action)="seen = $event" />` })
    class Host { tabs = [{ id: 'casa', label: 'Current and savings', summary: '12 accounts · 3.4M' }, { id: 'td', label: 'Term deposits', summary: '4 deposits · 1.2M' }]; tab = signal(''); seen = ''; }
    const { el, host, settle } = await mount(Host);
    expect(getByRole(el, 'tabpanel').textContent).toContain('12 accounts · 3.4M');
    fireEvent.keyDown(getByRole(el, 'tab', { name: 'Current and savings' }), { key: 'ArrowRight' });
    await settle();
    expect([host.tab(), getByRole(el, 'tabpanel', { name: 'Term deposits' }).textContent]).toEqual(['td', expect.stringContaining('4 deposits · 1.2M')]);
    await userEvent.click(getByRole(el, 'button', { name: 'View all' }));
    expect(host.seen).toBe('td');
  });
});
