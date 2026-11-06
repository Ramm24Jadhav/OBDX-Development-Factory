import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactElement, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { AccountStructure, AlertSubscriptions, Appearance, ApprovalDetail, ApprovalJourney, ApprovalQueue, CodeDelivery, Consents, Devices, DoNotDisturb, LanguagePicker,
  LendLimits, ModificationNotice, PendingRelease, Profile, ProgressBar, Reroute, SavingsGoal, SessionSummary, SignInOptions, SpendCategories, SpendingChart, StructureSimulation,
  StructureType, SweepMonitor, TransactionLimits } from '../src';
import { violations } from './a11y';

afterEach(cleanup);

function Controlled<T>({ initial, children }: { initial: T; children: (value: T, set: (v: T) => void) => ReactElement }) {
  const [value, setValue] = useState<T>(initial);
  return children(value, setValue);
}
const kv = [{ label: 'Reference', value: 'PAY-4410' }, { label: 'Amount', value: '182,400.00 USD' }];
const tl = [{ label: 'Initiated', meta: 'A. Rao · 09:12' }, { label: 'Waiting, level 2', meta: 'Finance head', state: 'current' as const }];

describe('group 4', () => {
  it('every component renders with its sample and passes axe', async () => {
    render(
      <div>
        <SpendingChart unit="USD" items={[{ label: 'Oct', value: 820 }, { label: 'Nov', value: 1640 }]} />
        <ProgressBar items={[{ label: 'Groceries', value: 320, max: 400 }, { label: 'Eating out', value: 210, max: 200 }]} />
        <SavingsGoal items={[{ label: 'Holiday fund', value: 1800, max: 3000 }]} />
        <SpendCategories options={['Eating out', 'Groceries', 'Travel']} value={['Eating out']} />
        <ApprovalQueue items={[{ title: 'Payroll Feb · prioritized', meta: 'Financial · 182,400.00', value: 'PAY-4410' }]} />
        <ApprovalDetail items={kv} />
        <ApprovalJourney items={tl} />
        <Reroute testID="rr" value="" options={[{ value: 'fh', label: 'Finance head' }, { value: 'tr', label: 'Treasury' }]} />
        <ModificationNotice message="PAY-4410 was sent back: change the value date to a working day." />
        <PendingRelease items={[{ title: 'Payroll Jan', meta: 'Approved 3 of 3', value: '182,400.00' }]} />
        <StructureType value="Sweep" />
        <AccountStructure items={[{ title: 'Header account ·· 1000', body: 'Sweeps to zero balance daily at 18:00.' }]} />
        <StructureSimulation items={kv} />
        <LendLimits items={[{ label: 'Payroll Ltd', value: 120, max: 500 }]} />
        <SweepMonitor items={[{ label: 'Sweep started', meta: '18:00' }]} />
        <Profile items={[{ label: 'Name', value: 'A. Rao' }, { label: 'Mobile', value: '•••• 0123' }]} />
        <SignInOptions options={['Passkey', 'Facial ID', 'Soft token']} value={['Passkey']} />
        <CodeDelivery value="SMS" />
        <Devices items={[{ title: 'iPhone 15 · this device', meta: 'Registered 12 Mar', value: 'Active' }]} />
        <Appearance value="System" />
        <LanguagePicker testID="lg" value="en" options={[{ value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }]} />
        <AlertSubscriptions options={['Payments over 500.00', 'Low balance']} value={[]} />
        <DoNotDisturb value />
        <Consents items={[{ title: 'Budget app (open banking)', meta: 'Granted 02 Jan · ends 02 Apr', value: 'Accounts' }]} />
        <TransactionLimits items={[{ label: 'Daily transfers', value: 1200, max: 5000 }]} />
        <SessionSummary items={[{ label: 'Today 08:12', meta: 'iPhone 15 · London' }]} />
      </div>,
    );
    expect(screen.getByRole('figure', { name: 'Spending by month' })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Eating out' }).getAttribute('aria-valuetext')).toBe('210 of 200, over by 10');
    expect(screen.getByRole('button', { name: 'Revoke: Budget app (open banking)' })).toBeTruthy();
    expect(screen.getByText(/^Alerts wait until/).getAttribute('role')).toBe('status');
    expect(await violations()).toEqual([]);
  });

  it('bars are widths in steps of 5% against the largest value; meters warn near and over the limit', () => {
    render(<><SpendingChart orientation="bars" items={[{ label: 'A', value: 50 }, { label: 'B', value: 200 }]} />
      <ProgressBar items={[{ label: 'Travel', value: 290, max: 300 }, { label: 'Fuel', value: 30, max: 300 }]} /></>);
    expect(Array.from(document.querySelectorAll('.bx-bar-fill')).map((b) => b.className)).toEqual(['bx-bar-fill bx-w-25', 'bx-bar-fill bx-w-100']);
    expect(Array.from(document.querySelectorAll('.bx-meter-fill')).map((b) => b.className)).toEqual(['bx-meter-fill bx-w-95 is-near', 'bx-meter-fill bx-w-10']);
  });

  it('SpendCategories keeps one; Appearance and settings switch', async () => {
    render(<><Controlled initial={[] as string[]}>{(v, set) => <SpendCategories options={['Eating out', 'Groceries']} value={v} onChange={set} />}</Controlled>
      <Controlled initial="System">{(v, set) => <Appearance value={v} onChange={set} />}</Controlled>
      <Controlled initial={[] as string[]}>{(v, set) => <AlertSubscriptions options={['Low balance']} value={v} onChange={set} />}</Controlled></>);
    await userEvent.click(screen.getByRole('button', { name: 'Eating out' }));
    await userEvent.click(screen.getByRole('button', { name: 'Groceries' }));
    expect(screen.getAllByRole('button', { pressed: true }).map((b) => b.textContent)).toEqual(['Groceries']);
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');
    await userEvent.click(screen.getByRole('switch', { name: 'Low balance' }));
    expect(screen.getByRole('switch', { name: 'Low balance' }).getAttribute('aria-checked')).toBe('true');
  });
});
