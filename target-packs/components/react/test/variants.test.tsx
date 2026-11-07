import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ReactElement, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import * as pack from '../src';
import { Button, CheckboxGroup, Dropdown, FilterChips, IconButton, PasswordField, PaymentSchedule, RadioGroup, SearchField, Slider, TextArea, TextField, Toggle,
  ToggleGroup, VARIANTS, variantClass } from '../src';
import { violations } from './a11y';

afterEach(cleanup);

const wave1 = JSON.parse(readFileSync(join(__dirname, '..', '..', 'variants', 'v1.json'), 'utf8')) as {
  components: Record<string, { kind: string; variants: string[]; packs: Record<string, { name: string }> }>;
};

describe('every V1 component takes each of its variants', () => {
  for (const [id, c] of Object.entries(wave1.components)) {
    const name = c.packs.react.name;
    it.each(c.variants)(`${id} (${name}): %s`, (v) => {
      expect(VARIANTS[name]).toEqual([c.kind, c.variants]);
      expect(variantClass(name, v)).toBe(`bx-${c.kind}--${v}`);
      expect((pack as Record<string, { displayName?: string }>)[name].displayName).toBe(name);
    });
  }
  it('an unknown variant or none keeps the pack\'s own look', () => {
    expect(variantClass('Button', 'nope')).toBe('');
    expect(variantClass('Button')).toBe('');
    expect(variantClass('Dialog', 'material')).toBe('');
  });
});

describe('the variant wrapper', () => {
  it('adds bx-<kind>--<variant> around the component and nothing without a variant', () => {
    const { container, rerender } = render(<Button label="Pay" />);
    expect(container.firstElementChild?.tagName).toBe('BUTTON');
    rerender(<Button label="Pay" variant="tonal" />);
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap.className).toBe('bx-button--tonal');
    expect(wrap.style.display).toBe('contents');
    expect(screen.getByRole('button', { name: 'Pay' }).className).toContain('bx-btn');
  });

  it('gives a composite its kind\'s class, drawn by the skin', () => {
    const { container } = render(<PaymentSchedule value="Once" variant="ios" />);
    expect(container.firstElementChild?.className).toBe('bx-segmented--ios');
    expect(screen.getByRole('radio', { name: 'Once' })).toBeTruthy();
  });
});

function Controlled<T>({ initial, children }: { initial: T; children: (value: T, set: (v: T) => void) => ReactElement }) {
  const [value, setValue] = useState<T>(initial);
  return children(value, setValue);
}

