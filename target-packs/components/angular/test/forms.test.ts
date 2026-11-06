import { Component, Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { fireEvent, getAllByRole, getByLabelText, getByRole, getByTestId, getByText, queryByRole } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { Autocomplete, CurrencySelector, DateRange, DateRangePicker, FileUpload, MultiSelect, NumberInput, PasswordField, SearchField, TextArea, Toggle,
  fileSize } from '../src';
import { violations } from './a11y';

async function mount<T>(host: Type<T>) {
  const fixture = TestBed.createComponent(host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  document.body.appendChild(fixture.nativeElement);
  const settle = () => fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance, settle };
}

afterEach(() => { document.body.innerHTML = ''; TestBed.resetTestingModule(); });

describe('TextArea', () => {
  @Component({ imports: [TextArea], template: '<bx-text-area testID="r" label="Remarks" [(value)]="text" [maxLength]="100" />' })
  class Host { text = signal(''); }

  it('writes back several lines and counts towards the limit', async () => {
    const { el, host, settle } = await mount(Host);
    await userEvent.type(getByLabelText(el, 'Remarks'), 'Rent{enter}November');
    await settle();
    expect(host.text()).toBe('Rent\nNovember');
    expect(el.textContent).toContain('13/100');
    expect(await violations(el)).toEqual([]);
  });
});

describe('PasswordField', () => {
  @Component({ imports: [PasswordField], template: '<bx-password label="Password" value="s3cret" autoComplete="new-password" />' })
  class Host {}

  it('is masked, says how a password manager should fill it, and shows and hides on request', async () => {
    const { el, settle } = await mount(Host);
    const input = getByLabelText(el, 'Password') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('new-password');
    await userEvent.click(getByRole(el, 'button', { name: 'Show Password' }));
    await settle();
    expect(input.type).toBe('text');
    expect(getByRole(el, 'button', { name: 'Hide Password' }).getAttribute('aria-pressed')).toBe('true');
    expect(await violations(el)).toEqual([]);
  });
});

describe('NumberInput', () => {
  @Component({ imports: [NumberInput], template: '<bx-number-input label="Copies" [(value)]="copies" [min]="1" [max]="3" />' })
  class Host { copies = signal<number | null>(2); }

  it('keeps a number, steps with the buttons and the arrow keys, and stays within min and max', async () => {
    const { el, host, settle } = await mount(Host);
    await userEvent.click(getByRole(el, 'button', { name: 'Increase Copies' }));
    await settle();
    expect(host.copies()).toBe(3);
    expect((getByRole(el, 'button', { name: 'Increase Copies' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(getByLabelText(el, 'Copies'), { key: 'ArrowDown' });
    await settle();
    expect(host.copies()).toBe(2);
    expect(await violations(el)).toEqual([]);
  });

  it('says when the text is not a number or is out of range', async () => {
    const { el, settle } = await mount(Host);
    const input = getByLabelText(el, 'Copies');
    await userEvent.clear(input);
    await userEvent.type(input, 'abc');
    fireEvent.blur(input);
    await settle();
    expect(getByRole(el, 'alert').textContent).toContain('Enter a whole number.');
    await userEvent.clear(input);
    await userEvent.type(input, '9');
    fireEvent.blur(input);
    await settle();
    expect(getByRole(el, 'alert').textContent).toContain('Enter 3 or less.');
  });
});

describe('CurrencySelector', () => {
  @Component({ imports: [CurrencySelector, ReactiveFormsModule], template: '<bx-currency-picker label="Currency" [formControl]="currency" />' })
  class Host { currency = new FormControl(''); }

  it('chooses a currency by code, shows its name, and works with a form control', async () => {
    const { el, host, settle } = await mount(Host);
    await userEvent.selectOptions(getByLabelText(el, 'Currency'), 'EUR');
    await settle();
    expect(host.currency.value).toBe('EUR');
    expect(getByText(el, 'Euro')).toBeTruthy();
    expect(await violations(el)).toEqual([]);
  });
});

describe('MultiSelect', () => {
  @Component({ imports: [MultiSelect], template: '<bx-multi-select label="Accounts" [options]="options" [(value)]="picked" />' })
  class Host {
    options = [{ value: 'S', label: 'Savings' }, { value: 'C', label: 'Current' }, { value: 'D', label: 'Deposits' }];
    picked = signal<string[]>([]);
  }

  it('picks with the keyboard, shows chips and removes them', async () => {
    const { el, host, settle } = await mount(Host);
    const input = getByRole(el, 'combobox', { name: 'Accounts' });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await settle();
    fireEvent.keyDown(input, { key: 'Enter' });
    await settle();
    expect(host.picked()).toEqual(['S']);
    await userEvent.type(input, 'dep');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await settle();
    fireEvent.keyDown(input, { key: 'Enter' });
    await settle();
    expect(host.picked()).toEqual(['S', 'D']);
    await userEvent.click(getByRole(el, 'button', { name: 'Remove Savings' }));
    await settle();
    expect(host.picked()).toEqual(['D']);
    expect(await violations(el)).toEqual([]);
  });
});

describe('Toggle', () => {
  @Component({ imports: [Toggle], template: '<bx-switch label="Paperless statements" [(value)]="on" /><bx-switch label="Alerts" [value]="true" [readOnly]="true" />' })
  class Host { on = signal(false); }

  it('is a switch that says on or off, flips on click, and does not change when read only', async () => {
    const { el, host, settle } = await mount(Host);
    const sw = getByRole(el, 'switch', { name: 'Paperless statements' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    await userEvent.click(sw);
    await settle();
    expect(host.on()).toBe(true);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    const locked = getByRole(el, 'switch', { name: 'Alerts' });
    await userEvent.click(locked);
    await settle();
    expect(locked.getAttribute('aria-checked')).toBe('true');
    expect(await violations(el)).toEqual([]);
  });
});

describe('DateRangePicker', () => {
  @Component({ imports: [DateRangePicker], template: '<bx-date-range label="Statement period" [(value)]="period" [maxDays]="31" />' })
  class Host { period = signal<DateRange>({ from: '', to: '' }); }

  it('writes both days and says when the end is before the start or the range is too long', async () => {
    const { el, host, settle } = await mount(Host);
    fireEvent.change(getByLabelText(el, 'From'), { target: { value: '2026-10-10' } });
    fireEvent.change(getByLabelText(el, 'To'), { target: { value: '2026-10-01' } });
    await settle();
    expect(getByRole(el, 'alert').textContent).toContain('The end date is before the start date.');
    fireEvent.change(getByLabelText(el, 'To'), { target: { value: '2026-12-01' } });
    await settle();
    expect(getByRole(el, 'alert').textContent).toContain('Choose at most 31 days.');
    fireEvent.change(getByLabelText(el, 'To'), { target: { value: '2026-10-31' } });
    await settle();
    expect(queryByRole(el, 'alert')).toBeNull();
    expect(host.period()).toEqual({ from: '2026-10-10', to: '2026-10-31' });
  });
});

describe('SearchField', () => {
  @Component({ imports: [SearchField], template: '<bx-search label="Search transactions" [(value)]="text" (search)="searched = $event" />' })
  class Host { text = signal('rent'); searched = ''; }

  it('sits in a search landmark, searches on Enter and clears on Escape', async () => {
    const { el, host, settle } = await mount(Host);
    expect(getByRole(el, 'search')).toBeTruthy();
    const input = getByRole(el, 'searchbox', { name: 'Search transactions' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(host.searched).toBe('rent');
    fireEvent.keyDown(input, { key: 'Escape' });
    await settle();
    expect(host.text()).toBe('');
    expect(await violations(el)).toEqual([]);
  });
});

describe('Autocomplete', () => {
  @Component({ imports: [Autocomplete], template: '<bx-autocomplete label="Payee" [options]="payees" [(value)]="payee" />' })
  class Host {
    payees = [{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }, { value: 'P3', label: 'Asha Patel' }];
    payee = signal('');
  }

  it('suggests as the customer types; arrows and Enter pick', async () => {
    const { el, host, settle } = await mount(Host);
    const input = getByRole(el, 'combobox', { name: 'Payee' }) as HTMLInputElement;
    await userEvent.type(input, 'asha');
    await settle();
    expect(getAllByRole(el, 'option').map((o) => o.textContent?.trim())).toEqual(['Asha Sharma', 'Asha Patel']);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await settle();
    expect(input.getAttribute('aria-activedescendant')).toBe(getAllByRole(el, 'option')[1].id);
    fireEvent.keyDown(input, { key: 'Enter' });
    await settle();
    expect(host.payee()).toBe('P3');
    expect(input.value).toBe('Asha Patel');
    expect(await violations(el)).toEqual([]);
  });

  it('asks for one of the suggestions unless free text is allowed', async () => {
    const { el, settle } = await mount(Host);
    const input = getByRole(el, 'combobox', { name: 'Payee' });
    await userEvent.type(input, 'Nobody');
    fireEvent.blur(input);
    await settle();
    expect(getByRole(el, 'alert').textContent).toContain('Choose one of the suggestions.');
  });
});

describe('FileUpload', () => {
  @Component({ imports: [FileUpload], template: '<bx-document-upload testID="f" label="Proof of address" [(value)]="files" accept=".pdf,image/*" [maxSize]="1048576" />' })
  class Host { files = signal<File[]>([]); }
  const pdf = new File(['%PDF'], 'statement.pdf', { type: 'application/pdf' });
  const exe = new File(['MZ'], 'setup.exe', { type: 'application/octet-stream' });

  it('adds a file of an allowed type, lists it with its size and removes it', async () => {
    const { el, host, settle } = await mount(Host);
    await userEvent.upload(getByTestId(el, 'f-input') as HTMLInputElement, pdf);
    await settle();
    expect(host.files().map((f) => f.name)).toEqual(['statement.pdf']);
    expect(getByText(el, '4 B')).toBeTruthy();
    await userEvent.click(getByRole(el, 'button', { name: 'Remove statement.pdf' }));
    await settle();
    expect(host.files()).toEqual([]);
    expect(await violations(el)).toEqual([]);
  });

  it('refuses a type it does not accept, and says why', async () => {
    const { el, settle } = await mount(Host);
    fireEvent.change(getByTestId(el, 'f-input'), { target: { files: [exe] } });
    await settle();
    expect(getByRole(el, 'alert').textContent).toContain('setup.exe is not a file type this accepts');
    expect(fileSize(2621440)).toBe('2.5 MB');
  });
});
