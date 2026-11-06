import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReactElement, useState } from 'react';
import { Text } from 'react-native';

import { ApplicationTracker, Certificates, ComposeMessage, DepositCalculator, EReceipts, EligibilityCalculator, Faq, FeedbackRating, ForexCalculator,
  GoalCalculator, LiveChat, LoanCalculator, Locator, Mailbox, Nominations, ProductCard, RaiseRequest, SelfRegister, StatementFormat, StatementRequest,
  TaxSelfCertification, TermsConsent, TrackRequests, loanFor, maturityValue } from '../src';
import { accessibilityProblems } from './a11y';

function Controlled<T>({ initial, children }: { initial: T; children: (value: T, set: (v: T) => void) => ReactElement }) {
  const [value, setValue] = useState<T>(initial);
  return children(value, setValue);
}

const noop = () => undefined;
const accounts = [{ id: 'sav', name: 'Savings', number: '0012004821', currency: 'USD' }];
const docs = [{ id: 'r1', title: 'Transfer to A. Rao', meta: '14 Jan · 1,250.00', value: 'PDF' }];
const terms = [{ value: 'tc', label: 'I accept the terms and conditions' }, { value: 'offers', label: 'Send me offers by email' }];
const places = [{ id: 'a', name: 'Bridge St', kind: 'atm' as const, address: '12 Bridge St', distance: '0.4 km' },
  { id: 'b', name: 'London Bridge', kind: 'branch' as const, address: '1 Tooley St', distance: '0.9 km' }];

