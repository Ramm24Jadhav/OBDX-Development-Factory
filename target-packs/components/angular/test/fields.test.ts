import { Component, Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { fireEvent, getByLabelText, getByRole, queryByRole } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { AmountInput, CheckboxGroup, DatePicker, Dropdown, RadioGroup, TextField, decimalsOf, formatAmount } from '../src';
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

describe('TextField', () => {
  @Component({ imports: [TextField], template: '<bx-text-field testID="name" label="Beneficiary name" [(value)]="name" [maxLength]="20" [required]="true" clearable />' })
  class Host { name = signal(''); }

  it('writes back what is typed, ties the label to the input and counts towards the limit', async () => {
    const { el, host, settle } = await mount(Host);
    await userEvent.type(getByLabelText(el, /Beneficiary name/), 'A. Sharma');
    await settle();
    expect(host.name()).toBe('A. Sharma');
    expect(el.textContent).toContain('9/20');
    expect(await violations(el)).toEqual([]);
  });

  it('says a required field is empty only after the customer leaves it, and announces it', async () => {
    const { el, settle } = await mount(Host);
    const input = getByLabelText(el, /Beneficiary name/);
    expect(queryByRole(el, 'alert')).toBeNull();
    fireEvent.focus(input);
    fireEvent.blur(input);
    await settle();
    expect(getByRole(el, 'alert').textContent).toContain('Beneficiary name is required.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(getByRole(el, 'alert').id);
  });

  it('works with a reactive form control, disabled included', async () => {
    @Component({ imports: [TextField, ReactiveFormsModule], template: '<bx-text-field label="Reference" [formControl]="ref" />' })
    class FormHost { ref = new FormControl('INV-1'); }
    const { el, host, settle } = await mount(FormHost);
    const input = getByLabelText(el, 'Reference') as HTMLInputElement;
    expect(input.value).toBe('INV-1');
    await userEvent.type(input, '2');
    expect(host.ref.value).toBe('INV-12');
    host.ref.disable();
    await settle();
    expect(input.disabled).toBe(true);
  });
});

describe('AmountInput', () => {
  it('uses the currency decimals', () => {
    expect(decimalsOf('JPY')).toBe(0);
    expect(decimalsOf('KWD')).toBe(3);
    expect(formatAmount(1250.5, 'INR', 'en-US')).toBe('1,250.50');
  });

  @Component({ imports: [AmountInput], template: '<bx-amount testID="amt" label="Amount" currency="INR" locale="en-US" [max]="50000" [(value)]="amount" />' })
  class Host { amount = signal<number | null>(null); }

  it('gives a number rounded to the currency, and checks the limits and the format', async () => {
    const { el, host, settle } = await mount(Host);
    const input = getByLabelText(el, 'Amount in INR') as HTMLInputElement;
    await userEvent.type(input, '1250.456');
    fireEvent.blur(input);
    await settle();
    expect(host.amount()).toBe(1250.46);
    expect(input.value).toBe('1,250.46');
    await userEvent.clear(input);
    await userEvent.type(input, '60000');
    fireEvent.blur(input);
    await settle();
    expect(getByRole(el, 'alert').textContent).toContain('Enter at most 50,000.00.');
    await userEvent.clear(input);
    await userEvent.type(input, 'abc');
    fireEvent.blur(input);
    await settle();
    expect(getByRole(el, 'alert').textContent).toContain('Enter an amount');
    expect(await violations(el)).toEqual([]);
  });
});

describe('Dropdown', () => {
  @Component({ imports: [Dropdown], template: `<bx-select testID="acc" label="From account" [options]="options" [(value)]="account" />` })
  class Host { account = signal(''); options = [{ value: 'S', label: 'Savings •••• 4521' }, 'Current']; }

  it('chooses an option, and clearing it gives no value (not the first option)', async () => {
    const { el, host, settle } = await mount(Host);
    const select = getByLabelText(el, 'From account') as HTMLSelectElement;
    await userEvent.selectOptions(select, 'S');
    await settle();
    expect(host.account()).toBe('S');
    await userEvent.selectOptions(select, '');
    await settle();
    expect(host.account()).toBe('');
    expect(await violations(el)).toEqual([]);
  });
});

describe('CheckboxGroup and RadioGroup', () => {
  @Component({ imports: [CheckboxGroup, RadioGroup], template: `
    <bx-checkbox-group testID="ch" label="Send alerts by" [options]="channels" [(value)]="chosen" />
    <bx-choice-group testID="sp" label="Speed" [options]="speeds" [(value)]="speed" />` })
  class Host {
    chosen = signal<string[]>(['E']);
    speed = signal('N');
    channels = [{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }];
    speeds = [{ value: 'N', label: 'NEFT' }, { value: 'R', label: 'RTGS', disabled: true }, { value: 'I', label: 'IMPS' }];
  }

  it('adds and removes values, picks one, and keeps disabled choices out of reach', async () => {
    const { el, host, settle } = await mount(Host);
    expect(getByRole(el, 'group', { name: /Send alerts by/ })).toBeTruthy();
    await userEvent.click(getByLabelText(el, 'SMS'));
    await settle();
    expect(host.chosen()).toEqual(['E', 'M']);
    await userEvent.click(getByLabelText(el, 'Email'));
    await settle();
    expect(host.chosen()).toEqual(['M']);
    expect((getByLabelText(el, 'RTGS') as HTMLInputElement).disabled).toBe(true);
    await userEvent.click(getByLabelText(el, 'IMPS'));
    await settle();
    expect(host.speed()).toBe('I');
    expect(await violations(el)).toEqual([]);
  });
});

describe('DatePicker', () => {
  @Component({ imports: [DatePicker], template: `<bx-date testID="d" label="Pay on" min="2026-11-10" max="2026-12-31" locale="en-GB" [disabledDays]="['2026-11-14']" [(value)]="day" />` })
  class Host { day = signal(''); }

  it('writes an ISO date back and refuses blocked days and dates out of range', async () => {
    const { el, host, settle } = await mount(Host);
    const input = getByLabelText(el, 'Pay on');
    fireEvent.change(input, { target: { value: '2026-11-12' } });
    await settle();
    expect(host.day()).toBe('2026-11-12');
    expect(queryByRole(el, 'alert')).toBeNull();
    fireEvent.change(input, { target: { value: '2026-11-14' } });
    await settle();
    expect(getByRole(el, 'alert').textContent).toContain('That day is not available');
    fireEvent.change(input, { target: { value: '2026-11-01' } });
    await settle();
    expect(getByRole(el, 'alert').textContent).toContain('or later');
    expect(await violations(el)).toEqual([]);
  });
});
