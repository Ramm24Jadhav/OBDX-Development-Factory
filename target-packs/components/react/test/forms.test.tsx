import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactElement, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Autocomplete, CurrencySelector, DateRange, DateRangePicker, FileUpload, MultiSelect, NumberInput, PasswordField, SearchField, TextArea, Toggle,
  fileSize } from '../src';
import { violations } from './a11y';

afterEach(cleanup);

function Controlled<T>({ initial, children }: { initial: T; children: (value: T, set: (v: T) => void) => ReactElement }) {
  const [value, setValue] = useState<T>(initial);
  return children(value, setValue);
}

describe('TextArea', () => {
  it('writes back several lines and counts towards the limit', async () => {
    let seen = '';
    render(<Controlled initial="">{(v, set) => <TextArea testID="r" label="Remarks" value={v} maxLength={100} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    await userEvent.type(screen.getByLabelText('Remarks'), 'Rent{enter}November');
    expect(seen).toBe('Rent\nNovember');
    expect(screen.getByText('13/100')).toBeTruthy();
    expect(await violations()).toEqual([]);
  });
});

describe('PasswordField', () => {
  it('is masked, says how a password manager should fill it, and shows and hides on request', async () => {
    render(<PasswordField testID="p" label="Password" value="s3cret" autoComplete="new-password" />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('new-password');
    await userEvent.click(screen.getByRole('button', { name: 'Show Password' }));
    expect(input.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Hide Password' }).getAttribute('aria-pressed')).toBe('true');
    expect(await violations()).toEqual([]);
  });
});

describe('NumberInput', () => {
  it('keeps a number, steps with the buttons and the arrow keys, and stays within min and max', async () => {
    let seen: number | null = null;
    render(<Controlled<number | null> initial={2}>{(v, set) => <NumberInput testID="n" label="Copies" value={v} min={1} max={3} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    await userEvent.click(screen.getByRole('button', { name: 'Increase Copies' }));
    expect(seen).toBe(3);
    expect((screen.getByRole('button', { name: 'Increase Copies' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByLabelText('Copies'), { key: 'ArrowDown' });
    expect(seen).toBe(2);
    expect(await violations()).toEqual([]);
  });

  it('says when the text is not a number or is out of range', async () => {
    render(<Controlled<number | null> initial={null}>{(v, set) => <NumberInput testID="n" label="Copies" value={v} max={5} onChange={set} />}</Controlled>);
    const input = screen.getByLabelText('Copies');
    await userEvent.type(input, 'abc');
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toContain('Enter a whole number.');
    await userEvent.clear(input);
    await userEvent.type(input, '9');
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toContain('Enter 5 or less.');
  });
});

describe('CurrencySelector', () => {
  it('chooses a currency by code and shows its name', async () => {
    let seen = '';
    render(<Controlled initial="">{(v, set) => <CurrencySelector testID="c" label="Currency" value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    await userEvent.selectOptions(screen.getByLabelText('Currency'), 'EUR');
    expect(seen).toBe('EUR');
    expect(screen.getByText('Euro')).toBeTruthy();
    expect(await violations()).toEqual([]);
  });
});

describe('MultiSelect', () => {
  const options = [{ value: 'S', label: 'Savings' }, { value: 'C', label: 'Current' }, { value: 'D', label: 'Deposits' }];

  it('picks with the keyboard, shows chips and removes them', async () => {
    let seen: string[] = [];
    render(<Controlled<string[]> initial={[]}>{(v, set) => <MultiSelect testID="m" label="Accounts" options={options} value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    const input = screen.getByRole('combobox', { name: 'Accounts' });
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(seen).toEqual(['S']);
    await userEvent.type(input, 'dep');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(seen).toEqual(['S', 'D']);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Savings' }));
    expect(seen).toEqual(['D']);
    expect(await violations()).toEqual([]);
  });
});

describe('Toggle', () => {
  it('is a switch that says on or off and flips on click', async () => {
    let seen = false;
    render(<Controlled initial={false}>{(v, set) => <Toggle testID="t" label="Paperless statements" value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    const sw = screen.getByRole('switch', { name: 'Paperless statements' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    await userEvent.click(sw);
    expect(seen).toBe(true);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(await violations()).toEqual([]);
  });

  it('does not change when read only', async () => {
    let changed = false;
    render(<Toggle testID="t" label="Alerts" value onChange={() => { changed = true; }} readOnly />);
    await userEvent.click(screen.getByRole('switch'));
    expect(changed).toBe(false);
  });
});

describe('DateRangePicker', () => {
  it('writes both days and says when the end is before the start or the range is too long', () => {
    render(<Controlled<DateRange> initial={{ from: '', to: '' }}>{(v, set) => <DateRangePicker testID="d" label="Statement period" value={v} maxDays={31} onChange={set} />}</Controlled>);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-10' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-01' } });
    expect(screen.getByRole('alert').textContent).toContain('The end date is before the start date.');
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-12-01' } });
    expect(screen.getByRole('alert').textContent).toContain('Choose at most 31 days.');
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-31' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('SearchField', () => {
  it('sits in a search landmark, searches on Enter and clears on Escape', async () => {
    let searched = '';
    let seen = 'rent';
    render(<SearchField testID="s" label="Search transactions" value="rent" onSearch={(x) => { searched = x; }} onChange={(x) => { seen = x; }} />);
    expect(screen.getByRole('search')).toBeTruthy();
    const input = screen.getByRole('searchbox', { name: 'Search transactions' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(searched).toBe('rent');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(seen).toBe('');
    expect(await violations()).toEqual([]);
  });
});

describe('Autocomplete', () => {
  const payees = [{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }, { value: 'P3', label: 'Asha Patel' }];

  it('suggests as the customer types; arrows and Enter pick', async () => {
    let seen = '';
    render(<Controlled initial="">{(v, set) => <Autocomplete testID="a" label="Payee" options={payees} value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    const input = screen.getByRole('combobox', { name: 'Payee' });
    await userEvent.type(input, 'asha');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Asha Sharma', 'Asha Patel']);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1].id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(seen).toBe('P3');
    expect((input as HTMLInputElement).value).toBe('Asha Patel');
    expect(await violations()).toEqual([]);
  });

  it('asks for one of the suggestions unless free text is allowed', async () => {
    render(<Controlled initial="">{(v, set) => <Autocomplete testID="a" label="Payee" options={payees} value={v} onChange={set} />}</Controlled>);
    const input = screen.getByRole('combobox', { name: 'Payee' });
    await userEvent.type(input, 'Nobody');
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toContain('Choose one of the suggestions.');
  });
});

describe('FileUpload', () => {
  const pdf = new File(['%PDF'], 'statement.pdf', { type: 'application/pdf' });
  const exe = new File(['MZ'], 'setup.exe', { type: 'application/octet-stream' });

  it('adds a file of an allowed type, lists it with its size and removes it', async () => {
    let seen: File[] = [];
    render(<Controlled<File[]> initial={[]}>{(v, set) => <FileUpload testID="f" label="Proof of address" value={v} accept=".pdf,image/*" maxSize={1048576}
                                                                     onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    await userEvent.upload(screen.getByTestId('f-input'), pdf);
    expect(seen.map((f) => f.name)).toEqual(['statement.pdf']);
    expect(screen.getByText('4 B')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Remove statement.pdf' }));
    expect(seen).toEqual([]);
    expect(await violations()).toEqual([]);
  });

  it('refuses a type it does not accept, and says why', () => {
    render(<FileUpload testID="f" label="Proof of address" value={[]} accept=".pdf,image/*" />);
    fireEvent.change(screen.getByTestId('f-input'), { target: { files: [exe] } });
    expect(screen.getByRole('alert').textContent).toContain('setup.exe is not a file type this accepts');
    expect(fileSize(2621440)).toBe('2.5 MB');
  });
});
