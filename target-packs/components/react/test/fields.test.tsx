import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactElement, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { AmountInput, CheckboxGroup, DatePicker, Dropdown, RadioGroup, TextField, decimalsOf, formatAmount } from '../src';
import { violations } from './a11y';

afterEach(cleanup);

function Controlled<T>({ initial, children }: { initial: T; children: (value: T, set: (v: T) => void) => ReactElement }) {
  const [value, setValue] = useState<T>(initial);
  return children(value, setValue);
}

describe('TextField', () => {
  it('writes back what is typed, ties the label to the input and counts towards the limit', async () => {
    let seen = '';
    render(<Controlled initial="">{(v, set) => <TextField testID="name" label="Beneficiary name" value={v} maxLength={20} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    const input = screen.getByLabelText('Beneficiary name');
    await userEvent.type(input, 'A. Sharma');
    expect(seen).toBe('A. Sharma');
    expect(screen.getByText('9/20')).toBeTruthy();
    expect(await violations()).toEqual([]);
  });

  it('says a required field is empty only after the customer leaves it, and announces it', () => {
    render(<TextField testID="name" label="Beneficiary name" value="" required />);
    const input = screen.getByLabelText(/Beneficiary name/);
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toContain('Beneficiary name is required.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
  });

  it('shows the screen\'s error first, and the help text otherwise', () => {
    const { rerender } = render(<TextField testID="n" label="Nickname" value="x" helpText="Up to 20 letters" />);
    const input = screen.getByLabelText('Nickname');
    expect(document.getElementById(input.getAttribute('aria-describedby')!)!.textContent).toBe('Up to 20 letters');
    rerender(<TextField testID="n" label="Nickname" value="x" helpText="Up to 20 letters" error="This nickname is taken." />);
    expect(screen.getByRole('alert').textContent).toContain('This nickname is taken.');
  });

  it('clears with the clear button', async () => {
    let seen = 'abc';
    render(<TextField testID="n" label="Reference" value="abc" clearable onChange={(x) => { seen = x; }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear Reference' }));
    expect(seen).toBe('');
  });
});

describe('AmountInput', () => {
  it('uses the currency decimals', () => {
    expect(decimalsOf('INR')).toBe(2);
    expect(decimalsOf('JPY')).toBe(0);
    expect(decimalsOf('KWD')).toBe(3);
    expect(formatAmount(1250.5, 'INR', 'en-US')).toBe('1,250.50');
    expect(formatAmount(1250.5, 'JPY', 'en-US')).toBe('1,251');
  });

  it('gives a number when the customer leaves the field, rounded to the currency', async () => {
    let seen: number | null = null;
    render(<Controlled initial={null as number | null}>{(v, set) => <AmountInput testID="amt" label="Amount" currency="INR" locale="en-US" value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    const input = screen.getByLabelText('Amount in INR');
    await userEvent.type(input, '1250.456');
    fireEvent.blur(input);
    expect(seen).toBe(1250.46);
    expect((input as HTMLInputElement).value).toBe('1,250.46');
    expect(await violations()).toEqual([]);
  });

  it('refuses text that is not an amount and checks the limits', async () => {
    render(<Controlled initial={null as number | null}>{(v, set) => <AmountInput testID="amt" label="Amount" currency="INR" locale="en-US" min={1} max={50000} value={v} onChange={set} />}</Controlled>);
    const input = screen.getByLabelText('Amount in INR');
    await userEvent.type(input, 'abc');
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toContain('Enter an amount');
    await userEvent.clear(input);
    await userEvent.type(input, '60000');
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toContain('Enter at most 50,000.00.');
  });
});

describe('Dropdown', () => {
  it('chooses an option and clearing it gives no value (not the first option)', async () => {
    let seen = 'x';
    render(<Controlled initial="">{(v, set) => <Dropdown testID="acc" label="From account" options={[{ value: 'S', label: 'Savings •••• 4521' }, 'Current']} value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    const select = screen.getByLabelText('From account');
    await userEvent.selectOptions(select, 'S');
    expect(seen).toBe('S');
    await userEvent.selectOptions(select, '');
    expect(seen).toBe('');
    expect(await violations()).toEqual([]);
  });
});

describe('CheckboxGroup and RadioGroup', () => {
  it('adds and removes values, as a group with a legend', async () => {
    let seen: string[] = [];
    render(<Controlled initial={['E']}>{(v, set) => <CheckboxGroup testID="ch" label="Send alerts by" options={[{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }]} value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    expect(screen.getByRole('group', { name: /Send alerts by/ })).toBeTruthy();
    await userEvent.click(screen.getByLabelText('SMS'));
    expect(seen).toEqual(['E', 'M']);
    await userEvent.click(screen.getByLabelText('Email'));
    expect(seen).toEqual(['M']);
    expect(await violations()).toEqual([]);
  });

  it('picks one and keeps disabled choices out of reach', async () => {
    let seen = '';
    render(<Controlled initial="N">{(v, set) => <RadioGroup testID="sp" label="Speed" options={[{ value: 'N', label: 'NEFT' }, { value: 'R', label: 'RTGS', disabled: true }, { value: 'I', label: 'IMPS' }]} value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    expect((screen.getByLabelText('RTGS') as HTMLInputElement).disabled).toBe(true);
    await userEvent.click(screen.getByLabelText('IMPS'));
    expect(seen).toBe('I');
    expect(screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked).length).toBe(1);
    expect(await violations()).toEqual([]);
  });
});

describe('DatePicker', () => {
  it('writes an ISO date back and refuses blocked days and dates out of range', () => {
    let seen = '';
    render(<Controlled initial="">{(v, set) => <DatePicker testID="d" label="Pay on" min="2026-11-10" max="2026-12-31" disabledDays={['2026-11-14']} locale="en-GB" value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    const input = screen.getByLabelText('Pay on');
    fireEvent.change(input, { target: { value: '2026-11-12' } });
    expect(seen).toBe('2026-11-12');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.change(input, { target: { value: '2026-11-14' } });
    expect(screen.getByRole('alert').textContent).toContain('That day is not available');
    fireEvent.change(input, { target: { value: '2026-11-01' } });
    expect(screen.getByRole('alert').textContent).toContain('or later');
  });

  it('has no accessibility problems', async () => {
    render(<DatePicker testID="d" label="Pay on" value="2026-11-12" />);
    expect(await violations()).toEqual([]);
  });
});
