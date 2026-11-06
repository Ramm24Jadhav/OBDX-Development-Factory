import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactElement, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccountBalance, AccountCard, AccountDetails, AccountNumber, AccountSelector, AccountSummary, BeneficiaryCard, BeneficiarySelector, DepositRedemption,
  DepositTopUp, DepositsSummary, MaturityInstructions, NewDepositForm, PaymentForm, PaymentSchedule, PaymentStatus, QuickActions, TransactionDetails, TransactionFilter,
  TransactionHistory, TransactionReceipt, TransferSummary, UpcomingBills, ibanValid, money } from '../src';
import { violations } from './a11y';

afterEach(cleanup);

function Controlled<T>({ initial, children }: { initial: T; children: (value: T, set: (v: T) => void) => ReactElement }) {
  const [value, setValue] = useState<T>(initial);
  return children(value, setValue);
}

const accounts = [{ value: 's', label: 'Savings ·· 4821', meta: 'Available 12,150.00' }, { value: 'c', label: 'Current ·· 7730' }];
const kv = [{ label: 'From', value: 'Savings ·· 4821' }, { label: 'Amount', value: '1,250.00 USD' }];
const usd = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

describe('group 2', () => {
  it('every component renders with its sample and passes axe', async () => {
    render(
      <div>
        <AccountSelector testID="ap" value="s" options={accounts} />
        <AccountSummary items={[{ label: 'Savings', value: '12,400.00', meta: 'Available 12,150.00' }]} onAction={() => undefined} />
        <AccountBalance label="Savings ·· 4821" amount={12400} currency="USD" meta="Available 12,150.00" />
        <AccountCard heading="Savings ·· 4821" text="Balance 12,400.00 · Available 12,150.00" badge="Primary" />
        <AccountDetails items={kv} actionLabel="Download statement" />
        <AccountNumber testID="ib" value="GB29NWBK60161331926819" />
        <QuickActions items={[{ id: 'send', label: 'Send', icon: '↗' }, { id: 'bills', label: 'Pay bills', icon: '≡' }]} />
        <BeneficiarySelector items={[{ id: 'p1', name: 'A. Rao', meta: 'HSBC ·· 9268' }]} />
        <BeneficiaryCard heading="A. Rao" text="GB29 •••• 9268 19 · added 12 Mar" badge="HSBC" />
        <PaymentForm><p>Fields</p></PaymentForm>
        <TransferSummary items={kv} />
        <PaymentStatus steps={['Initiated', 'Approved', 'Sent', 'Completed']} selectedStep="Sent" />
        <TransactionHistory currency="USD" items={[{ id: 't1', description: 'Coffee House', date: 'Today', amount: -4.5 }]} onAction={() => undefined} />
        <TransactionFilter options={['Money in', 'Money out']} value={[]} />
        <TransactionDetails items={kv} actionLabel="Dispute it" />
        <PaymentSchedule value="Once" />
        <TransactionReceipt amount={1250} currency="USD" reference="FX-20391" items={kv}><button type="button">Download</button></TransactionReceipt>
        <UpcomingBills items={[{ title: 'Electricity', meta: 'Due 20 Jan', value: '86.20' }]} />
        <DepositsSummary items={[{ label: 'Deposits', value: '4', meta: 'Total 62,500.00' }]} />
        <NewDepositForm items={[{ label: 'Tenure', value: '12 months' }]} />
        <MaturityInstructions value="" options={[{ value: 'renew', label: 'Renew principal and interest', meta: 'At the rate on the day' }, 'Close and pay out']} />
        <DepositTopUp items={kv} />
        <DepositRedemption items={[{ label: 'You receive', value: '25,549.90', total: true }]} />
      </div>,
    );
    expect(screen.getByText('Available 12,150.00', { selector: '.bx-help' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pay now: A. Rao' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm transfer' })).toBeTruthy();
    expect(await violations()).toEqual([]);
  });

  it('money keeps the currency\'s decimals; the IBAN check is the ISO checksum', () => {
    expect([money(1250, 'USD'), money(1250, 'JPY'), money('12,400.00'), money(null)]).toEqual([`${usd(1250)} USD`, `${(1250).toLocaleString()} JPY`, '12,400.00', '']);
    expect([ibanValid('GB29 NWBK 6016 1331 9268 19'), ibanValid('GB28 NWBK 6016 1331 9268 19'), ibanValid('12')]).toEqual([true, false, false]);
  });

  it('AccountNumber groups by four, writes back without spaces, and says when the checksum fails', async () => {
    let seen = '';
    render(<Controlled initial="">{(v, set) => <AccountNumber testID="ib" value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    const input = screen.getByLabelText('Account number (IBAN)') as HTMLInputElement;
    await userEvent.type(input, 'gb29nwbk60161331926819');
    fireEvent.blur(input);
    expect([seen, input.value]).toEqual(['GB29NWBK60161331926819', 'GB29 NWBK 6016 1331 9268 19']);
    await userEvent.clear(input);
    await userEvent.type(input, 'GB28NWBK60161331926819');
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toContain('Check the IBAN');
    expect(seen).toBe('GB29NWBK60161331926819');
  });

  it('AccountBalance hides and shows the amount', async () => {
    render(<AccountBalance label="Savings" amount={12400} currency="USD" />);
    expect(screen.getByText(`${usd(12400)} USD`)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Hide balance' }));
    expect(screen.getByText('••••••')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show balance' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('BeneficiarySelector finds payees by name and picks one', async () => {
    const pick = vi.fn();
    render(<BeneficiarySelector items={[{ id: 'p1', name: 'A. Rao' }, { id: 'p2', name: 'J. Mehta' }]} onAction={pick} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Payees' }), 'meh');
    await userEvent.click(screen.getByRole('button', { name: /J. Mehta/ }));
    expect(pick.mock.calls[0][0].id).toBe('p2');
    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByRole('status').textContent).toBe('No payees match.');
  });

  it('TransactionHistory says money in and out, with the currency\'s decimals', () => {
    render(<TransactionHistory currency="USD" items={[{ id: 't1', description: 'Coffee House', amount: -4.5 }, { id: 't2', description: 'Salary', amount: 3200 }]} />);
    expect(screen.getByText('Money out').parentElement?.textContent).toBe(`Money out−${usd(4.5)} USD`);
    expect(screen.getByText('Money in').parentElement?.className).toBe('bx-tx-amount is-in');
  });

  it('tiles, details and forms fire their actions; busy stops a second submit', async () => {
    const open = vi.fn();
    const submit = vi.fn();
    render(<><DepositsSummary items={[{ id: 'd', label: 'Deposits', value: '4' }]} onAction={open} /><NewDepositForm onSubmit={submit} busy /><PaymentForm onSubmit={submit} /></>);
    await userEvent.click(screen.getByRole('button', { name: /Deposits/ }));
    expect(open.mock.calls[0][0].id).toBe('d');
    expect((screen.getByRole('button', { name: 'Review deposit' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Review payment' }));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('MaturityInstructions and PaymentSchedule choose one', async () => {
    render(<Controlled initial="">{(v, set) => <MaturityInstructions value={v} onChange={set} options={['Renew', 'Close and pay out']} />}</Controlled>);
    await userEvent.click(screen.getByLabelText('Close and pay out'));
    expect((screen.getByLabelText('Close and pay out') as HTMLInputElement).checked).toBe(true);
    cleanup();
    render(<Controlled initial="Once">{(v, set) => <PaymentSchedule value={v} onChange={set} />}</Controlled>);
    await userEvent.click(screen.getByRole('radio', { name: 'Monthly' }));
    expect(screen.getByRole('radio', { name: 'Monthly' }).getAttribute('aria-checked')).toBe('true');
  });
});
