import { Component, Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent, getByLabelText, getByRole, getByText } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { AccountBalance, AccountCard, AccountDetails, AccountNumber, AccountSelector, AccountSummary, BeneficiaryCard, BeneficiarySelector, DepositRedemption, DepositTopUp,
  DepositsSummary, MaturityInstructions, NewDepositForm, Payee, PaymentForm, PaymentStatus, Tile, TransactionDetails, TransactionFilter, TransactionHistory, TransactionReceipt,
  TransferSummary, ibanValid, money } from '../src';
import { PaymentSchedule, QuickActions, UpcomingBills } from '../src';
import { violations } from './a11y';

async function mount<T>(host: Type<T>) {
  const fixture = TestBed.createComponent(host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  document.body.appendChild(fixture.nativeElement);
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance, settle: () => fixture.whenStable() };
}

afterEach(() => { document.body.innerHTML = ''; TestBed.resetTestingModule(); });

const usd = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

describe('group 2', () => {
  it('every component renders with its sample and passes axe', async () => {
    @Component({ imports: [AccountSelector, AccountSummary, AccountBalance, AccountCard, AccountDetails, AccountNumber, BeneficiarySelector, BeneficiaryCard, PaymentForm,
      TransferSummary, PaymentStatus, TransactionHistory, TransactionFilter, TransactionDetails, TransactionReceipt, DepositsSummary, NewDepositForm, MaturityInstructions,
      DepositTopUp, DepositRedemption], template: `
      <bx-account-picker testID="ap" value="s" [options]="accounts" />
      <bx-account-summary [items]="[{ label: 'Savings', value: '12,400.00', meta: 'Available 12,150.00' }]" />
      <bx-balance-card label="Savings ·· 4821" [amount]="12400" currency="USD" meta="Available 12,150.00" />
      <bx-account-card heading="Savings ·· 4821" text="Balance 12,400.00" badge="Primary" />
      <bx-account-details [items]="kv" actionLabel="Download statement" />
      <bx-iban testID="ib" label="Account number (IBAN)" value="GB29NWBK60161331926819" />
      <bx-payee-list [items]="[{ id: 'p1', name: 'A. Rao', meta: 'HSBC ·· 9268' }]" />
      <bx-beneficiary-card heading="A. Rao" text="GB29 •••• 9268 19" badge="HSBC" />
      <bx-payment-form><p>Fields</p></bx-payment-form>
      <bx-transfer-summary [items]="kv" />
      <bx-payment-status [steps]="['Initiated', 'Approved', 'Sent', 'Completed']" selectedStep="Sent" />
      <bx-transaction-list currency="USD" [items]="[{ id: 't1', description: 'Coffee House', date: 'Today', amount: -4.5 }]" />
      <bx-transaction-filter [options]="['Money in', 'Money out']" />
      <bx-transaction-details [items]="kv" actionLabel="Dispute it" />
      <bx-receipt [amount]="1250" currency="USD" reference="FX-20391" [items]="kv"><button type="button">Download</button></bx-receipt>
      <bx-td-summary [items]="[{ label: 'Deposits', value: '4', meta: 'Total 62,500.00' }]" />
      <bx-new-td [items]="[{ label: 'Tenure', value: '12 months' }]" />
      <bx-maturity-instructions [options]="[{ value: 'renew', label: 'Renew principal and interest', meta: 'At the rate on the day' }, 'Close and pay out']" />
      <bx-td-topup [items]="kv" />
      <bx-td-redemption [items]="[{ label: 'You receive', value: '25,549.90', total: true }]" />` })
    class Host {
      accounts = [{ value: 's', label: 'Savings ·· 4821', meta: 'Available 12,150.00' }, { value: 'c', label: 'Current ·· 7730' }];
      kv = [{ label: 'From', value: 'Savings ·· 4821' }, { label: 'Amount', value: '1,250.00 USD' }];
    }
    const { el } = await mount(Host);
    expect(el.querySelector('bx-account-picker .bx-help')?.textContent?.trim()).toBe('Available 12,150.00');
    expect(getByRole(el, 'button', { name: 'Pay now: A. Rao' })).toBeTruthy();
    expect(getByRole(el, 'button', { name: 'Confirm transfer' })).toBeTruthy();
    expect(getByRole(el, 'list', { name: 'Payment status' })).toBeTruthy();
    expect(getByRole(el, 'group', { name: 'Show' })).toBeTruthy();
    expect(await violations(el)).toEqual([]);
  });

  it('money and the IBAN checksum', () => {
    expect([money(1250, 'USD'), money('12,400.00'), ibanValid('GB29 NWBK 6016 1331 9268 19'), ibanValid('GB28 NWBK 6016 1331 9268 19')]).toEqual([`${usd(1250)} USD`, '12,400.00', true, false]);
  });

  it('AccountNumber groups by four, writes back without spaces, and says when the checksum fails', async () => {
    @Component({ imports: [AccountNumber], template: `<bx-iban testID="ib" label="IBAN" [(value)]="iban" />` })
    class Host { iban = signal(''); }
    const { el, host, settle } = await mount(Host);
    const input = getByLabelText(el, 'IBAN') as HTMLInputElement;
    await userEvent.type(input, 'gb29nwbk60161331926819');
    fireEvent.blur(input);
    await settle();
    expect([host.iban(), input.value]).toEqual(['GB29NWBK60161331926819', 'GB29 NWBK 6016 1331 9268 19']);
    await userEvent.clear(input);
    await userEvent.type(input, 'GB28NWBK60161331926819');
    fireEvent.blur(input);
    await settle();
    expect(getByRole(el, 'alert').textContent).toContain('Check the IBAN');
  });

  it('AccountBalance hides the amount; payees are found by name and picked', async () => {
    @Component({ imports: [AccountBalance, BeneficiarySelector], template: `
      <bx-balance-card label="Savings" [amount]="12400" currency="USD" />
      <bx-payee-list [items]="payees" (action)="picked = $event" />` })
    class Host { payees: Payee[] = [{ id: 'p1', name: 'A. Rao' }, { id: 'p2', name: 'J. Mehta' }]; picked: Payee | null = null; }
    const { el, host } = await mount(Host);
    expect(getByText(el, `${usd(12400)} USD`)).toBeTruthy();
    await userEvent.click(getByRole(el, 'button', { name: 'Hide balance' }));
    expect(getByText(el, '••••••')).toBeTruthy();
    await userEvent.type(getByRole(el, 'searchbox', { name: 'Search Payees' }), 'meh');
    await userEvent.click(getByRole(el, 'button', { name: /J. Mehta/ }));
    expect(host.picked?.id).toBe('p2');
  });

  it('transactions say money in and out; tiles and forms fire their actions', async () => {
    @Component({ imports: [TransactionHistory, DepositsSummary, NewDepositForm], template: `
      <bx-transaction-list currency="USD" [items]="[{ id: 't1', description: 'Coffee House', amount: -4.5 }, { id: 't2', description: 'Salary', amount: 3200 }]" />
      <bx-td-summary [items]="[{ id: 'd', label: 'Deposits', value: '4' }]" (action)="opened = $event" />
      <bx-new-td cancelLabel="Cancel" (submitted)="submits = submits + 1" (cancelled)="cancels = cancels + 1" />` })
    class Host { opened: Tile | null = null; submits = 0; cancels = 0; }
    const { el, host } = await mount(Host);
    expect(getByText(el, 'Money out').parentElement?.textContent).toBe(`Money out−${usd(4.5)} USD`);
    expect(getByText(el, 'Money in').parentElement?.className).toBe('bx-tx-amount is-in');
    await userEvent.click(getByRole(el, 'button', { name: /Deposits/ }));
    await userEvent.click(getByRole(el, 'button', { name: 'Review deposit' }));
    await userEvent.click(getByRole(el, 'button', { name: 'Cancel' }));
    expect([host.opened?.id, host.submits, host.cancels]).toEqual(['d', 1, 1]);
  });

  it('MaturityInstructions chooses one', async () => {
    @Component({ imports: [MaturityInstructions], template: `<bx-maturity-instructions [options]="['Renew', 'Close and pay out']" [(value)]="choice" />` })
    class Host { choice = signal(''); }
    const { el, host, settle } = await mount(Host);
    await userEvent.click(getByLabelText(el, 'Close and pay out'));
    await settle();
    expect(host.choice()).toBe('Close and pay out');
    expect(getByRole(el, 'group', { name: 'At maturity' })).toBeTruthy();
  });
});

