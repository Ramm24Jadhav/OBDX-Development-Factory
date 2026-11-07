import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactElement, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApplicationTracker, Certificates, ComposeMessage, DepositCalculator, EReceipts, EligibilityCalculator, Faq, FeedbackRating, ForexCalculator, GoalCalculator, LiveChat,
  LoanCalculator, Locator, Mailbox, Nominations, Period, ProductCard, RaiseRequest, SelfRegister, StatementFormat, StatementRequest, TaxSelfCertification, TermsConsent,
  TrackRequests, instalment, maturity } from '../src';
import { violations } from './a11y';

afterEach(cleanup);

function Controlled<T>({ initial, children }: { initial: T; children: (value: T, set: (v: T) => void) => ReactElement }) {
  const [value, setValue] = useState<T>(initial);
  return children(value, setValue);
}
const usd = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const places = [{ id: 'b1', name: 'London Bridge', type: 'branch' as const, address: '1 Tooley St', distance: '0.4 km', hours: 'Open until 17:00' }, { id: 'a1', name: 'Borough ATM', type: 'atm' as const }];

describe('group 5', () => {
  it('every component renders with its sample and passes axe', async () => {
    render(
      <div>
        <RaiseRequest items={[{ label: 'Request', value: 'Cheque book' }, { label: 'Leaves', value: '25' }]} />
        <TrackRequests items={[{ label: 'Received', meta: 'SR-2210 · 10 Jan' }, { label: 'Dispatched', meta: 'Expected 15 Jan', state: 'pending' }]} />
        <Mailbox items={[{ title: 'Your cheque book is on the way', meta: 'Today', value: 'Mail', unread: true }]} />
        <ComposeMessage value="" />
        <EReceipts items={[{ title: 'Transfer to A. Rao', meta: '14 Jan · 1,250.00', value: 'PDF' }]} />
        <Certificates items={[{ title: 'Interest certificate', meta: 'Savings ·· 4821 · 2025', value: 'PDF' }]} />
        <StatementRequest value={{ from: '2025-10-01', to: '2025-12-31' }} />
        <StatementFormat value="PDF" />
        <SelfRegister selectedStep="Verify" />
        <TaxSelfCertification selectedStep="Identity" />
        <ProductCard heading="Platinum credit card" text="2% cashback · no annual fee in year one" badge="New" />
        <ApplicationTracker items={[{ label: 'Submitted', meta: '12 Jan' }, { label: 'Credit decision', meta: 'Expected 16 Jan', state: 'current' }]} />
        <TermsConsent options={['I accept the terms and conditions', 'Send me offers by email']} value={[]} />
        <LoanCalculator currency="USD" />
        <EligibilityCalculator value={6000} prefix="USD" />
        <DepositCalculator currency="USD" />
        <ForexCalculator currency="USD" toCurrency="EUR" />
        <GoalCalculator value={400} prefix="USD" />
        <Locator items={places} />
        <LiveChat messages={[{ id: 'm1', from: 'agent', name: 'Priya', text: 'Hello, how can I help?', time: '10:02' }]} />
        <FeedbackRating value={4} />
        <Nominations items={[{ title: 'S. Rao · spouse', meta: 'Savings ·· 4821', value: '50%' }]} />
        <Faq items={[{ title: 'How do I reset my password?', body: 'Choose Forgot password on the sign-in page.' }]} />
      </div>,
    );
    expect(screen.getByRole('log', { name: 'Chat with us' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'How was it?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Directions to London Bridge' })).toBeTruthy();
    expect(screen.getAllByRole('checkbox').length).toBe(2);
    expect(await violations()).toEqual([]);
  });

  it('the formulas and the calculators work out as the customer types', async () => {
    expect([round(instalment(100000, 12, 12)), instalment(1200, 0, 12), round(maturity(10000, 8, 12))]).toEqual([8884.88, 100, 10824.32]);
    render(<><LoanCalculator testID="l" amount={100000} rate={12} months={12} currency="USD" /><ForexCalculator testID="f" currency="USD" toCurrency="EUR" rate={0.92} /></>);
    const loan = screen.getByTestId('l');
    expect(within(loan).getByText(`${usd(8884.88)} USD`)).toBeTruthy();
    fireEvent.change(within(loan).getByLabelText('Months'), { target: { value: '24' } });
    expect(within(loan).getByText(`${usd(4707.35)} USD`)).toBeTruthy();
    expect(within(screen.getByTestId('f')).getByText(`${usd(920)} EUR`)).toBeTruthy();
  });

  it('StatementRequest checks the period before it asks', async () => {
    const asked = vi.fn();
    render(<Controlled initial={{ from: '', to: '' } as Period}>{(v, set) => <StatementRequest value={v} onChange={set} maxDays={92} onRequest={asked} />}</Controlled>);
    await userEvent.click(screen.getByRole('button', { name: 'Request' }));
    expect(screen.getByRole('alert').textContent).toContain('Choose the first and the last day.');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2025-01-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2025-12-31' } });
    await userEvent.click(screen.getByRole('button', { name: 'Request' }));
    expect(screen.getByRole('alert').textContent).toContain('Choose up to 92 days.');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2025-10-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Request' }));
    expect(asked).toHaveBeenCalledWith({ from: '2025-10-01', to: '2025-12-31' });
  });

  it('LiveChat sends on Enter; ComposeMessage sends what was typed; the locator filters', async () => {
    const sent = vi.fn();
    render(<><LiveChat messages={[]} onSend={sent} /><Controlled initial="">{(v, set) => <ComposeMessage value={v} onChange={set} onSend={sent} />}</Controlled><Locator items={places} /></>);
    await userEvent.type(screen.getByRole('textbox', { name: 'Write a message' }), '  My card is stuck  {enter}');
    await userEvent.type(screen.getByLabelText('Message to the bank'), 'Please send a cheque book.');
    await userEvent.click(within(screen.getByLabelText('Message to the bank').closest('.bx-compose') as HTMLElement).getByRole('button', { name: 'Send' }));
    expect(sent.mock.calls.map((c) => c[0])).toEqual(['My card is stuck', 'Please send a cheque book.']);
    await userEvent.click(screen.getByRole('button', { name: 'ATMs' }));
    expect(screen.queryByText('London Bridge')).toBeNull();
    expect(screen.getByText('Borough ATM')).toBeTruthy();
  });

  it('FeedbackRating chooses by star and says the word', async () => {
    render(<Controlled initial={0}>{(v, set) => <FeedbackRating value={v} onChange={set} />}</Controlled>);
    await userEvent.click(screen.getByRole('radio', { name: '4 stars, Good' }));
    expect((screen.getByRole('radio', { name: '4 stars, Good' }) as HTMLInputElement).checked).toBe(true);
    expect(document.querySelectorAll('.bx-star.is-on').length).toBe(4);
  });
});

function round(n: number) { return Math.round(n * 100) / 100; }
