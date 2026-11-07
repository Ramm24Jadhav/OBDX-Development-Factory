import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReactElement, useState } from 'react';

import { AmountInput, CheckboxGroup, DatePicker, Dropdown, RadioGroup, TextField, decimalsOf, formatAmount, parseDate } from '../src';
import { accessibilityProblems } from './a11y';

function Controlled<T>({ initial, children }: { initial: T; children: (value: T, set: (v: T) => void) => ReactElement }) {
  const [value, setValue] = useState<T>(initial);
  return children(value, setValue);
}

describe('TextField', () => {
  it('writes back what is typed and counts towards the limit', async () => {
    let seen = '';
    await render(<Controlled initial="">{(v, set) => <TextField testID="name" label="Beneficiary name" value={v} maxLength={20} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    await fireEvent.changeText(screen.getByLabelText('Beneficiary name'), 'A. Sharma');
    expect(seen).toBe('A. Sharma');
    expect(screen.getByText('9/20')).toBeTruthy();
    expect(accessibilityProblems()).toEqual([]);
  });

  it('says a required field is empty after the customer leaves it, as an alert', async () => {
    await render(<TextField testID="name" label="Beneficiary name" value="" required />);
    expect(screen.queryByRole('alert')).toBeNull();
    const input = screen.getByLabelText('Beneficiary name');
    await fireEvent(input, 'focus');
    await fireEvent(input, 'blur');
    expect(screen.getByRole('alert')).toHaveTextContent('Beneficiary name is required.');
  });

  it('shows the screen\'s error first and clears with the clear button', async () => {
    let seen = 'abc';
    await render(<TextField testID="ref" label="Reference" value="abc" clearable error="Use letters and numbers only." onChange={(x) => { seen = x; }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Use letters and numbers only.');
    await fireEvent.press(screen.getByRole('button', { name: 'Clear Reference' }));
    expect(seen).toBe('');
  });
});

describe('AmountInput', () => {
  it('formats with the currency decimals without the platform locale', async () => {
    expect(decimalsOf('KWD')).toBe(3);
    expect(formatAmount(1250.5, 'INR')).toBe('1,250.50');
    expect(formatAmount(1234567, 'JPY')).toBe('1,234,567');
    expect(formatAmount(-3499, 'INR')).toBe('-3,499.00');
  });

  it('gives a rounded number when the customer leaves, and checks the limits', async () => {
    let seen: number | null = null;
    await render(<Controlled initial={null as number | null}>{(v, set) => <AmountInput testID="amt" label="Amount" currency="INR" max={50000} value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    const input = screen.getByLabelText('Amount in INR');
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '1250.456');
    await fireEvent(input, 'blur');
    expect(seen).toBe(1250.46);
    expect(input.props.value).toBe('1,250.46');
    await fireEvent.changeText(input, '60000');
    await fireEvent(input, 'blur');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter at most 50,000.00.');
    await fireEvent.changeText(input, 'abc');
    await fireEvent(input, 'blur');
    expect(screen.getByRole('alert')).toHaveTextContent(/Enter an amount/);
    expect(input.props.keyboardType).toBe('decimal-pad');
  });
});

describe('Dropdown', () => {
  it('opens a sheet, marks the chosen option and writes it back', async () => {
    let seen = '';
    await render(<Controlled initial="">{(v, set) => <Dropdown testID="acc" label="From account" options={[{ value: 'S', label: 'Savings •••• 4521' }, { value: 'C', label: 'Current •••• 0187' }]} value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    await fireEvent.press(screen.getByRole('button', { name: /, From account$/ }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Current •••• 0187' }));
    expect(seen).toBe('C');
    expect(screen.getByRole('button', { name: 'Current •••• 0187, From account' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /From account/ }));
    expect(screen.getByRole('radio', { name: 'Current •••• 0187' })).toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear the choice' }));
    expect(seen).toBe('');
    expect(accessibilityProblems()).toEqual([]);
  });
});

describe('CheckboxGroup and RadioGroup', () => {
  it('adds and removes values', async () => {
    let seen: string[] = [];
    await render(<Controlled initial={['E']}>{(v, set) => <CheckboxGroup testID="ch" label="Send alerts by" options={[{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }]} value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    expect(screen.getByRole('checkbox', { name: 'Email' })).toBeChecked();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'SMS' }));
    expect(seen).toEqual(['E', 'M']);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Email' }));
    expect(seen).toEqual(['M']);
    expect(accessibilityProblems()).toEqual([]);
  });

  it('picks one and keeps disabled choices out of reach', async () => {
    let seen = 'N';
    await render(<Controlled initial="N">{(v, set) => <RadioGroup testID="sp" label="Speed" options={[{ value: 'N', label: 'NEFT' }, { value: 'R', label: 'RTGS', disabled: true }, { value: 'I', label: 'IMPS' }]} value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    expect(screen.getByRole('radio', { name: 'RTGS' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: 'RTGS' }));
    expect(seen).toBe('N');
    await fireEvent.press(screen.getByRole('radio', { name: 'IMPS' }));
    expect(seen).toBe('I');
    expect(screen.getAllByRole('radio').filter((r) => r.props.accessibilityState?.checked).length).toBe(1);
    expect(accessibilityProblems()).toEqual([]);
  });
});

describe('DatePicker', () => {
  it('reads dd/mm/yyyy, refuses dates that do not exist', async () => {
    expect(parseDate('12/11/2026')).toBe('2026-11-12');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('2026-11-12')).toBeNull();
  });

  it('writes an ISO date back and refuses blocked days and dates out of range', async () => {
    let seen = '';
    await render(<Controlled initial="">{(v, set) => <DatePicker testID="d" label="Pay on" min="2026-11-10" max="2026-12-31" disabledDays={['2026-11-14']} value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    const input = screen.getByLabelText('Pay on');
    await fireEvent.changeText(input, '12/11/2026');
    await fireEvent(input, 'blur');
    expect(seen).toBe('2026-11-12');
    expect(screen.getByText('12 Nov 2026')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    await fireEvent.changeText(input, '14/11/2026');
    await fireEvent(input, 'blur');
    expect(screen.getByRole('alert')).toHaveTextContent(/That day is not available/);
    await fireEvent.changeText(input, '01/11/2026');
    await fireEvent(input, 'blur');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose 10 Nov 2026 or later.');
  });
});
