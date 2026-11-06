import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactElement, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivateCard, AddOnCard, AuthChallenge, BlockCard, CardControls, CardLimits, CardList, CardStatements, CardTile, ConvertToEmi, DisbursementTimeline, FraudAlert,
  KycSteps, LoanRepayment, LoansSummary, OtpInput, PromiseToPay, RaiseDispute, RedeemPoints, RepaymentSchedule, ResetPin, SecureConfirmation, SensitiveField,
  SessionExpiryWarning, masked } from '../src';
import { violations } from './a11y';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function Controlled<T>({ initial, children }: { initial: T; children: (value: T, set: (v: T) => void) => ReactElement }) {
  const [value, setValue] = useState<T>(initial);
  return children(value, setValue);
}
const kv = [{ label: 'Overdue', value: '412.00' }, { label: 'Pay from', value: 'Savings ·· 4821' }];

describe('group 3', () => {
  it('every component renders with its sample and passes axe', async () => {
    render(
      <div>
        <LoansSummary items={[{ label: 'Home loan', value: '142,300.00', meta: 'Next 1,240.00 on 5 Feb' }]} />
        <LoanRepayment items={kv} />
        <RepaymentSchedule rows={[{ date: '05 Feb', amount: '412.00' }, { date: '05 Mar', amount: '412.00', status: 'due' }]} />
        <PromiseToPay items={kv} />
        <DisbursementTimeline items={[{ label: 'Sanctioned 30,000.00', meta: '02 Jan' }, { label: 'Second disbursement 10,000.00', meta: 'Due 05 Mar', state: 'pending' }]} />
        <CardTile label="Platinum" number="4111 1111 1111 4821" holder="A. RAO" expiry="09/29" network="Visa" />
        <CardList items={[{ label: 'Platinum ·· 4821', value: '640.00 due', meta: 'Limit 10,000.00' }]} />
        <ActivateCard value="" />
        <ConvertToEmi value="6 months" />
        <RedeemPoints value={5000} />
        <CardLimits value={2000} prefix="USD" />
        <CardControls options={['Online payments', 'ATM withdrawals', 'Use abroad']} value={['Online payments']} />
        <BlockCard value={false} />
        <ResetPin value="12" />
        <RaiseDispute items={[{ label: 'Reason', value: 'Charged twice' }]} />
        <AddOnCard items={[{ label: 'Name on the card', value: 'S. Rao' }]} />
        <CardStatements items={[{ title: 'December statement', meta: 'Generated 01 Jan', value: 'PDF' }]} />
        <OtpInput value="123" helpText="We sent it to •••• 0123" />
        <AuthChallenge text="Touch the sensor to approve 1,250.00 to A. Rao." />
        <SecureConfirmation items={kv} />
        <SensitiveField value="4111 1111 1111 4821" />
        <KycSteps selectedStep="Selfie" />
        <FraudAlert message="We stopped a payment of 899.00 to Unknown Ltd." />
      </div>,
    );
    expect(screen.getByRole('img', { name: 'Platinum, Visa, ending 4821' })).toBeTruthy();
    expect(screen.getByText('•••• 4821', { selector: '.bx-sensitive-value' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('We stopped a payment');
    expect(await violations()).toEqual([]);
  });

  it('a code takes digits only and says when it is complete; a PIN is dots', async () => {
    const done = vi.fn();
    render(<Controlled initial="">{(v, set) => <OtpInput testID="o" value={v} onChange={set} onComplete={done} />}</Controlled>);
    const input = screen.getByLabelText('Enter the code') as HTMLInputElement;
    expect(input.getAttribute('autocomplete')).toBe('one-time-code');
    await userEvent.type(input, '12a3456');
    expect([input.value, done.mock.calls[0][0]]).toEqual(['123456', '123456']);
    cleanup();
    render(<ResetPin value="98" />);
    const pin = screen.getByLabelText('Choose a new PIN') as HTMLInputElement;
    expect([pin.type, Array.from(document.querySelectorAll('.bx-slot')).map((s) => s.textContent)]).toEqual(['password', ['•', '•', '', '']]);
  });

  it('card controls and block card switch, and blocking says what it means', async () => {
    render(<><Controlled initial={['Online payments']}>{(v, set) => <CardControls options={['Online payments', 'Use abroad']} value={v} onChange={set} />}</Controlled>
      <Controlled initial={false}>{(v, set) => <BlockCard value={v} onChange={set} />}</Controlled></>);
    await userEvent.click(screen.getByRole('switch', { name: 'Use abroad' }));
    expect(screen.getByRole('switch', { name: 'Use abroad' }).getAttribute('aria-checked')).toBe('true');
    await userEvent.click(screen.getByRole('switch', { name: 'Block the card' }));
    expect(screen.getByRole('status').textContent).toContain('The card is blocked');
  });

  it('SensitiveField shows the number on request; masked keeps the last four', async () => {
    render(<SensitiveField value="4111 1111 1111 4821" />);
    await userEvent.click(screen.getByRole('button', { name: 'Show Card number' }));
    expect(screen.getByText('4111 1111 1111 4821')).toBeTruthy();
    expect(masked('GB29 NWBK 6016 1331 9268 19')).toBe('•••• 6819');
  });

  it('AuthChallenge asks once while waiting and says when it failed', async () => {
    const verify = vi.fn();
    const { rerender } = render(<AuthChallenge state="waiting" onVerify={verify} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use fingerprint' }));
    expect(verify).not.toHaveBeenCalled();
    rerender(<AuthChallenge state="failed" onVerify={verify} />);
    await userEvent.click(screen.getByRole('button', { name: 'Use fingerprint' }));
    expect([verify.mock.calls.length, screen.getByRole('alert').textContent]).toEqual([1, '!That did not work. Try again, or use a code.']);
  });

  it('SessionExpiryWarning counts down, stays open on Escape and ends at zero', () => {
    vi.useFakeTimers();
    const expire = vi.fn();
    render(<SessionExpiryWarning open seconds={12} onExpire={expire} />);
    expect(screen.getByRole('dialog', { name: 'Are you still there?' }).textContent).toContain('12 seconds');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('dialog').textContent).toContain('10 seconds');
    act(() => { vi.advanceTimersByTime(10000); });
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it('RepaymentSchedule has a caption and column headers', () => {
    render(<RepaymentSchedule rows={[{ date: '05 Feb', amount: '412.00', status: 'overdue' }]} />);
    expect(screen.getByRole('table', { name: 'Repayment schedule' })).toBeTruthy();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Due date', 'Instalment']);
    expect(screen.getByRole('row', { name: /05 Feb/ }).className).toBe('bx-tr is-overdue');
  });
});
