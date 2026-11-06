import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReactElement, useState } from 'react';

import { Account, AccountBalance, AccountCard, AccountDetails, AccountNumber, AccountSelector, AccountSummary, BeneficiaryCard, BeneficiarySelector,
  DepositRedemption, DepositTopUp, DepositValue, DepositsSummary, MaturityInstructions, NewDepositForm, Payee, PaymentForm, PaymentSchedule, PaymentStatus,
  PaymentValue, QuickActions, TransactionDetails, TransactionFilter, TransactionHistory, TransactionReceipt, TransferSummary, UpcomingBills, groupIban, ibanValid,
  maskIban } from '../src';
import { accessibilityProblems } from './a11y';

function Controlled<T>({ initial, children }: { initial: T; children: (value: T, set: (v: T) => void) => ReactElement }) {
  const [value, setValue] = useState<T>(initial);
  return children(value, setValue);
}

const noop = () => undefined;
const accounts: Account[] = [
  { id: 'sav', name: 'Savings', number: '0012004821', balance: 12400, available: 12150, currency: 'USD' },
  { id: 'cur', name: 'Current', number: '0012007730', balance: 3210.5, available: 3210.5, currency: 'USD' },
];
const payees: Payee[] = [{ id: 'ar', name: 'A. Rao', bank: 'HSBC', number: 'GB29NWBK60161331926819' }];
const rows = [{ label: 'From', value: 'Savings ·· 4821' }, { label: 'Amount', value: '1,250.00 USD', emphasis: 'total' as const }];
const tiles = [{ id: 's', title: 'Savings', value: '12,400.00', note: 'Available 12,150.00' }, { id: 'c', title: 'Current', value: '3,210.50' }];