describe('the material variant on @mui/material', () => {
  it('Button: the label names it, it presses, busy stops a second press', async () => {
    let pressed = 0;
    const { rerender } = render(<Button testID="pay" label="Pay now" variant="material" onAction={() => { pressed += 1; }} />);
    const b = screen.getByRole('button', { name: 'Pay now' });
    expect(b.className).toContain('MuiButton');
    fireEvent.click(b);
    expect(pressed).toBe(1);
    rerender(<Button testID="pay" label="Pay now" variant="material" busy onAction={() => { pressed += 1; }} />);
    expect(screen.getByTestId('pay').getAttribute('aria-busy')).toBe('true');
    expect((screen.getByTestId('pay') as HTMLButtonElement).disabled).toBe(true);
    expect(await violations()).toEqual([]);
  });

  it('IconButton: the label is its name and tooltip', async () => {
    render(<IconButton label="More actions" variant="material" />);
    expect(screen.getByRole('button', { name: 'More actions' }).getAttribute('title')).toBe('More actions');
    expect(await violations()).toEqual([]);
  });

  it('TextField and TextArea: write back, required shows after leaving, announced', async () => {
    let seen = '';
    render(<Controlled initial="">{(v, set) => <TextField testID="n" label="Name" value={v} required variant="material" onChange={(x) => { seen = x; set(x); }} />}</Controlled>);
    const input = screen.getByTestId('n-input');
    fireEvent.change(input, { target: { value: 'Asha' } });
    expect(seen).toBe('Asha');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toBe('Name is required.');
    cleanup();
    render(<TextArea testID="m" label="Message" value="Hello" variant="material" />);
    expect(screen.getByLabelText('Message').tagName).toBe('TEXTAREA');
    expect(await violations()).toEqual([]);
  });

  it('PasswordField: masked, Show reveals', async () => {
    render(<PasswordField testID="p" label="Password" value="secret" variant="material" />);
    const input = screen.getByTestId('p-input') as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(input.type).toBe('text');
    expect(await violations()).toEqual([]);
  });

  it('SearchField: a search landmark, Enter searches, Escape empties', () => {
    let searched = '';
    let value = 'rent';
    render(<SearchField testID="s" label="Search" value={value} variant="material" onSearch={(t) => { searched = t; }} onChange={(v) => { value = v; }} />);
    expect(screen.getByRole('search')).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId('s-input'), { key: 'Enter' });
    expect(searched).toBe('rent');
    fireEvent.keyDown(screen.getByTestId('s-input'), { key: 'Escape' });
    expect(value).toBe('');
  });

  it('Dropdown: a native select named by its label', async () => {
    let seen = '';
    render(<Dropdown testID="d" label="Account" value="" options={['Savings', 'Current']} variant="material" onChange={(v) => { seen = v; }} />);
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'Current' } });
    expect(seen).toBe('Current');
    expect(await violations()).toEqual([]);
  });

  it('CheckboxGroup and RadioGroup: a named group, picks write back', async () => {
    let many: string[] = [];
    render(<CheckboxGroup testID="c" label="Alerts" value={['Email']} options={['Email', 'SMS']} variant="material" onChange={(v) => { many = v; }} />);
    expect(screen.getByRole('group', { name: 'Alerts' })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'SMS' }));
    expect(many).toEqual(['Email', 'SMS']);
    expect(await violations()).toEqual([]);
    cleanup();
    let one = '';
    render(<RadioGroup testID="r" label="Delivery" value="SMS" options={['SMS', 'Email']} variant="material" onChange={(v) => { one = v; }} />);
    expect((screen.getByRole('radio', { name: 'SMS' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Email' }));
    expect(one).toBe('Email');
    expect(await violations()).toEqual([]);
  });

  it('Toggle: a switch announced on or off', async () => {
    let on = false;
    render(<Toggle testID="t" label="Do not disturb" value={false} variant="material" onChange={(v) => { on = v; }} />);
    const sw = screen.getByRole('switch', { name: 'Do not disturb' });
    fireEvent.click(sw);
    expect(on).toBe(true);
    expect(await violations()).toEqual([]);
  });

  it('Slider: named, the value read out as text', async () => {
    render(<Slider testID="sl" label="Amount" value={500} prefix="INR" max={1000} variant="material" />);
    const s = screen.getByRole('slider');
    expect(s.getAttribute('aria-valuetext')).toBe('INR 500');
    expect(await violations()).toEqual([]);
  });

  it('ToggleGroup and FilterChips: the chosen one is pressed; a press writes back', async () => {
    let seg = '';
    render(<ToggleGroup testID="g" label="Repeat" value="Once" options={['Once', 'Monthly']} variant="material" onChange={(v) => { seg = v; }} />);
    expect(screen.getByRole('button', { name: 'Once' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Monthly' }));
    expect(seg).toBe('Monthly');
    expect(await violations()).toEqual([]);
    cleanup();
    let chips: string[] = [];
    render(<FilterChips testID="f" label="Type" value={['Debit']} options={['Debit', 'Credit']} variant="material" onChange={(v) => { chips = v; }} />);
    expect(screen.getByRole('button', { name: 'Debit' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Credit' }));
    expect(chips).toEqual(['Debit', 'Credit']);
    expect(await violations()).toEqual([]);
  });
});
