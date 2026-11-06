import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReactElement, useState } from 'react';
import { AccessibilityInfo, Text } from 'react-native';

import { Accordion, ActionMenu, ActivityIndicator, Alert, Avatar, BottomSheet, DestructiveButton, Divider, Drawer, EmptyState, ErrorMessage, FilterChips,
  NotificationPanel, Pagination, SecondaryButton, Skeleton, Slider, Stack, StatusBadge, Stepper, SuccessMessage, Timeline, ToggleGroup, Tooltip, initials } from '../src';
import { accessibilityProblems } from './a11y';

function Controlled<T>({ initial, children }: { initial: T; children: (value: T, set: (v: T) => void) => ReactElement }) {
  const [value, setValue] = useState<T>(initial);
  return children(value, setValue);
}

const noop = () => undefined;

describe('group 1', () => {
  it('every component renders with a name and a role on each control, and touch targets of at least 44 points', async () => {
    const all: [string, ReactElement][] = [
      ['SecondaryButton', <SecondaryButton testID="x" label="Save for later" onAction={noop} />],
      ['DestructiveButton', <DestructiveButton testID="x" label="Cancel payment" onAction={noop} />],
      ['Slider', <Slider testID="x" label="Monthly saving" value={1500} max={5000} currency="USD" />],
      ['ToggleGroup', <ToggleGroup testID="x" label="Show" value="Day" options={['Day', 'Week', 'Month']} />],
      ['FilterChips', <FilterChips testID="x" label="Filter" value={[]} options={['Card', 'Transfer']} />],
      ['ActionMenu', <ActionMenu testID="x" actions={[{ id: 'a', label: 'Download statement' }]} onAction={noop} />],
      ['Accordion', <Accordion testID="x" sections={[{ id: 'a', title: 'How long does a transfer take?', body: 'Same day.' }]} />],
      ['Stepper', <Stepper testID="x" steps={['Details', 'Review', 'Done']} value={1} />],
      ['Drawer', <Drawer testID="x" label="Menu" open items={[{ value: 'a', label: 'Accounts' }]} value="a" onOpenChange={noop} />],
      ['BottomSheet', <BottomSheet testID="x" title="Filter transactions" open onOpenChange={noop}><Text>Body</Text></BottomSheet>],
      ['Stack', <Stack columns={2}><Text>A</Text><Text>B</Text></Stack>],
      ['Divider', <Divider label="Older" />],
      ['Avatar', <Avatar name="Asha Rao" />],
      ['Pagination', <Pagination testID="x" value={2} pageCount={4} onChange={noop} />],
      ['StatusBadge', <StatusBadge label="Completed" tone="success" />],
      ['Timeline', <Timeline testID="x" events={[{ title: 'Initiated', detail: '09:12' }, { title: 'Completed', state: 'todo' }]} />],
      ['ActivityIndicator', <ActivityIndicator label="Loading transactions" />],
      ['Skeleton', <Skeleton />],
      ['EmptyState', <EmptyState title="No payees yet" body="Add one to pay faster." actionLabel="Add a payee" onAction={noop} />],
      ['Tooltip', <Tooltip testID="x" label="Available balance" text="What you can spend now." />],
      ['Alert', <Alert testID="x" label="Transfers after 6 pm arrive the next working day." />],
      ['ErrorMessage', <ErrorMessage testID="x" label="The amount is more than your daily limit." actionLabel="Change the amount" onAction={noop} />],
      ['SuccessMessage', <SuccessMessage testID="x" label="Payment sent." actionLabel="View receipt" onAction={noop} />],
      ['NotificationPanel', <NotificationPanel testID="x" items={[{ id: '1', title: 'Card payment due', unread: true }]} onRead={noop} />],
    ];
    for (const [name, element] of all) {
      await render(element);
      expect([name, accessibilityProblems()]).toEqual([name, []]);
    }
  });

  it('DestructiveButton asks first and acts once on confirm', async () => {
    const act = jest.fn();
    await render(<DestructiveButton testID="d" label="Cancel payment" confirm="Cancel the payment to A. Rao?" onAction={act} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel payment' }));
    expect(act).not.toHaveBeenCalled();
    expect(screen.getByText('Cancel the payment to A. Rao?')).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Cancel payment' })[1]);
    expect(act).toHaveBeenCalledTimes(1);
  });

  it('Slider steps with the screen reader swipe, writes back and stays within max', async () => {
    let seen = 0;
    await render(<Controlled initial={4900}>{(v, set) => <Slider testID="s" label="Monthly saving" value={v} min={0} max={5000} step={100} currency="USD"
                                                                   onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    const slider = screen.getByRole('adjustable', { name: 'Monthly saving' });
    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(seen).toBe(5000);
    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(seen).toBe(5000);
    expect(screen.getByTestId('s-value')).toHaveTextContent('USD 5,000.00');
    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(seen).toBe(4900);
  });

  it('ToggleGroup and FilterChips write back one value and several', async () => {
    let one = '';
    let many: string[] = [];
    await render(<Controlled initial="Day">{(v, set) => <ToggleGroup testID="t" label="Show" value={v} options={['Day', 'Week']} onChange={(x) => { one = x; set(x); }} />}</Controlled>);
    await fireEvent.press(screen.getByRole('radio', { name: 'Week' }));
    expect(one).toBe('Week');
    expect(screen.getByRole('radio', { name: 'Week' }).props.accessibilityState.checked).toBe(true);
    await render(<Controlled<string[]> initial={[]}>{(v, set) => <FilterChips testID="f" label="Filter" value={v} options={['Card', 'Bills']}
                                                                              onChange={(x) => { many = x; set(x); }} />}</Controlled>);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Card' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Bills' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Card' }));
    expect(many).toEqual(['Bills']);
  });

  it('ActionMenu opens a sheet and reports the action chosen', async () => {
    const act = jest.fn();
    await render(<ActionMenu testID="m" actions={[{ id: 'nick', label: 'Set a nickname' }, { id: 'close', label: 'Close the account', danger: true }]} onAction={act} />);
    await fireEvent.press(screen.getByRole('button', { name: 'More actions' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Close the account' }));
    expect(act).toHaveBeenCalledWith('close');
    expect(screen.queryByRole('button', { name: 'Set a nickname' })).toBeNull();
  });

  it('Accordion says whether each section is expanded and keeps one open when single', async () => {
    await render(<Accordion testID="a" single sections={[{ id: 'a', title: 'Fees?', body: 'None.' }, { id: 'b', title: 'Cancel?', body: 'Until it is sent.' }]} />);
    const fees = screen.getByRole('button', { name: 'Fees?' });
    expect(fees.props.accessibilityState.expanded).toBe(false);
    await fireEvent.press(fees);
    expect(screen.getByText('None.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel?' }));
    expect(screen.queryByText('None.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel?' }).props.accessibilityState.expanded).toBe(true);
  });

  it('Drawer marks the current page, and choosing one writes back and closes', async () => {
    let page = '';
    const open = jest.fn();
    await render(<Drawer testID="d" label="Menu" open onOpenChange={open} value="acc" onChange={(x) => { page = x; }}
                         items={[{ value: 'acc', label: 'Accounts' }, { value: 'pay', label: 'Payments' }]} />);
    expect(screen.getByRole('tab', { name: 'Accounts' }).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByRole('tab', { name: 'Payments' }));
    expect([page, open.mock.calls[0][0]]).toEqual(['pay', false]);
  });

  it('Pagination cannot go before the first page and marks the current one', async () => {
    const go = jest.fn();
    await render(<Pagination testID="p" value={1} pageCount={3} onChange={go} />);
    expect(screen.getByRole('button', { name: 'Previous page' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Page 1 of 3' }).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Next page' }));
    expect(go).toHaveBeenCalledWith(2);
  });

  it('Tooltip opens on press and announces its text', async () => {
    const say = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await render(<Tooltip testID="t" label="Available balance" text="What you can spend now." />);
    expect(screen.queryByText('What you can spend now.')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'About Available balance' }));
    expect(screen.getByText('What you can spend now.')).toBeTruthy();
    expect(say).toHaveBeenCalledWith('What you can spend now.');
  });

  it('errors are alerts, success is not', async () => {
    await render(<ErrorMessage testID="e" label="The amount is more than your daily limit." />);
    expect(screen.getByRole('alert')).toHaveTextContent('The amount is more than your daily limit.');
    await render(<SuccessMessage testID="s" label="Payment sent." />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('NotificationPanel counts the unread and offers Read only on them', async () => {
    const read = jest.fn();
    await render(<NotificationPanel testID="n" onRead={read} items={[{ id: '1', title: 'Card payment due', unread: true }, { id: '2', title: 'New statement' }]} />);
    expect(screen.getByText('Notifications, 1 unread')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Read New statement' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Read Card payment due' }));
    expect(read.mock.calls[0][0].id).toBe('1');
  });

  it('Avatar shows initials and reads the name', async () => {
    expect(initials('A. Rao')).toBe('AR');
    await render(<Avatar name="Asha Rao" />);
    expect(screen.getByLabelText('Asha Rao')).toHaveTextContent('AR');
  });
});