describe('group 5', () => {
  it('every component renders with a name and a role on each control, and touch targets of at least 44 points', async () => {
    const all: [string, ReactElement][] = [
      ['RaiseRequest', <RaiseRequest testID="x" types={['Cheque book']} accounts={accounts} value={{ type: '', account: '', details: '' }} onSubmit={noop} />],
      ['TrackRequests', <TrackRequests testID="x" items={[{ label: 'Received', meta: 'SR-2210' }]} />],
      ['Mailbox', <Mailbox testID="x" messages={[{ id: 'm', title: 'Your cheque book is on the way', unread: true }]} onOpen={noop} />],
      ['ComposeMessage', <ComposeMessage testID="x" subjects={['Cards']} value={{ subject: '', body: '' }} onSend={noop} />],
      ['EReceipts', <EReceipts testID="x" documents={docs} onDownload={noop} />],
      ['Certificates', <Certificates testID="x" documents={docs} onDownload={noop} />],
      ['StatementRequest', <StatementRequest testID="x" label="Statement period" value={{ from: '', to: '' }} onSubmit={noop} />],
      ['StatementFormat', <StatementFormat testID="x" label="Format" value="pdf" />],
      ['SelfRegister', <SelfRegister testID="x" steps={['Details', 'Verify', 'Password', 'Done']} selectedStep="Verify" />],
      ['TaxSelfCertification', <TaxSelfCertification testID="x" steps={['Identity', 'Tax residency']} selectedStep="Identity" />],
      ['ProductCard', <ProductCard testID="x" title="Platinum credit card" body="2% cashback" badge="New" onAction={noop} />],
      ['ApplicationTracker', <ApplicationTracker testID="x" items={[{ label: 'Submitted', meta: '12 Jan' }]} />],
      ['TermsConsent', <TermsConsent testID="x" label="Before you continue" options={terms} mustAccept={['tc']} value={[]} onContinue={noop} />],
      ['LoanCalculator', <LoanCalculator testID="x" value={{ amount: 10000, rate: 9, months: 24 }} currency="USD" />],
      ['EligibilityCalculator', <EligibilityCalculator testID="x" label="Monthly income" value={6000} max={20000} annualRate={9} months={240} currency="USD" />],
      ['DepositCalculator', <DepositCalculator testID="x" value={{ amount: 10000, rate: 6, months: 12 }} currency="USD" />],
      ['ForexCalculator', <ForexCalculator testID="x" value={100} currency="USD" to="EUR" rate={0.92} />],
      ['GoalCalculator', <GoalCalculator testID="x" label="Saving each month" value={400} max={2000} target={3000} currency="USD" />],
      ['Locator', <Locator testID="x" places={places} onDirections={noop} map={<Text>Map</Text>} />],
      ['LiveChat', <LiveChat testID="x" messages={[{ id: '1', from: 'bank', text: 'Hello, how can we help?' }]} suggestions={['Block my card']} onSend={noop} />],
      ['FeedbackRating', <FeedbackRating testID="x" label="How was this payment?" value={4} onSubmit={noop} />],
      ['Nominations', <Nominations testID="x" nominees={[{ id: 's', title: 'S. Rao · spouse', value: '50%' }]} onEdit={noop} />],
      ['Faq', <Faq testID="x" items={[{ id: 'a', title: 'How do I reset my password?', body: 'Choose Forgot password.' }]} />],
    ];
    for (const [name, element] of all) {
      await render(element);
      expect([name, accessibilityProblems()]).toEqual([name, []]);
    }
  });

  it('works out a maturity value and the loan an instalment pays off', () => {
    expect(Math.round(maturityValue(10000, 6, 12) * 100) / 100).toBe(10613.64);
    expect(Math.round(loanFor(8884.88, 12, 12))).toBe(100000);
    expect(loanFor(100, 0, 10)).toBe(1000);
  });

  it('LoanCalculator shows the monthly payment and the interest', async () => {
    await render(<LoanCalculator testID="l" value={{ amount: 100000, rate: 12, months: 12 }} currency="USD" />);
    expect(screen.getByTestId('l-result').props.accessibilityLabel).toMatch(/^Each month: 8,884.88 USD. Interest over the loan 6,618.55 USD/);
  });

  it('ForexCalculator and GoalCalculator say the result in words', async () => {
    await render(<ForexCalculator testID="f" value={100} currency="USD" to="EUR" rate={0.92} />);
    expect(screen.getByTestId('f-result').props.accessibilityLabel).toMatch(/^The payee gets: 92.00 EUR. 1 USD = 0.92 EUR/);
    await render(<GoalCalculator testID="g" label="Saving each month" value={400} max={2000} target={3000} currency="USD" />);
    expect(screen.getByTestId('g-note')).toHaveTextContent('You reach 3,000.00 USD in 8 months.');
  });

  it('TermsConsent names the box still to tick and continues once it is', async () => {
    const go = jest.fn();
    await render(<Controlled<string[]> initial={[]}>{(v, set) => <TermsConsent testID="t" label="Before you continue" options={terms} mustAccept={['tc']} value={v}
                                                                              onChange={set} onContinue={go} />}</Controlled>);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent('To go on, tick: I accept the terms and conditions.');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I accept the terms and conditions' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('FeedbackRating writes back the stars and says what each means', async () => {
    let seen: number | null = null;
    const submit = jest.fn();
    await render(<Controlled<number | null> initial={null}>{(v, set) => <FeedbackRating testID="f" label="How was it?" value={v} onSubmit={submit}
                                                                                       onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    expect(screen.getByRole('button', { name: 'Send feedback' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole('radio', { name: '4 stars, Good' }));
    expect(seen).toBe(4);
    await fireEvent.press(screen.getByRole('button', { name: 'Send feedback' }));
    expect(submit).toHaveBeenCalledWith(4, '');
  });

  it('LiveChat sends a suggestion or a typed message and reads who said what', async () => {
    const send = jest.fn();
    await render(<LiveChat testID="c" messages={[{ id: '1', from: 'bank', text: 'Hello', time: '10:02' }]} suggestions={['Block my card']} onSend={send} />);
    expect(screen.getByLabelText('Bank at 10:02: Hello')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Block my card' }));
    await fireEvent.changeText(screen.getByLabelText('Your message'), '  Thanks  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(send.mock.calls).toEqual([['Block my card'], ['Thanks']]);
  });

  it('Locator filters ATMs and branches and asks for directions', async () => {
    const go = jest.fn();
    await render(<Locator testID="l" places={places} onDirections={go} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Branches' }));
    expect(screen.queryByText('Bridge St')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Directions: London Bridge' }));
    expect(go.mock.calls[0][0].id).toBe('b');
  });

  it('StatementRequest needs both dates', async () => {
    const submit = jest.fn();
    await render(<StatementRequest testID="s" label="Statement period" value={{ from: '2025-10-01', to: '' }} onSubmit={submit} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Request statement' }));
    expect(screen.getAllByRole('alert').some((a) => /Choose both dates/.test(String(a.props.children)))).toBe(true);
    expect(submit).not.toHaveBeenCalled();
  });

  it('ComposeMessage asks for the subject and the message', async () => {
    const send = jest.fn();
    await render(<ComposeMessage testID="m" subjects={['Cards']} value={{ subject: 'Cards', body: ' ' }} onSend={send} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Write your message.');
    expect(send).not.toHaveBeenCalled();
  });

  it('Mailbox counts the unread and opens one', async () => {
    const open = jest.fn();
    await render(<Mailbox testID="m" messages={[{ id: 'a', title: 'New statement', unread: true }, { id: 'b', title: 'Low balance' }]} onOpen={open} />);
    expect(screen.getByText('Mailbox, 1 unread')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Unread, New statement' }));
    expect(open.mock.calls[0][0].id).toBe('a');
  });
});