describe('group 2, the components React and JET have', () => {
  it('each renders with its sample, says what was pressed and passes axe', async () => {
    @Component({ imports: [QuickActions, PaymentSchedule, UpcomingBills], template: `
      <bx-quick-actions [items]="[{ id: 'send', label: 'Send', icon: '↗' }, { id: 'bills', label: 'Pay bills' }]" (action)="seen = $event" />
      <bx-repeat [(value)]="repeat" />
      <bx-upcoming-bills [items]="bills" (action)="paid = $event.title" />
      <bx-upcoming-bills heading="Later" [items]="[]" />` })
    class Host { seen = ''; paid = ''; repeat = signal('Once'); bills = [{ id: 'b1', title: 'Electricity', meta: 'Due 20 Jan', value: '86.20' }]; }
    const { el, host, settle } = await mount(Host);
    await userEvent.click(getByRole(el, 'button', { name: 'Pay bills' }));
    expect(host.seen).toBe('bills');
    expect(getByRole(el, 'navigation', { name: 'Quick actions' })).toBeTruthy();
    fireEvent.keyDown(getByRole(el, 'radio', { name: 'Once' }), { key: 'ArrowRight' });
    await settle();
    expect(host.repeat()).toBe('Weekly');
    expect(getByRole(el, 'radiogroup', { name: 'Repeat' })).toBeTruthy();
    await userEvent.click(getByRole(el, 'button', { name: 'Pay: Electricity' }));
    expect(host.paid).toBe('Electricity');
    expect(getByText(el, 'No bills due.')).toBeTruthy();
    expect(await violations(el)).toEqual([]);
  });
});
