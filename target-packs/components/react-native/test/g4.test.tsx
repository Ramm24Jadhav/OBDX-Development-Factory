import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReactElement, useState } from 'react';

import { AlertSubscriptions, Appearance, ApprovalDetail, ApprovalJourney, ApprovalQueue, BarChart, CodeDelivery, Consents, Devices, DoNotDisturb, LanguagePicker,
  ModificationNotice, Profile, ProgressBar, SavingsGoal, SessionSummary, SignInOptions, SpendCategories, TransactionLimits } from '../src';
import { accessibilityProblems } from './a11y';

function Controlled<T>({ initial, children }: { initial: T; children: (value: T, set: (v: T) => void) => ReactElement }) {
  const [value, setValue] = useState<T>(initial);
  return children(value, setValue);
}

const noop = () => undefined;
const rows = [{ label: 'Reference', value: 'PAY-4410' }, { label: 'Amount', value: '182,400.00 USD' }];
const queue = [{ id: '12', title: 'Vendor ABC Ltd', meta: 'Financial · 12,000.00' }, { id: '10', title: 'Payroll Feb', meta: 'Financial · 182,400.00', priority: true }];

describe('group 4', () => {
  it('every component renders with a name and a role on each control, and touch targets of at least 44 points', async () => {
    const all: [string, ReactElement][] = [
      ['BarChart', <BarChart testID="x" label="Spending" currency="USD" bars={[{ label: 'Jan', value: 1240 }, { label: 'Feb', value: 980 }]} />],
      ['ProgressBar', <ProgressBar testID="x" currency="USD" items={[{ label: 'Groceries', value: 320, max: 400 }]} />],
      ['SavingsGoal', <SavingsGoal testID="x" label="Holiday fund" saved={1800} target={3000} currency="USD" onAdd={noop} />],
      ['SpendCategories', <SpendCategories testID="x" label="Coffee House · 4.50 is" value={['Eating out']} options={['Eating out', 'Groceries']} />],
      ['ApprovalQueue', <ApprovalQueue testID="x" items={queue} onApprove={noop} onReject={noop} />],
      ['ApprovalDetail', <ApprovalDetail testID="x" rows={rows} onApprove={noop} onReject={noop} onSendBack={noop} />],
      ['ApprovalJourney', <ApprovalJourney testID="x" items={[{ label: 'Initiated', meta: 'A. Rao · 09:12' }, { label: 'Level 2', state: 'current' }]} />],
      ['ModificationNotice', <ModificationNotice testID="x" message="PAY-4410 was sent back." onAction={noop} />],
      ['Profile', <Profile testID="x" rows={[{ label: 'Name', value: 'A. Rao' }]} onAction={noop} />],
      ['SignInOptions', <SignInOptions testID="x" label="Sign in with" value={['Passkey']} options={['Passkey', 'Facial ID']} />],
      ['CodeDelivery', <CodeDelivery testID="x" label="Send codes by" value="SMS" />],
      ['Devices', <Devices testID="x" devices={[{ id: 'a', title: 'iPhone 15', current: true }, { id: 'b', title: 'Chrome on Windows' }]} onRemove={noop} />],
      ['Appearance', <Appearance testID="x" label="Theme" value="system" />],
      ['LanguagePicker', <LanguagePicker testID="x" label="Language" value="en" />],
      ['AlertSubscriptions', <AlertSubscriptions testID="x" label="Tell me about" value={[]} options={['Low balance']} />],
      ['DoNotDisturb', <DoNotDisturb testID="x" label="Quiet hours, 22:00 to 07:00" value />],
      ['Consents', <Consents testID="x" consents={[{ id: 'b', title: 'Budget app', meta: 'Granted 02 Jan' }]} onRevoke={noop} />],
      ['TransactionLimits', <TransactionLimits testID="x" currency="USD" items={[{ label: 'Daily transfers', value: 1200, max: 5000 }]} />],
      ['SessionSummary', <SessionSummary testID="x" items={[{ label: 'Today 08:12', meta: 'iPhone 15 · London' }]} />],
    ];
    for (const [name, element] of all) {
      await render(element);
      expect([name, accessibilityProblems()]).toEqual([name, []]);
    }
  });

  it('BarChart reads each bar and shows the amount of the one tapped', async () => {
    let seen = '';
    await render(<BarChart testID="b" label="Spending" currency="USD" onChange={(x) => { seen = x; }} bars={[{ label: 'Jan', value: 1240 }, { label: 'Feb', value: 980 }]} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Feb, 980.00' }));
    expect(seen).toBe('Feb');
    expect(screen.getByTestId('b-picked')).toHaveTextContent('Feb: 980.00 USD');
  });

  it('ProgressBar says when a budget is over its limit', async () => {
    await render(<ProgressBar testID="p" currency="USD" items={[{ label: 'Eating out', value: 210, max: 200 }]} />);
    const bar = screen.getByLabelText('Eating out, 210.00 of 200.00 used, over the limit');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 200, now: 200 });
  });

  it('SavingsGoal says what is left to save', async () => {
    await render(<SavingsGoal testID="g" label="Holiday fund" saved={1800} target={3000} currency="USD" />);
    expect(screen.getByText('1,200.00 USD to go.')).toBeTruthy();
  });

  it('ApprovalQueue puts prioritized items first and reports Approve and Reject', async () => {
    const approve = jest.fn();
    const reject = jest.fn();
    await render(<ApprovalQueue testID="q" items={queue} onApprove={approve} onReject={reject} />);
    const approves = screen.getAllByRole('button', { name: /^Approve: / });
    expect(approves[0].props.accessibilityLabel).toBe('Approve: Payroll Feb · prioritized');
    await fireEvent.press(approves[0]);
    await fireEvent.press(screen.getByRole('button', { name: 'Reject: Vendor ABC Ltd' }));
    expect([approve.mock.calls[0][0].id, reject.mock.calls[0][0].id]).toEqual(['10', '12']);
  });

  it('ApprovalDetail asks for the reason before a rejection', async () => {
    const reject = jest.fn();
    await render(<ApprovalDetail testID="d" rows={rows} onApprove={noop} onReject={reject} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Reject' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Reject' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give a reason; the maker sees it.');
    await fireEvent.changeText(screen.getByLabelText('Why are you rejecting it?'), 'Wrong value date');
    await fireEvent.press(screen.getByRole('button', { name: 'Reject' }));
    expect(reject).toHaveBeenCalledWith('Wrong value date');
  });

  it('Devices offers Remove on every device but this one', async () => {
    const remove = jest.fn();
    await render(<Devices testID="d" devices={[{ id: 'a', title: 'iPhone 15', current: true }, { id: 'b', title: 'Chrome on Windows' }]} onRemove={remove} />);
    expect(screen.queryByRole('button', { name: 'Remove: iPhone 15 · this device' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove: Chrome on Windows' }));
    expect(remove.mock.calls[0][0].id).toBe('b');
  });

  it('LanguagePicker writes back the language code and names each in its own language', async () => {
    let seen = '';
    await render(<Controlled initial="en">{(v, set) => <LanguagePicker testID="l" label="Language" value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    await fireEvent.press(screen.getByRole('button', { name: 'Language, English' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Français' }));
    expect(seen).toBe('fr');
  });

  it('Appearance and SpendCategories write back one value', async () => {
    let theme = '';
    let cat: string[] = [];
    await render(<Appearance testID="a" label="Theme" value="light" onChange={(x) => { theme = x; }} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
    await render(<SpendCategories testID="s" label="Category" value={['Groceries']} options={['Groceries', 'Travel']} onChange={(x) => { cat = x; }} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Travel' }));
    expect([theme, cat]).toEqual(['dark', ['Travel']]);
  });
});
