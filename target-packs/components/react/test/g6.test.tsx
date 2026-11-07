import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccountsWidget, BillsWidget, BudgetsWidget, BulkUploadWidget, CalculatorsWidget, CorporateLimitsWidget, CreditCardsWidget, CreditLineWidget, CreditScoreWidget,
  CurrencyPositionWidget, DelinquencyNotice, FinancialAdvisorWidget, FinancialOverviewWidget, GoalsWidget, LastPaymentsWidget, LoansWidget, MyLimitsWidget, NotificationsWidget,
  OverviewWidget, PendingActionWidget, PendingApprovalsWidget, QuickInsightsWidget, QuickLinksWidget, RecentTransactionsWidget, ReportsWidget, RewardsWidget, SpecialOffersWidget,
  SpendAnalysisWidget, TradeBillsWidget, TradeInstrumentsWidget, TransactionsWidget, WorkSnapshotWidget } from '../src';
import { violations } from './a11y';

afterEach(cleanup);

const tiles = [{ label: 'Current and savings', value: '15,610.50', meta: '3 accounts' }, { label: 'Loans', value: '18,420.00', meta: '1 loan' }];
const rows = [{ title: 'Card payment due', meta: '18 Jan · ·· 4821', value: '640.00' }];
const bars = [{ label: 'USD', value: 88 }, { label: 'EUR', value: 60 }];
const meters = [{ label: 'Working capital', value: 720, max: 1000 }];
const tabs = [{ id: 'casa', label: 'Current and savings', summary: '12 accounts · 3.4M' }, { id: 'td', label: 'Term deposits', summary: '4 deposits · 1.2M' }];

describe('group 6', () => {
  it('every widget renders with its sample and passes axe', async () => {
    render(
      <div>
        <OverviewWidget items={tiles} onAction={() => undefined} />
        <QuickInsightsWidget items={rows} />
        <RecentTransactionsWidget currency="USD" items={[{ id: 't1', description: 'Coffee House', amount: -4.5 }]} />
        <BillsWidget items={rows} />
        <SpendAnalysisWidget items={[{ label: 'Groceries', value: 320 }, { label: 'Travel', value: 180 }]} unit="USD" />
        <GoalsWidget items={[{ label: 'Holiday fund', value: 1800, max: 3000 }]} />
        <BudgetsWidget items={[{ label: 'Groceries', value: 320, max: 400 }]} />
        <CalculatorsWidget currency="USD" />
        <CreditScoreWidget items={[{ label: 'Credit score', value: 742, max: 900 }]} />
        <RewardsWidget items={[{ label: 'Points', value: '12,400', meta: 'Redeem for vouchers' }]} />
        <FinancialAdvisorWidget heading="Priya Nair" text="priya.nair@bank.example" badge="Relationship manager" />
        <SpecialOffersWidget heading="Pre-approved personal loan" text="Up to 25,000.00 at 9.5% a year." badge="Offer" />
        <CreditCardsWidget items={tiles} />
        <LoansWidget items={tiles} />
        <DelinquencyNotice message="Your car loan ·· 3310 is 12 days overdue: 412.00." />
        <FinancialOverviewWidget items={tiles} />
        <CurrencyPositionWidget items={bars} />
        <CreditLineWidget items={meters} />
        <TradeBillsWidget items={tiles} />
        <TradeInstrumentsWidget items={rows} />
        <ReportsWidget items={rows} />
        <AccountsWidget items={tabs} />
        <CorporateLimitsWidget items={meters} />
        <TransactionsWidget items={[{ id: 'p', label: 'Pending', summary: '6 waiting' }]} />
        <LastPaymentsWidget items={rows} />
        <BulkUploadWidget value={[]} />
        <QuickLinksWidget items={[{ id: 'own', label: 'Own account', icon: '⇄' }]} />
        <WorkSnapshotWidget items={tiles} />
        <NotificationsWidget items={rows} />
        <PendingActionWidget items={bars} />
        <MyLimitsWidget items={meters} />
        <PendingApprovalsWidget items={rows} />
      </div>,
    );
    expect(screen.getByRole('alert').textContent).toContain('12 days overdue');
    expect(screen.getByRole('button', { name: 'Approve: Card payment due' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Upload' }) as HTMLButtonElement).disabled).toBe(true);
    expect(await violations()).toEqual([]);
  }, 60000);

  it('AccountsWidget shows the first tab, moves with arrows and says which on View all', async () => {
    const act = vi.fn();
    render(<AccountsWidget items={tabs} onAction={act} />);
    expect(screen.getByRole('tabpanel').textContent).toContain('12 accounts · 3.4M');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Current and savings' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Term deposits' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'Term deposits' }).textContent).toContain('4 deposits · 1.2M');
    await userEvent.click(screen.getByRole('button', { name: 'View all' }));
    expect(act).toHaveBeenCalledWith('td');
  });

  it('BulkUploadWidget uploads the chosen file and asks for the template', async () => {
    const up = vi.fn();
    const tpl = vi.fn();
    const file = new File(['a,b'], 'payroll.csv', { type: 'text/csv' });
    render(<BulkUploadWidget value={[file]} onUpload={up} onTemplate={tpl} />);
    await userEvent.click(screen.getByRole('button', { name: 'Upload' }));
    await userEvent.click(screen.getByRole('button', { name: 'Download the template' }));
    expect([up.mock.calls[0][0][0].name, tpl.mock.calls.length]).toEqual(['payroll.csv', 1]);
  });
});
