import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ReactElement, useState } from 'react';

import { Autocomplete, CurrencySelector, DateRange, DateRangePicker, FileUpload, MultiSelect, NumberInput, PasswordField, PickedFile, SearchField, TextArea,
  Toggle, fileSize } from '../src';
import { accessibilityProblems } from './a11y';

function Controlled<T>({ initial, children }: { initial: T; children: (value: T, set: (v: T) => void) => ReactElement }) {
  const [value, setValue] = useState<T>(initial);
  return children(value, setValue);
}

describe('TextArea', () => {
  it('writes back several lines and counts towards the limit', async () => {
    let seen = '';
    await render(<Controlled initial="">{(v, set) => <TextArea testID="r" label="Remarks" value={v} maxLength={100} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    await fireEvent.changeText(screen.getByLabelText('Remarks'), 'Rent\nNovember');
    expect(seen).toBe('Rent\nNovember');
    expect(screen.getByText('13/100')).toBeTruthy();
    expect(screen.getByLabelText('Remarks').props.multiline).toBe(true);
    expect(accessibilityProblems()).toEqual([]);
  });
});

describe('PasswordField', () => {
  it('is masked without suggestions, tells the password manager what it is, and shows and hides on request', async () => {
    await render(<PasswordField testID="p" label="Password" value="s3cret" autoComplete="new-password" />);
    const input = screen.getByLabelText('Password');
    expect(input.props.secureTextEntry).toBe(true);
    expect([input.props.autoComplete, input.props.textContentType, input.props.autoCorrect]).toEqual(['new-password', 'newPassword', false]);
    await fireEvent.press(screen.getByRole('button', { name: 'Show Password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    expect(screen.getByRole('button', { name: 'Hide Password' })).toBeTruthy();
    expect(accessibilityProblems()).toEqual([]);
  });
});

describe('NumberInput', () => {
  it('steps within min and max and says when the text is out of range', async () => {
    let seen: number | null = null;
    await render(<Controlled<number | null> initial={2}>{(v, set) => <NumberInput testID="n" label="Copies" value={v} min={1} max={3} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    await fireEvent.press(screen.getByRole('button', { name: 'Increase Copies' }));
    expect(seen).toBe(3);
    expect(screen.getByRole('button', { name: 'Increase Copies' }).props.accessibilityState.disabled).toBe(true);
    const input = screen.getByLabelText('Copies');
    expect(input.props.keyboardType).toBe('number-pad');
    await fireEvent.changeText(input, '9');
    await fireEvent(input, 'blur');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter 3 or less.');
    await fireEvent.changeText(input, 'x');
    await fireEvent(input, 'blur');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number.');
    expect(accessibilityProblems()).toEqual([]);
  });
});

describe('CurrencySelector', () => {
  it('opens a sheet of currencies and shows the chosen code with its name', async () => {
    let seen = '';
    await render(<Controlled initial="">{(v, set) => <CurrencySelector testID="c" label="Currency" value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    await fireEvent.press(screen.getByRole('button', { name: /, Currency$/ }));
    await fireEvent.press(screen.getByRole('radio', { name: 'EUR, Euro' }));
    expect(seen).toBe('EUR');
    expect(screen.getByRole('button', { name: 'EUR · Euro, Currency' })).toBeTruthy();
    expect(accessibilityProblems()).toEqual([]);
  });
});

describe('MultiSelect', () => {
  const options = [{ value: 'S', label: 'Savings' }, { value: 'C', label: 'Current' }, { value: 'D', label: 'Deposits' }];

  it('ticks several in the sheet, shows chips and removes them', async () => {
    let seen: string[] = [];
    await render(<Controlled<string[]> initial={[]}>{(v, set) => <MultiSelect testID="m" label="Accounts" options={options} value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    await fireEvent.press(screen.getByRole('button', { name: /, Accounts$/ }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Savings' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Deposits' }));
    expect(seen).toEqual(['S', 'D']);
    expect(screen.getByRole('checkbox', { name: 'Savings' }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove Savings' }));
    expect(seen).toEqual(['D']);
    expect(accessibilityProblems()).toEqual([]);
  });
});

describe('Toggle', () => {
  it('is a switch named by its label, and does not change when read only', async () => {
    let seen = false;
    await render(<Controlled initial={false}>{(v, set) => <Toggle testID="t" label="Paperless statements" value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    await fireEvent.press(screen.getByRole('switch', { name: 'Paperless statements' }));
    expect(seen).toBe(true);
    await render(<Toggle testID="r" label="Alerts" value readOnly />);
    const locked = screen.getByRole('switch', { name: 'Alerts' });
    expect(locked.props.accessibilityState?.disabled).toBe(true);
    expect(accessibilityProblems()).toEqual([]);
  });
});

describe('DateRangePicker', () => {
  it('writes both days and says when the end is before the start or the range is too long', async () => {
    let seen: DateRange = { from: '', to: '' };
    await render(<Controlled<DateRange> initial={{ from: '', to: '' }}>{(v, set) => <DateRangePicker testID="d" label="Statement period" value={v} maxDays={31}
                                                                                                    onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    const enter = async (name: string, text: string) => {
      const input = screen.getByLabelText(name);
      await fireEvent.changeText(input, text);
      await fireEvent(input, 'blur');
    };
    await enter('From', '10/10/2026');
    await enter('To', '01/10/2026');
    expect(screen.getByRole('alert')).toHaveTextContent('The end date is before the start date.');
    await enter('To', '01/12/2026');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at most 31 days.');
    await enter('To', '31/10/2026');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(seen).toEqual({ from: '2026-10-10', to: '2026-10-31' });
  });
});

describe('SearchField', () => {
  it('searches from the keyboard Search key and clears with the button', async () => {
    let searched = '';
    let seen = 'rent';
    await render(<SearchField testID="s" label="Search transactions" value="rent" onSearch={(x) => { searched = x; }} onChange={(x) => { seen = x; }} />);
    const input = screen.getByLabelText('Search transactions');
    expect(input.props.returnKeyType).toBe('search');
    await fireEvent(input, 'submitEditing');
    expect(searched).toBe('rent');
    await fireEvent.press(screen.getByRole('button', { name: 'Clear Search transactions' }));
    expect(seen).toBe('');
    expect(accessibilityProblems()).toEqual([]);
  });
});

describe('Autocomplete', () => {
  const payees = [{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }, { value: 'P3', label: 'Asha Patel' }];

  it('suggests as the customer types and picks with a tap', async () => {
    let seen = '';
    await render(<Controlled initial="">{(v, set) => <Autocomplete testID="a" label="Payee" options={payees} value={v} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    const input = screen.getByLabelText('Payee');
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, 'asha');
    expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual(['Asha Sharma', 'Asha Patel']);
    await fireEvent.press(screen.getByRole('button', { name: 'Asha Patel' }));
    expect(seen).toBe('P3');
    expect(screen.getByLabelText('Payee').props.value).toBe('Asha Patel');
    expect(accessibilityProblems()).toEqual([]);
  });

  it('asks for one of the suggestions unless free text is allowed', async () => {
    let seen = '';
    await render(<Autocomplete testID="a" label="Payee" options={payees} value="" onChange={(x) => { seen = x; }} />);
    const input = screen.getByLabelText('Payee');
    await fireEvent.changeText(input, 'Nobody');
    await fireEvent(input, 'blur');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose one of the suggestions.');
    await render(<Autocomplete testID="b" label="New payee" options={payees} value="" freeText onChange={(x) => { seen = x; }} />);
    const free = screen.getByLabelText('New payee');
    await fireEvent.changeText(free, 'Nobody');
    await fireEvent(free, 'blur');
    expect(seen).toBe('Nobody');
  });
});

describe('FileUpload', () => {
  const pdf: PickedFile = { name: 'statement.pdf', size: 4, type: 'application/pdf', uri: 'file:///statement.pdf' };
  const exe: PickedFile = { name: 'setup.exe', size: 2, type: 'application/octet-stream' };

  it('takes a file from the app\'s picker, lists it with its size and removes it', async () => {
    let seen: PickedFile[] = [];
    await render(<Controlled<PickedFile[]> initial={[]}>{(v, set) => <FileUpload testID="f" label="Proof of address" value={v} accept=".pdf,image/*" maxSize={1048576}
                                                                                pick={async () => [pdf]} onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    await act(async () => { await fireEvent.press(screen.getByRole('button', { name: /^Choose a file.*Proof of address$/ })); });
    expect(seen.map((f) => f.name)).toEqual(['statement.pdf']);
    expect(screen.getByText('4 B')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove statement.pdf' }));
    expect(seen).toEqual([]);
    expect(accessibilityProblems()).toEqual([]);
  });

  it('refuses a type it does not accept, and says why', async () => {
    await render(<FileUpload testID="f" label="Proof of address" value={[]} accept=".pdf,image/*" pick={async () => [exe]} />);
    await act(async () => { await fireEvent.press(screen.getByRole('button', { name: /^Choose a file.*Proof of address$/ })); });
    expect(screen.getByRole('alert')).toHaveTextContent(/setup.exe is not a file type this accepts/);
    expect(fileSize(2621440)).toBe('2.5 MB');
  });
});
