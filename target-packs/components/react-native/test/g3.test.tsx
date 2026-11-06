import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ReactElement, useState } from 'react';

import { ActivateCard, AddOnCard, AuthChallenge, BlockCard, CardControls, CardLimits, CardList, CardStatements, CardTile, ConvertToEmi, DisbursementTimeline,
  FraudAlert, KycSteps, LoanRepayment, LoansSummary, OtpInput, PromiseToPay, RaiseDispute, RedeemPoints, RepaymentSchedule, ResetPin, SecureConfirmation,
  SensitiveField, SessionExpiryWarning, instalment } from '../src';
import { accessibilityProblems } from './a11y';

function Controlled<T>({ initial, children }: { initial: T; children: (value: T, set: (v: T) => void) => ReactElement }) {
  const [value, setValue] = useState<T>(initial);
  return children(value, setValue);
}

const noop = () => undefined;
const accounts = [{ id: 'sav', name: 'Savings', number: '0012004821', available: 12150, currency: 'USD' }];
const card = { id: 'c', name: 'Platinum', number: '4111111111114821', expiry: '08/29', network: 'VISA' };
const tiles = [{ id: 'h', title: 'Home loan', value: '142,300.00', note: 'Next 1,240.00 on 5 Feb' }];

describe('group 3', () => {
  it('every component renders with a name and a role on each control, and touch targets of at least 44 points', async () => {
    const all: [string, ReactElement][] = [
      ['LoansSummary', <LoansSummary testID="x" tiles={tiles} />],
      ['LoanRepayment', <LoanRepayment testID="x" loans={[{ value: 'car', label: 'Car loan ·· 3310' }]} accounts={accounts} due={412} onReview={noop}
                                       value={{ loan: '', amount: null, from: '' }} />],
      ['RepaymentSchedule', <RepaymentSchedule testID="x" currency="USD" instalments={[{ due: '05 Feb', principal: 380, interest: 32 }]} />],
      ['PromiseToPay', <PromiseToPay testID="x" label="Promise to pay" rows={[{ label: 'Overdue', value: '412.00' }]} value="" onSubmit={noop} />],
      ['DisbursementTimeline', <DisbursementTimeline testID="x" items={[{ label: 'Sanctioned 30,000.00', meta: '02 Jan' }]} />],
      ['CardTile', <CardTile testID="x" card={card} frozen={false} />],
      ['CardList', <CardList testID="x" tiles={tiles} onChange={noop} />],
      ['ActivateCard', <ActivateCard testID="x" label="Enter the activation code" value="" />],
      ['ConvertToEmi', <ConvertToEmi testID="x" label="Pay 1,200.00 over" value="6" amount={1200} annualRate={14} currency="USD" />],
      ['RedeemPoints', <RedeemPoints testID="x" label="Points to redeem" value={5000} max={12400} pointValue={0.01} currency="USD" />],
      ['CardLimits', <CardLimits testID="x" label="Daily limit" value={2000} max={5000} currency="USD" />],
      ['CardControls', <CardControls testID="x" label="Allow" value={['online']} />],
      ['BlockCard', <BlockCard testID="x" label="Block the card" value={false} />],
      ['ResetPin', <ResetPin testID="x" value="" />],
      ['RaiseDispute', <RaiseDispute testID="x" transaction="Coffee House · 4.50" value={{ reason: '', details: '' }} onSubmit={noop} />],
      ['AddOnCard', <AddOnCard testID="x" value={{ name: '', relationship: '', limit: null }} onSubmit={noop} />],
      ['CardStatements', <CardStatements testID="x" statements={[{ id: 'dec', title: 'December statement', meta: 'Generated 01 Jan' }]} onDownload={noop} />],
      ['OtpInput', <OtpInput testID="x" label="Enter the code" value="" onResend={noop} />],
      ['AuthChallenge', <AuthChallenge testID="x" label="Approve the payment" authenticate={async () => true} onSuccess={noop} onFallback={noop} />],
      ['SessionExpiryWarning', <SessionExpiryWarning testID="x" open={false} onStay={noop} onSignOut={noop} />],
      ['SecureConfirmation', <SecureConfirmation testID="x" rows={[{ label: 'Pay', value: 'A. Rao' }]} code="" onCodeChange={noop} onConfirm={noop} />],
      ['SensitiveField', <SensitiveField testID="x" label="Card number" value="4111 1111 1111 4821" />],
      ['KycSteps', <KycSteps testID="x" steps={['ID', 'Selfie', 'Address']} selectedStep="ID" />],
      ['FraudAlert', <FraudAlert testID="x" message="We stopped a payment of 899.00 to Unknown Ltd." onAllow={noop} onBlock={noop} />],
    ];
    for (const [name, element] of all) {
      await render(element);
      expect([name, accessibilityProblems()]).toEqual([name, []]);
    }
  });

  it('works out an instalment with the reducing-balance formula', () => {
    expect(Math.round(instalment(100000, 12, 12) * 100) / 100).toBe(8884.88);
    expect(instalment(1200, 0, 6)).toBe(200);
  });

  it('OTP takes digits only, writes back and completes once; Send a new code waits', async () => {
    jest.useFakeTimers();
    let seen = '';
    const done = jest.fn();
    const resend = jest.fn();
    await render(<Controlled initial="">{(v, set) => <OtpInput testID="o" label="Enter the code" value={v} resendAfter={2} onResend={resend} onComplete={done}
                                                               onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    const input = screen.getByLabelText('Enter the code, 6 digits');
    expect([input.props.textContentType, input.props.keyboardType]).toEqual(['oneTimeCode', 'number-pad']);
    await fireEvent.changeText(input, '12a34');
    expect(seen).toBe('1234');
    await fireEvent.changeText(input, '123456');
    expect(done).toHaveBeenCalledWith('123456');
    expect(screen.getByRole('button', { name: 'Send a new code in 2 seconds' }).props.accessibilityState.disabled).toBe(true);
    await act(async () => { jest.advanceTimersByTime(1000); });
    await act(async () => { jest.advanceTimersByTime(1000); });
    await fireEvent.press(screen.getByRole('button', { name: 'Send a new code' }));
    expect(resend).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('ResetPin hides the digits, refuses a simple PIN and completes only when both match', async () => {
    const done = jest.fn();
    await render(<Controlled initial="">{(v, set) => <ResetPin testID="r" value={v} onChange={set} onComplete={done} />}</Controlled>);
    const first = screen.getByLabelText('Choose a new PIN, 4 digits');
    expect(first.props.secureTextEntry).toBe(true);
    await fireEvent.changeText(first, '1234');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a PIN that is harder to guess.');
    await fireEvent.changeText(first, '4071');
    await fireEvent.changeText(screen.getByLabelText('Type the PIN again, 4 digits'), '4070');
    expect(screen.getByRole('alert')).toHaveTextContent('The PINs do not match. Type it again.');
    await fireEvent.changeText(screen.getByLabelText('Type the PIN again, 4 digits'), '4071');
    expect(done).toHaveBeenCalledWith('4071');
  });

  it('CardTile masks the number and freezes the card', async () => {
    let frozen = false;
    await render(<CardTile testID="c" card={card} frozen={false} onFrozenChange={(x) => { frozen = x; }} />);
    expect(screen.getByLabelText('Platinum card ·· 4821, expires 08/29')).toBeTruthy();
    expect(screen.queryByText(/4111/)).toBeNull();
    await fireEvent(screen.getByLabelText('Freeze the card'), 'valueChange', true);
    expect(frozen).toBe(true);
  });

  it('BlockCard asks before blocking', async () => {
    let blocked = false;
    await render(<BlockCard testID="b" label="Block the card" value={false} onChange={(x) => { blocked = x; }} />);
    await fireEvent(screen.getByLabelText('Block the card'), 'valueChange', true);
    expect(blocked).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Block' }));
    expect(blocked).toBe(true);
  });

  it('CardControls writes back the allowed uses', async () => {
    let seen: string[] = [];
    await render(<Controlled<string[]> initial={['online']}>{(v, set) => <CardControls testID="c" label="Allow" value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    await fireEvent(screen.getByLabelText('Use abroad'), 'valueChange', true);
    await fireEvent(screen.getByLabelText('Online payments'), 'valueChange', false);
    expect(seen).toEqual(['abroad']);
  });

  it('ConvertToEmi shows the monthly amount of the plan chosen', async () => {
    await render(<Controlled initial="">{(v, set) => <ConvertToEmi testID="e" label="Pay 1,200.00 over" value={v} onChange={set} amount={1200} annualRate={0}
                                                                   currency="USD" />}</Controlled>);
    await fireEvent.press(screen.getByRole('radio', { name: '6 months' }));
    expect(screen.getByTestId('e-each')).toHaveTextContent('200.00 USD a month for 6 months, 1,200.00 USD in all at 0% a year.');
  });

  it('RedeemPoints shows what the points are worth', async () => {
    await render(<RedeemPoints testID="r" label="Points to redeem" value={5000} max={12400} pointValue={0.01} currency="USD" />);
    expect(screen.getByTestId('r-value')).toHaveTextContent('5,000 points');
    expect(screen.getByTestId('r-note')).toHaveTextContent('Worth 50.00 USD');
  });

  it('AuthChallenge says when the check failed and succeeds on a retry', async () => {
    const ok = jest.fn();
    const check = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await render(<AuthChallenge testID="a" label="Approve the payment" authenticate={check} onSuccess={ok} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Use fingerprint or face' }));
    expect(screen.getByRole('alert')).toHaveTextContent('That did not work. Try again or use a code.');
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('SessionExpiryWarning counts down and signs out at zero', async () => {
    jest.useFakeTimers();
    const out = jest.fn();
    await render(<SessionExpiryWarning testID="s" open seconds={2} onStay={noop} onSignOut={out} />);
    expect(screen.getByText('For your security you will be signed out in 2 seconds.')).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(1000); });
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(out).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('SecureConfirmation enables Confirm once the code is complete', async () => {
    const confirm = jest.fn();
    await render(<Controlled initial="">{(v, set) => <SecureConfirmation testID="s" rows={[{ label: 'Pay', value: 'A. Rao' }]} code={v} onCodeChange={set}
                                                                         onConfirm={confirm} />}</Controlled>);
    expect(screen.getByRole('button', { name: 'Confirm with the code' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('The code we sent, 6 digits'), '654321');
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm with the code' }));
    expect(confirm).toHaveBeenCalledWith('654321');
  });

  it('SensitiveField shows the last four until Show, and hides again by itself', async () => {
    jest.useFakeTimers();
    await render(<SensitiveField testID="s" label="Card number" value="4111 1111 1111 4821" revealFor={5} />);
    expect(screen.getByLabelText('Card number, ending 4821, hidden')).toHaveTextContent('•••• •••• •••• 4821');
    await fireEvent.press(screen.getByRole('button', { name: 'Show Card number' }));
    expect(screen.getByTestId('s-value')).toHaveTextContent('4111 1111 1111 4821');
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(screen.getByTestId('s-value')).toHaveTextContent('•••• •••• •••• 4821');
    jest.useRealTimers();
  });

  it('RaiseDispute asks for the reason and, for Other, what happened', async () => {
    const submit = jest.fn();
    await render(<Controlled initial={{ reason: 'Other', details: '' }}>{(v, set) => <RaiseDispute testID="d" transaction="Coffee House · 4.50" value={v}
                                                                                                   onChange={set} onSubmit={submit} />}</Controlled>);
    await fireEvent.press(screen.getByRole('button', { name: 'Raise dispute' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Say what happened.');
    await fireEvent.changeText(screen.getByLabelText('What happened'), 'Not mine');
    await fireEvent.press(screen.getByRole('button', { name: 'Raise dispute' }));
    expect(submit).toHaveBeenCalledWith({ reason: 'Other', details: 'Not mine' });
  });

  it('AddOnCard keeps the limit within the main card', async () => {
    const submit = jest.fn();
    await render(<AddOnCard testID="a" value={{ name: 'S. Rao', relationship: 'Spouse', limit: 9000 }} maxLimit={5000} currency="USD" onSubmit={submit} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The limit can be at most 5,000.00 USD.');
    expect(submit).not.toHaveBeenCalled();
  });

  it('LoanRepayment fills the instalment due', async () => {
    const review = jest.fn();
    await render(<Controlled initial={{ loan: 'car', amount: null as number | null, from: 'sav' }}>{(v, set) => (
      <LoanRepayment testID="l" value={v} onChange={set} loans={[{ value: 'car', label: 'Car loan ·· 3310' }]} accounts={accounts} due={412} currency="USD"
                     onReview={review} />)}</Controlled>);
    await fireEvent.press(screen.getByRole('button', { name: 'Pay the instalment due' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Review repayment' }));
    expect(review).toHaveBeenCalledWith({ loan: 'car', amount: 412, from: 'sav' });
  });
});
