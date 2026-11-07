import { Component, Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent, getByRole } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { AccountsWidget, BulkUploadWidget, CorporateLimitsWidget, CreditLineWidget, CurrencyPositionWidget, FinancialOverviewWidget, LastPaymentsWidget, MyLimitsWidget,
  NotificationsWidget, PendingActionWidget, PendingApprovalsWidget, QuickLinksWidget, ReportsWidget, TradeBillsWidget, TradeInstrumentsWidget, TransactionsWidget,
  WorkSnapshotWidget } from '../src';
import { BillsWidget, BudgetsWidget, CalculatorsWidget, CreditCardsWidget, CreditScoreWidget, DelinquencyNotice, FinancialAdvisorWidget, GoalsWidget, LoansWidget,
  OverviewWidget, QuickInsightsWidget, RecentTransactionsWidget, RewardsWidget, SpecialOffersWidget, SpendAnalysisWidget } from '../src';
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

describe('group 6, the retail dashboard widgets', () => {
  it('every widget renders with its sample and passes axe', async () => {
    @Component({ imports: [OverviewWidget, QuickInsightsWidget, RecentTransactionsWidget, BillsWidget, SpendAnalysisWidget, GoalsWidget, BudgetsWidget, CalculatorsWidget,
      CreditScoreWidget, RewardsWidget, FinancialAdvisorWidget, SpecialOffersWidget, CreditCardsWidget, LoansWidget, DelinquencyNotice], template: `
      <bx-overview [items]="tiles" />
      <bx-quick-insights [items]="rows" />
      <bx-recent-transactions currency="USD" [items]="txns" />
      <bx-bills-widget [items]="[]" />
      <bx-spend-analysis [items]="[{ label: 'Groceries', value: 320 }, { label: 'Travel', value: 180 }]" unit="USD" />
      <bx-goals [items]="meters" />
      <bx-budgets [items]="meters" />
      <bx-calculators currency="USD" />
      <bx-credit-score [items]="[{ label: 'Credit score', value: 860, max: 900 }]" />
      <bx-rewards [items]="tiles" />
      <bx-financial-advisor heading="Priya Nair" text="+44 20 7946 0123" badge="Relationship manager" (action)="wrote = true" />
      <bx-special-offers heading="Pre-approved personal loan" text="Up to 25,000.00 at 9.5% a year." />
      <bx-credit-cards-overview [items]="tiles" />
      <bx-loans-overview [items]="tiles" />
      <bx-delinquency-notice message="Your car loan ·· 3310 is 12 days overdue: 412.00." />` })
    class Host {
      wrote = false;
      tiles = [{ label: 'Current and savings', value: '15,610.50', meta: '3 accounts' }, { label: 'Loans', value: '18,420.00' }];
      rows = [{ title: 'Card payment due', meta: '18 Jan', value: '640.00' }];
      meters = [{ label: 'Holiday fund', value: 1800, max: 3000 }];
      txns = [{ id: 't1', description: 'Coffee House', date: 'Today 08:14', amount: -4.5 }, { id: 't2', description: 'Salary', date: '31 Dec', amount: 3200 }];
    }
    const { el, host } = await mount(Host);
    expect(getByRole(el, 'button', { name: 'Act: Card payment due' })).toBeTruthy();
    expect(getByRole(el, 'heading', { name: 'Recent transactions' })).toBeTruthy();
    expect(el.querySelector('bx-recent-transactions')?.textContent).toContain('+3,200.00 USD');
    expect(el.querySelector('bx-bills-widget')?.textContent).toContain('No bills due.');
    expect(getByRole(el, 'figure', { name: 'Where your money went' })).toBeTruthy();
    expect(el.querySelector('bx-credit-score .bx-meter-fill')?.className).not.toContain('is-near');
    expect(getByRole(el, 'region', { name: 'Calculators' })).toBeTruthy();
    await userEvent.click(getByRole(el, 'button', { name: 'Send a message: Priya Nair' }));
    expect(host.wrote).toBe(true);
    expect(getByRole(el, 'button', { name: 'Apply now: Pre-approved personal loan' })).toBeTruthy();
    expect(getByRole(el, 'alert').textContent).toContain('Payment overdue');
    expect(getByRole(el, 'button', { name: 'Pay now' })).toBeTruthy();
    expect(await violations(el)).toEqual([]);
  });
});