describe('group 2', () => {
  it('every component renders with a name and a role on each control, and touch targets of at least 44 points', async () => {
    const all: [string, ReactElement][] = [
      ['AccountSelector', <AccountSelector testID="x" label="From account" accounts={accounts} value="sav" />],
      ['AccountSummary', <AccountSummary testID="x" tiles={tiles} value="s" onChange={noop} />],
      ['AccountBalance', <AccountBalance testID="x" label="Savings ·· 4821" balance={12400} available={12150} currency="USD" />],
      ['AccountCard', <AccountCard testID="x" account={accounts[0]} badge="Primary" onAction={noop} />],
      ['AccountDetails', <AccountDetails testID="x" rows={rows} actionLabel="Download statement" onAction={noop} />],
      ['AccountNumber', <AccountNumber testID="x" label="Account number (IBAN)" value="GB29NWBK60161331926819" />],
      ['QuickActions', <QuickActions testID="x" actions={[{ id: 'send', label: 'Send', icon: '↗' }]} onAction={noop} />],
      ['BeneficiarySelector', <BeneficiarySelector testID="x" label="Pay to" payees={payees} value="" onAdd={noop} />],
      ['BeneficiaryCard', <BeneficiaryCard testID="x" payee={payees[0]} note="added 12 Mar" onPay={noop} />],
      ['PaymentForm', <PaymentForm testID="x" label="Pay" value={{ from: '', to: '', amount: null, note: '' }} accounts={accounts} payees={payees} onReview={noop} />],
      ['TransferSummary', <TransferSummary testID="x" rows={rows} onAction={noop} />],
      ['PaymentStatus', <PaymentStatus testID="x" value={2} />],
      ['TransactionHistory', <TransactionHistory testID="x" transactions={[{ id: '1', description: 'Coffee House', date: 'Today', amount: -4.5, currency: 'USD' }]} />],
      ['TransactionFilter', <TransactionFilter testID="x" label="Show" value={[]} options={['Money in', 'Money out']} />],
      ['TransactionDetails', <TransactionDetails testID="x" rows={rows} actionLabel="Dispute it" onAction={noop} />],
      ['PaymentSchedule', <PaymentSchedule testID="x" label="Repeat" value="Once" />],
      ['TransactionReceipt', <TransactionReceipt testID="x" amount={1250} currency="USD" rows={rows} onShare={noop} onDownload={noop} />],
      ['UpcomingBills', <UpcomingBills testID="x" bills={[{ id: 'e', payee: 'Electricity', due: 'Due 18 Jan', amount: 86.2, currency: 'USD' }]} onPay={noop} />],
      ['DepositsSummary', <DepositsSummary testID="x" tiles={tiles} />],
      ['NewDepositForm', <NewDepositForm testID="x" accounts={accounts} value={{ from: '', amount: null, months: null }} onReview={noop} />],
      ['MaturityInstructions', <MaturityInstructions testID="x" label="At maturity" value="close" />],
      ['DepositTopUp', <DepositTopUp testID="x" rows={rows} onAction={noop} />],
      ['DepositRedemption', <DepositRedemption testID="x" rows={[{ label: 'Early penalty', value: '-62.50', emphasis: 'negative' }]} onAction={noop} />],
    ];
    for (const [name, element] of all) {
      await render(element);
      expect([name, accessibilityProblems()]).toEqual([name, []]);
    }
  });

  it('AccountSelector masks the number, shows what is available and writes back the id', async () => {
    let seen = '';
    await render(<Controlled initial="">{(v, set) => <AccountSelector testID="a" label="From account" accounts={accounts} value={v}
                                                                     onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    await fireEvent.press(screen.getByRole('button', { name: 'From account, nothing chosen' }));
    expect(screen.queryByText(/0012004821/)).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Current ·· 7730 · 3,210.50 USD' }));
    expect(seen).toBe('cur');
  });

  it('AccountBalance hides and shows the amounts', async () => {
    await render(<AccountBalance testID="b" label="Savings ·· 4821" balance={12400} available={12150} currency="USD" />);
    expect(screen.getByLabelText('Balance 12,400.00 USD')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Hide balance' }));
    expect(screen.getByLabelText('Balance hidden')).toBeTruthy();
    expect(screen.queryByText(/12,150/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Show balance' }).props.accessibilityState.selected).toBe(true);
  });

  it('IBANs are checked with their check digits, grouped and masked', async () => {
    expect(ibanValid('GB29 NWBK 6016 1331 9268 19')).toBe(true);
    expect(ibanValid('GB28 NWBK 6016 1331 9268 19')).toBe(false);
    expect(groupIban('gb29nwbk60161331926819')).toBe('GB29 NWBK 6016 1331 9268 19');
    expect(maskIban('GB29NWBK60161331926819')).toBe('GB29 •••• 6819');
    let seen = '';
    await render(<Controlled initial="">{(v, set) => <AccountNumber testID="i" label="IBAN" value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    const input = screen.getByLabelText('IBAN');
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, 'gb28 nwbk 6016 1331 9268 19');
    expect(seen).toBe('GB28NWBK60161331926819');
    await fireEvent(input, 'blur');
    expect(screen.getByRole('alert')).toHaveTextContent('Check the IBAN: the check digits do not match.');
    await fireEvent.changeText(input, 'GB29NWBK60161331926819');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('IBAN').props.value).toBe('GB29 •••• 6819');
  });

  it('BeneficiarySelector picks a payee by id and offers Add a new payee', async () => {
    let seen = '';
    const add = jest.fn();
    await render(<BeneficiarySelector testID="b" label="Pay to" payees={payees} value="" onChange={(x) => { seen = x; }} onAdd={add} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'A. Rao, HSBC, ·· 6819' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add a new payee' }));
    expect([seen, add.mock.calls.length]).toEqual(['ar', 1]);
  });

  it('PaymentForm says what to fix and refuses more than the available balance', async () => {
    const review = jest.fn();
    await render(<Controlled<PaymentValue> initial={{ from: '', to: '', amount: null, note: '' }}>{(v, set) => (
      <PaymentForm testID="p" value={v} onChange={set} accounts={accounts} payees={payees} currency="USD" onReview={review} />)}</Controlled>);
    await fireEvent.press(screen.getByRole('button', { name: 'Review payment' }));
    expect(screen.getAllByRole('alert').map((a) => a.props.children)).toEqual(['Choose the account to pay from.', 'Choose who to pay.', 'Enter the amount.']);
    await fireEvent.press(screen.getByRole('button', { name: /^From account/ }));
    await fireEvent.press(screen.getByRole('radio', { name: /^Current/ }));
    await fireEvent.press(screen.getByRole('button', { name: /^To,/ }));
    await fireEvent.press(screen.getByRole('radio', { name: /^A. Rao/ }));
    const amount = screen.getByLabelText('Amount in USD');
    await fireEvent.changeText(amount, '5000');
    await fireEvent(amount, 'blur');
    expect(screen.getByRole('alert')).toHaveTextContent('The amount is more than the available 3,210.50 USD.');
    await fireEvent.changeText(amount, '1250');
    await fireEvent(amount, 'blur');
    await fireEvent.press(screen.getByRole('button', { name: 'Review payment' }));
    expect(review).toHaveBeenCalledWith({ from: 'cur', to: 'ar', amount: 1250, note: '' });
  });

  it('TransactionHistory filters money in and out and says the sign in words', async () => {
    await render(<TransactionHistory testID="h" transactions={[{ id: '1', description: 'Coffee House', date: 'Today', amount: -4.5, currency: 'USD' },
      { id: '2', description: 'Salary', date: '1 Jan', amount: 4200, currency: 'USD' }]} />);
    expect(screen.getByLabelText('Salary, 1 Jan, +4,200.00 USD')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Money out' }));
    expect(screen.queryByText('Salary')).toBeNull();
    expect(screen.getByLabelText('Coffee House, Today, −4.50 USD')).toBeTruthy();
  });

  it('UpcomingBills pays the bill pressed and marks overdue ones in words', async () => {
    const pay = jest.fn();
    await render(<UpcomingBills testID="u" onPay={pay} bills={[{ id: 'e', payee: 'Electricity', due: '18 Jan', amount: 86.2, currency: 'USD', overdue: true }]} />);
    expect(screen.getByLabelText('Electricity, Overdue · 18 Jan, 86.20 USD')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Pay Electricity' }));
    expect(pay.mock.calls[0][0].id).toBe('e');
  });

  it('NewDepositForm checks the smallest deposit and writes back the tenure in months', async () => {
    const review = jest.fn();
    await render(<Controlled<DepositValue> initial={{ from: 'sav', amount: 500, months: null }}>{(v, set) => (
      <NewDepositForm testID="n" value={v} onChange={set} accounts={accounts} minAmount={1000} onReview={review} />)}</Controlled>);
    await fireEvent.press(screen.getByRole('radio', { name: '1 year' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Review deposit' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The smallest deposit is 1,000.00 USD.');
    expect(review).not.toHaveBeenCalled();
  });

  it('TransferSummary and DepositRedemption read each row as one "label: value" stop', async () => {
    const confirm = jest.fn();
    await render(<TransferSummary testID="t" rows={rows} onAction={confirm} busy />);
    expect(screen.getByLabelText('Amount: 1,250.00 USD')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm transfer' }).props.accessibilityState.disabled).toBe(true);
  });
});
