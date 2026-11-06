import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReactElement } from 'react';

import { AccountsWidget, BillsWidget, BudgetsWidget, CalculatorsWidget, CreditCardsWidget, CreditScoreWidget, DelinquencyNotice, FinancialAdvisorWidget,
  GoalsWidget, LoansWidget, NotificationsWidget, OverviewWidget, PendingActionWidget, PendingApprovalsWidget, QuickInsightsWidget, QuickLinksWidget,
  RecentTransactionsWidget, RewardsWidget, SpecialOffersWidget, SpendAnalysisWidget, TransactionsWidget, WorkSnapshotWidget } from '../src';
import { accessibilityProblems } from './a11y';

const noop = () => undefined;
const tiles = [{ id: 'cs', title: 'Current and savings', value: '15,610.50', note: '3 accounts' }, { id: 'td', title: 'Term deposits', value: '25,000.00' }];
const txns = Array.from({ length: 7 }, (_, i) => ({ id: String(i), description: `Payment ${i}`, date: 'Today', amount: -10 - i, currency: 'USD' }));
const tabs = [{ id: 'cs', label: 'Current and savings', summary: '12 accounts · 3.4M' }, { id: 'td', label: 'Term deposits', summary: '4 deposits · 1.2M' }];
const loan = { amount: 10000, rate: 9, months: 24 };

describe('group 6', () => {
  it('every widget renders with a name and a role on each control, and touch targets of at least 44 points', async () => {
    const all: [string, ReactElement][] = [
      ['OverviewWidget', <OverviewWidget testID="x" tiles={tiles} onChange={noop} />],
      ['QuickInsightsWidget', <QuickInsightsWidget testID="x" insights={[{ id: 'td', title: 'Term deposit matures', meta: 'In 5 days' }]} onAction={noop} />],
      ['RecentTransactionsWidget', <RecentTransactionsWidget testID="x" transactions={txns} onViewAll={noop} />],
      ['BillsWidget', <BillsWidget testID="x" bills={[{ id: 'e', payee: 'Electricity', due: '18 Jan', amount: 86.2 }]} onPay={noop} />],
      ['SpendAnalysisWidget', <SpendAnalysisWidget testID="x" bars={[{ label: 'Jan', value: 1240 }]} currency="USD" />],
      ['GoalsWidget', <GoalsWidget testID="x" items={[{ label: 'Holiday fund', value: 1800, max: 3000 }]} onAdd={noop} />],
      ['BudgetsWidget', <BudgetsWidget testID="x" items={[{ label: 'Groceries', value: 320, max: 400 }]} />],
      ['CalculatorsWidget', <CalculatorsWidget testID="x" loan={loan} onLoanChange={noop} deposit={loan} onDepositChange={noop} />],
      ['CreditScoreWidget', <CreditScoreWidget testID="x" score={742} max={900} band="Good" updated="1 Jan" />],
      ['RewardsWidget', <RewardsWidget testID="x" tiles={tiles} />],
      ['FinancialAdvisorWidget', <FinancialAdvisorWidget testID="x" title="Priya Nair" body="Relationship manager" onAction={noop} />],
      ['SpecialOffersWidget', <SpecialOffersWidget testID="x" title="Pre-approved personal loan" badge="Offer" onAction={noop} />],
      ['CreditCardsWidget', <CreditCardsWidget testID="x" tiles={tiles} />],
      ['LoansWidget', <LoansWidget testID="x" tiles={tiles} />],
      ['DelinquencyNotice', <DelinquencyNotice testID="x" overdue message="Your car loan is 12 days overdue: 412.00." onAction={noop} />],
      ['AccountsWidget', <AccountsWidget testID="x" label="Accounts" tabs={tabs} onOpen={noop} />],
      ['TransactionsWidget', <TransactionsWidget testID="x" label="Transactions" tabs={tabs} />],
      ['QuickLinksWidget', <QuickLinksWidget testID="x" actions={[{ id: 'own', label: 'Own account', icon: '⇄' }]} onAction={noop} />],
      ['WorkSnapshotWidget', <WorkSnapshotWidget testID="x" tiles={tiles} />],
      ['NotificationsWidget', <NotificationsWidget testID="x" items={[{ id: 'n', title: 'USD cut-off moves to 3 pm', unread: true }]} onAction={noop} />],
      ['PendingActionWidget', <PendingActionWidget testID="x" bars={[{ label: 'Payments', value: 70 }, { label: 'Trade', value: 35 }]} />],
      ['PendingApprovalsWidget', <PendingApprovalsWidget testID="x" items={[{ id: 'p', title: 'Payroll Feb', priority: true }]} onApprove={noop} />],
    ];
    for (const [name, element] of all) {
      await render(element);
      expect([name, accessibilityProblems()]).toEqual([name, []]);
    }
  });

  it('RecentTransactionsWidget shows five rows and View all', async () => {
    const all = jest.fn();
    await render(<RecentTransactionsWidget testID="r" transactions={txns} onViewAll={all} />);
    expect(screen.getByText('Payment 4')).toBeTruthy();
    expect(screen.queryByText('Payment 5')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'View all' }));
    expect(all).toHaveBeenCalledTimes(1);
  });

  it('DelinquencyNotice shows only while a loan is overdue', async () => {
    await render(<DelinquencyNotice testID="d" overdue={false} message="Overdue" />);
    expect(screen.queryByRole('alert')).toBeNull();
    await render(<DelinquencyNotice testID="d" overdue message="Your car loan is 12 days overdue: 412.00." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Your car loan is 12 days overdue: 412.00.');
    expect(screen.getByRole('button', { name: 'Pay now' })).toBeTruthy();
  });

  it('AccountsWidget switches tabs and opens the one shown', async () => {
    const open = jest.fn();
    await render(<AccountsWidget testID="a" label="Accounts" tabs={tabs} onOpen={open} />);
    expect(screen.getByTestId('a-cs-summary')).toHaveTextContent('12 accounts · 3.4M');
    await fireEvent.press(screen.getByRole('tab', { name: 'Term deposits' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Open Term deposits' }));
    expect(open).toHaveBeenCalledWith('td');
  });

  it('CalculatorsWidget moves between the calculators', async () => {
    await render(<CalculatorsWidget testID="c" loan={loan} onLoanChange={noop} deposit={{ amount: 10000, rate: 6, months: 12 }} onDepositChange={noop}
                                    forex={{ value: 100, to: 'EUR', rate: 0.92, onChange: noop }} />);
    expect(screen.getByText('Loan instalment calculator')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Forex' }));
    expect(screen.getByTestId('c-forex-result').props.accessibilityLabel).toMatch(/^The payee gets: 92.00 EUR/);
  });

  it('CreditScoreWidget reads the bureau band with the score', async () => {
    await render(<CreditScoreWidget testID="s" score={742} max={900} band="Good" />);
    expect(screen.getByLabelText('Good, 742 of 900')).toBeTruthy();
  });

  it('PendingActionWidget lays bars across and reads each count', async () => {
    await render(<PendingActionWidget testID="p" bars={[{ label: 'Payments', value: 70 }]} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Payments, 70' }));
    expect(screen.getByTestId('p-picked')).toHaveTextContent('Payments: 70');
  });
});
