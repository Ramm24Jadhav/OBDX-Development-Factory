import { Component, Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent, getAllByRole, getByLabelText, getByRole, getByText, queryByRole } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AddOnCard, BlockCard, CardList, CardStatements, ConvertToEmi, DisbursementTimeline, LoanRepayment, LoansSummary, OtpInput, PromiseToPay, RaiseDispute, RedeemPoints,
  RepaymentSchedule, SecureConfirmation, SensitiveField, SessionExpiryWarning, masked } from '../src';
import { violations } from './a11y';

async function mount<T>(host: Type<T>) {
  const fixture = TestBed.createComponent(host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  document.body.appendChild(fixture.nativeElement);
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance, settle: () => fixture.whenStable() };
}

afterEach(() => { document.body.innerHTML = ''; TestBed.resetTestingModule(); vi.useRealTimers(); });

describe('group 3', () => {
  it('every component renders with its sample and passes axe', async () => {
    @Component({ imports: [LoansSummary, LoanRepayment, RepaymentSchedule, PromiseToPay, DisbursementTimeline, CardList, ConvertToEmi, RedeemPoints, BlockCard, RaiseDispute,
      AddOnCard, CardStatements, OtpInput, SecureConfirmation, SensitiveField], template: `
      <bx-loan-summary [items]="[{ label: 'Home loan', value: '142,300.00', meta: 'Next 1,240.00 on 5 Feb' }]" />
      <bx-loan-repayment [items]="kv" />
      <bx-loan-schedule [rows]="[{ date: '05 Feb', amount: '412.00' }, { date: '05 Mar', amount: '412.00', status: 'due' }]" />
      <bx-promise-to-pay [items]="kv" />
      <bx-disbursement [items]="[{ label: 'Sanctioned 30,000.00', meta: '02 Jan' }, { label: 'Second disbursement', meta: 'Due 05 Mar', state: 'pending' }]" />
      <bx-card-list [items]="[{ label: 'Platinum ·· 4821', value: '640.00 due', meta: 'Limit 10,000.00' }]" />
      <bx-convert-emi value="6 months" />
      <bx-redeem-points [value]="5000" />
      <bx-block-card />
      <bx-raise-dispute [items]="[{ label: 'Reason', value: 'Charged twice' }]" />
      <bx-add-on-card [items]="[{ label: 'Name on the card', value: 'S. Rao' }]" />
      <bx-card-statements [items]="[{ title: 'December statement', meta: 'Generated 01 Jan', value: 'PDF' }]" />
      <bx-otp value="123" helpText="We sent it to •••• 0123" />
      <bx-secure-confirmation [items]="kv" />
      <bx-sensitive value="4111 1111 1111 4821" />` })
    class Host { kv = [{ label: 'Overdue', value: '412.00' }, { label: 'Pay from', value: 'Savings ·· 4821' }]; }
    const { el } = await mount(Host);
    expect(getByRole(el, 'radiogroup', { name: 'Pay over' })).toBeTruthy();
    expect(getAllByRole(el, 'radio').length).toBe(3);
    expect(getByLabelText(el, 'Points to redeem').getAttribute('max')).toBe('12400');
    expect(getByRole(el, 'list', { name: 'Disbursements' })).toBeTruthy();
    expect(getByText(el, '•••• 4821')).toBeTruthy();
    expect(await violations(el)).toEqual([]);
  });

  it('a code takes digits only and says when it is complete', async () => {
    @Component({ imports: [OtpInput], template: `<bx-otp [(value)]="code" (completed)="done = $event" />` })
    class Host { code = signal(''); done = ''; }
    const { el, host, settle } = await mount(Host);
    const input = getByLabelText(el, 'Enter the code') as HTMLInputElement;
    expect(input.getAttribute('autocomplete')).toBe('one-time-code');
    await userEvent.type(input, '12a3456');
    await settle();
    expect([host.code(), host.done]).toEqual(['123456', '123456']);
  });

  it('BlockCard says what blocking means; SensitiveField shows the number on request', async () => {
    @Component({ imports: [BlockCard, SensitiveField], template: `<bx-block-card [(value)]="blocked" /><bx-sensitive value="4111 1111 1111 4821" />` })
    class Host { blocked = signal(false); }
    const { el, host, settle } = await mount(Host);
    await userEvent.click(getByRole(el, 'switch', { name: 'Block the card' }));
    await settle();
    expect([host.blocked(), getByRole(el, 'status').textContent]).toEqual([true, 'The card is blocked: payments and withdrawals are refused until you unblock it.']);
    await userEvent.click(getByRole(el, 'button', { name: 'Show Card number' }));
    expect(getByText(el, '4111 1111 1111 4821')).toBeTruthy();
    expect(masked('4111 1111 1111 4821')).toBe('•••• 4821');
  });

  it('SessionExpiryWarning counts down, does not close on Escape, and ends at zero', async () => {
    vi.useFakeTimers();
    @Component({ imports: [SessionExpiryWarning], template: `<bx-session-timeout [(open)]="open" [seconds]="12" (expired)="expired = expired + 1" (stay)="stayed = stayed + 1" />` })
    class Host { open = signal(true); expired = 0; stayed = 0; }
    const fixture = TestBed.createComponent(Host);
    fixture.autoDetectChanges();
    document.body.appendChild(fixture.nativeElement);
    await vi.advanceTimersByTimeAsync(0);
    const el = fixture.nativeElement as HTMLElement;
    expect(getByRole(el, 'dialog', { name: 'Are you still there?' }).textContent).toContain('12 seconds');
    fireEvent.keyDown(getByRole(el, 'dialog'), { key: 'Escape' });
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(50); // the view updates on the next scheduler tick
    expect(getByRole(el, 'dialog').textContent).toContain('10 seconds');
    await vi.advanceTimersByTimeAsync(10050);
    expect([fixture.componentInstance.expired, fixture.componentInstance.open(), queryByRole(el, 'dialog')]).toEqual([1, false, null]);
  });

  it('RepaymentSchedule has a caption, column headers and row states', async () => {
    @Component({ imports: [RepaymentSchedule], template: `<bx-loan-schedule [rows]="[{ date: '05 Feb', amount: '412.00', status: 'overdue' }]" />` })
    class Host {}
    const { el } = await mount(Host);
    expect(getByRole(el, 'table', { name: 'Repayment schedule' })).toBeTruthy();
    expect(getAllByRole(el, 'columnheader').map((h) => h.textContent)).toEqual(['Due date', 'Instalment']);
    expect(getByRole(el, 'row', { name: /05 Feb/ }).className).toBe('bx-tr is-overdue');
  });
});
