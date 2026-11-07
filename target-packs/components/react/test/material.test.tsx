import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MaterialButton, MaterialCard, MaterialCheckboxGroup, MaterialChips, MaterialDialog, MaterialMenu, MaterialProgress, MaterialRadioGroup, MaterialSelect, MaterialSlider,
  MaterialSnackbar, MaterialStepper, MaterialSwitch, MaterialTable, MaterialTabs, MaterialTextField, MaterialTheme, isDark, materialTheme,
} from '../src/Material';
import { violations } from './a11y';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const rows = [{ id: 'a', name: 'Rent', amount: 900 }, { id: 'b', name: 'Coffee', amount: 4 }];

describe('Material variant set', () => {
  it('builds the MUI theme from the bank tokens, the pack defaults where a token is missing', () => {
    const t = materialTheme((k) => ({ brand: '#c74634', surface: '#111827', radius: '6px' } as Record<string, string>)[k] ?? '');
    expect(t.palette.primary.main).toBe('#c74634');
    expect(t.palette.mode).toBe('dark');
    expect(t.shape.borderRadius).toBe(6);
    expect(t.palette.error.main).toBe('#dc2626');
    expect(materialTheme().palette.primary.main).toBe('#4f46e5');
    expect([isDark('#fff'), isDark('#0f172a'), isDark('var(--x)')]).toEqual([false, true, false]);
  });

  it('every component renders and passes axe', async () => {
    render(
      <MaterialTheme>
        <MaterialButton label="Pay" /><MaterialButton label="Delete payee" chroming="danger" />
        <MaterialTextField testID="t" label="Payee name" value="A. Rao" />
        <MaterialTextField testID="p" label="Password" value="" type="password" />
        <MaterialSelect testID="s" label="Account" value="sav" options={[{ value: 'sav', label: 'Savings' }, { value: 'cur', label: 'Current' }]} />
        <MaterialCheckboxGroup testID="c" label="Alerts" value={['sms']} options={[{ value: 'sms', label: 'SMS' }, { value: 'email', label: 'Email' }]} />
        <MaterialRadioGroup testID="r" label="Repeat" value="monthly" options={['once', 'monthly']} />
        <MaterialSwitch testID="w" label="Round up to save" value />
        <MaterialSlider label="Amount" value={500} max={1000} prefix="USD" />
        <MaterialChips label="Show" options={['Debits', 'Credits']} value={['Debits']} />
        <MaterialTabs label="Accounts" tabs={[{ id: 'a', label: 'Savings', content: <p>Savings</p> }, { id: 'b', label: 'Current' }]} selection="a" onSelectionChange={() => undefined} />
        <MaterialCard heading="Savings" subheading="•••• 4521"><p>12,500.00</p></MaterialCard>
        <MaterialMenu items={['Statements', { id: 'block', label: 'Block card', danger: true }]} />
        <MaterialTable caption="Payments" rows={rows} keyField="id" columns={[{ field: 'name', headerText: 'Payee', sortable: true }, { field: 'amount', headerText: 'Amount', align: 'end' }]} />
        <MaterialStepper steps={['Details', 'Review', 'Done']} selectedStep="Review" />
        <MaterialProgress heading="Budgets" items={[{ label: 'Groceries', value: 320, max: 400 }]} unit="USD" />
        <MaterialSnackbar display="general" messages={[{ id: 'm', severity: 'confirmation', summary: 'Payment sent' }]} onClose={() => undefined} />
      </MaterialTheme>,
    );
    expect(await violations()).toEqual([]);
  });

  it('a button maps the chroming to MUI and stays still while busy', async () => {
    const onAction = vi.fn();
    render(<><MaterialButton label="Pay" onAction={onAction} /><MaterialButton label="Later" chroming="borderless" busy onAction={onAction} /></>);
    expect(screen.getByRole('button', { name: 'Pay' }).className).toContain('MuiButton-contained');
    expect(screen.getByRole('button', { name: 'Later' }).className).toContain('MuiButton-text');
    await userEvent.click(screen.getByRole('button', { name: 'Pay' }));
    expect(onAction).toHaveBeenCalledOnce();
    expect((screen.getByRole('button', { name: 'Later' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a text field says a required value is missing once left', async () => {
    function T() { const [v, set] = useState(''); return <MaterialTextField testID="t" label="Payee name" value={v} onChange={set} required />; }
    render(<T />);
    const box = screen.getByRole('textbox', { name: /Payee name/ });
    await userEvent.click(box);
    await userEvent.tab();
    expect(screen.getByText('Payee name is required.')).toBeTruthy();
    await userEvent.type(box, 'A');
    expect(screen.queryByText('Payee name is required.')).toBeNull();
  });

  it('checkboxes, radios, a switch and chips write their values back', async () => {
    const onBoxes = vi.fn(), onRadio = vi.fn(), onSwitch = vi.fn(), onChips = vi.fn();
    render(<>
      <MaterialCheckboxGroup testID="c" label="Alerts" value={['sms']} onChange={onBoxes} options={['sms', 'email']} />
      <MaterialRadioGroup testID="r" label="Repeat" value="once" onChange={onRadio} options={['once', 'monthly']} />
      <MaterialSwitch testID="w" label="Round up" value={false} onChange={onSwitch} />
      <MaterialChips label="Show" options={['Debits', 'Credits']} value={['Debits']} multiple={false} onChange={onChips} />
    </>);
    await userEvent.click(screen.getByRole('checkbox', { name: 'email' }));
    expect(onBoxes).toHaveBeenCalledWith(['sms', 'email']);
    await userEvent.click(screen.getByRole('radio', { name: 'monthly' }));
    expect(onRadio).toHaveBeenCalledWith('monthly');
    await userEvent.click(screen.getByRole('switch', { name: 'Round up' }));
    expect(onSwitch).toHaveBeenCalledWith(true);
    await userEvent.click(screen.getByRole('button', { name: 'Credits' }));
    expect(onChips).toHaveBeenCalledWith(['Credits']);
  });

  it('a select picks an option from its list', async () => {
    const onChange = vi.fn();
    render(<MaterialSelect testID="s" label="Account" value="sav" onChange={onChange} options={[{ value: 'sav', label: 'Savings' }, { value: 'cur', label: 'Current' }]} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Account' }));
    await userEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Current' }));
    expect(onChange).toHaveBeenCalledWith('cur');
  });

  it('the dialog closes from its close button but not on Escape when it must be answered', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<MaterialDialog open title="Delete payee?" description="You can add them again later." onOpenChange={onOpenChange} />);
    expect(screen.getByRole('dialog', { name: 'Delete payee?' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    onOpenChange.mockClear();
    rerender(<MaterialDialog open title="Confirm" cancelBehavior="none" onOpenChange={onOpenChange} />);
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('tabs switch, the menu acts, the table sorts and selects', async () => {
    const onTab = vi.fn(), onAction = vi.fn(), onSort = vi.fn(), onSel = vi.fn();
    render(<>
      <MaterialTabs label="Accounts" tabs={[{ id: 'a', label: 'Savings' }, { id: 'b', label: 'Current' }]} selection="a" onSelectionChange={onTab} />
      <MaterialMenu label="Card" items={['Statements', 'Block']} onAction={onAction} />
      <MaterialTable caption="Payments" rows={rows} keyField="id" selectionMode="multiple" onSelectedChange={onSel} onSort={onSort}
                     columns={[{ field: 'name', headerText: 'Payee', sortable: true }, { field: 'amount', headerText: 'Amount' }]} />
    </>);
    await userEvent.click(screen.getByRole('tab', { name: 'Current' }));
    expect(onTab).toHaveBeenCalledWith('b');
    await userEvent.click(screen.getByRole('button', { name: 'Card' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Block' }));
    expect(onAction).toHaveBeenCalledWith('Block');
    await userEvent.click(screen.getByRole('button', { name: 'Payee' }));
    expect(onSort).toHaveBeenCalledWith('name', 'ascending');
    expect(screen.getAllByRole('row')[1].textContent).toContain('Coffee');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select a' }));
    expect(onSel).toHaveBeenCalledWith(['a']);
  });

  it('the stepper marks the current step, progress warns near the limit and the snackbar closes', async () => {
    const onClose = vi.fn();
    render(<>
      <MaterialStepper steps={['Details', 'Review', 'Done']} selectedStep="Review" />
      <MaterialProgress items={[{ label: 'Groceries', value: 450, max: 400 }]} unit="USD" />
      <MaterialSnackbar display="general" messages={[{ id: 'm', severity: 'error', summary: 'Payment failed' }]} onClose={onClose} />
    </>);
    expect(screen.getByText('Review').closest('li')?.getAttribute('aria-current')).toBe('step');
    expect(screen.getByText('Over by 50 USD')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Payment failed');
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
