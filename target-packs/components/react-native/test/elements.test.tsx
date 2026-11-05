import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { useState } from 'react';
import { AccessibilityInfo, Text } from 'react-native';

import { Button, Card, DataTable, Dialog, IconButton, Message, Tabs, ThemeProvider, Toast, makeTheme } from '../src';
import { lightTokens } from '../src/tokens';
import { accessibilityProblems } from './a11y';

describe('Button and IconButton', () => {
  it('fires onAction, and not when busy', async () => {
    const pressed = jest.fn();
    const { rerender } = await render(<Button label="Pay now" onAction={pressed} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Pay now' }));
    expect(pressed).toHaveBeenCalledTimes(1);
    await rerender(<Button label="Pay now" onAction={pressed} busy />);
    await fireEvent.press(screen.getByRole('button', { name: 'Pay now' }));
    expect(pressed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Pay now' })).toBeBusy();
  });

  it('names an icon button and gives it a full touch target', async () => {
    await render(<IconButton label="More actions" />);
    const b = screen.getByRole('button', { name: 'More actions' });
    expect(b).toHaveStyle({ width: 48, height: 48 });
    expect(accessibilityProblems()).toEqual([]);
  });
});

function DialogHarness({ cancelBehavior }: { cancelBehavior?: 'icon' | 'none' }) {
  const [open, setOpen] = useState(true);
  return (
    <Dialog testID="dlg" open={open} onOpenChange={setOpen} title="Delete A. Sharma?" description="You can add them again later." cancelBehavior={cancelBehavior}
            footer={<Button label="Delete" chroming="danger" onAction={() => setOpen(false)} />}>
      <Text>Payments scheduled to A. Sharma will stop.</Text>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('is modal for screen readers, named by its title, and closes from the close button', async () => {
    await render(<DialogHarness />);
    const dialog = screen.getByTestId('dlg');
    expect(dialog.props.accessibilityViewIsModal).toBe(true);
    expect(within(dialog).getByRole('header')).toHaveTextContent('Delete A. Sharma?');
    expect(accessibilityProblems()).toEqual([]);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('dlg')).toBeNull();
  });

  it('ignores the back button when cancelBehavior is none', async () => {
    await render(<DialogHarness cancelBehavior="none" />);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    // The back button on Android calls onRequestClose
    await fireEvent(screen.getByTestId('dlg-modal'), 'requestClose');
    expect(screen.getByTestId('dlg')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByTestId('dlg')).toBeNull();
  });
});

describe('Toast', () => {
  it('announces new messages, keeps errors and closes the others after five seconds', async () => {
    jest.useFakeTimers();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const closed: string[] = [];
    function Harness() {
      const [list, setList] = useState<Message[]>([
        { id: '1', severity: 'error', summary: 'Payment failed', detail: 'The account is blocked. Call the bank.' },
        { id: '2', severity: 'confirmation', summary: 'Beneficiary added' },
      ]);
      return <Toast messages={list} onClose={(m) => { closed.push(m.id); setList((l) => l.filter((x) => x.id !== m.id)); }} />;
    }
    await render(<Harness />);
    expect(announce).toHaveBeenCalledWith('Payment failed. The account is blocked. Call the bank.');
    expect(announce).toHaveBeenCalledWith('Beneficiary added');
    expect(screen.getByRole('alert')).toHaveTextContent(/Payment failed/);
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(closed).toEqual(['2']);
    await fireEvent.press(screen.getByRole('button', { name: 'Close the message' }));
    expect(closed).toEqual(['2', '1']);
    expect(announce).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
    announce.mockRestore();
  });
});

describe('Card', () => {
  it('is a button only when it has an action, named by its heading', async () => {
    const opened = jest.fn();
    const { rerender } = await render(<Card heading="Savings •••• 4521" subheading="Available 85,000.00"><Text>Body</Text></Card>);
    expect(screen.queryByRole('button')).toBeNull();
    await rerender(<Card heading="Savings •••• 4521" subheading="Available 85,000.00" onAction={opened}><Text>Body</Text></Card>);
    await fireEvent.press(screen.getByRole('button', { name: 'Savings •••• 4521, Available 85,000.00' }));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(accessibilityProblems()).toEqual([]);
  });
});

describe('Tabs', () => {
  it('selects a tab, says which is selected and shows its content', async () => {
    function Harness() {
      const [tab, setTab] = useState('c');
      return <Tabs testID="acc" label="Accounts" selection={tab} onSelectionChange={setTab} tabs={[
        { id: 'c', label: 'Current', content: <Text>Current accounts</Text> }, { id: 's', label: 'Savings', content: <Text>Savings accounts</Text> },
        { id: 'd', label: 'Deposits', disabled: true }]} />;
    }
    await render(<Harness />);
    expect(screen.getByRole('tab', { name: 'Current' })).toBeSelected();
    await fireEvent.press(screen.getByRole('tab', { name: 'Savings' }));
    expect(screen.getByRole('tab', { name: 'Savings' })).toBeSelected();
    expect(screen.getByTestId('acc-panel')).toHaveTextContent('Savings accounts');
    expect(screen.getByRole('tab', { name: 'Deposits' })).toBeDisabled();
    expect(accessibilityProblems()).toEqual([]);
  });
});

describe('DataTable', () => {
  const rows = [
    { id: 't1', date: '2026-11-12', text: 'Electricity bill', amount: -1240 },
    { id: 't2', date: '2026-11-11', text: 'Salary', amount: 85000 },
    { id: 't3', date: '2026-11-09', text: 'Card payment', amount: -3499 },
  ];
  const columns = [
    { field: 'date' as const, headerText: 'Date', sortable: true },
    { field: 'text' as const, headerText: 'Description' },
    { field: 'amount' as const, headerText: 'Amount', sortable: true, align: 'end' as const },
  ];

  it('sorts numbers as numbers and says how it is sorted', async () => {
    const sorted = jest.fn();
    await render(<DataTable testID="tx" caption="Recent transactions" rows={rows} columns={columns} keyField="id" onSort={sorted} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sort by Amount, not sorted' }));
    const order = () => screen.getAllByTestId(/^tx-row-/).map((r) => r.props.testID);
    expect(order()).toEqual(['tx-row-t3', 'tx-row-t1', 'tx-row-t2']);
    await fireEvent.press(screen.getByRole('button', { name: 'Sort by Amount, ascending' }));
    expect(order()).toEqual(['tx-row-t2', 'tx-row-t1', 'tx-row-t3']);
    expect(sorted).toHaveBeenLastCalledWith('amount', 'descending');
    expect(accessibilityProblems()).toEqual([]);
  });

  it('selects rows and shows the empty state', async () => {
    let seen: string[] = [];
    function Harness() {
      const [sel, setSel] = useState<string[]>([]);
      return <DataTable testID="tx" caption="Transactions" rows={rows} columns={columns} keyField="id" selectionMode="multiple" selected={sel}
                        onSelectedChange={(k) => { seen = k; setSel(k); }} />;
    }
    const { unmount } = await render(<Harness />);
    await fireEvent.press(screen.getByTestId('tx-row-t2'));
    await fireEvent.press(screen.getByTestId('tx-row-t3'));
    expect(seen).toEqual(['t2', 't3']);
    expect(screen.getByTestId('tx-row-t2')).toBeChecked();
    await unmount();
    await render(<DataTable caption="Transactions" rows={[]} columns={columns} keyField="id" />);
    expect(screen.getByText('No data to show.')).toBeTruthy();
  });
});

describe('Tokens and the component style', () => {
  it('reads the bank tokens (tokens.ts is generated from tokens.json and up to date)', async () => {
    const source = JSON.parse(readFileSync(resolve(__dirname, '../../tokens/tokens.json'), 'utf8'));
    expect(lightTokens.color.primary).toBe(source.color.primary.$value);
    expect(lightTokens.space.l).toBe(16);
  });

  it('applies the look, the dark mode and the bank brand', async () => {
    expect(makeTheme({ look: 'pill' }).radius.control).toBe(999);
    expect(makeTheme({ mode: 'dark' }).color.surface).not.toBe(makeTheme().color.surface);
    expect(makeTheme({}, '#123456').color.primary).toBe('#123456');
    await render(<ThemeProvider brand="#123456"><Button label="Pay now" /></ThemeProvider>);
    expect(screen.getByRole('button', { name: 'Pay now' })).toHaveStyle({ backgroundColor: '#123456' });
  });
});
