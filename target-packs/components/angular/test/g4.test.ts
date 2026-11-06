import { Component, Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { getAllByRole, getByRole, getByText } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { AccountStructure, AlertSubscriptions, Appearance, ApprovalDetail, ApprovalJourney, ApprovalQueue, CodeDelivery, Consents, Devices, DoNotDisturb, LanguagePicker,
  LendLimits, ModificationNotice, PendingRelease, Profile, ProgressBar, Reroute, SessionSummary, SignInOptions, SpendCategories, SpendingChart, StructureSimulation,
  StructureType, SweepMonitor, TransactionLimits, step } from '../src';
import { violations } from './a11y';

async function mount<T>(host: Type<T>) {
  const fixture = TestBed.createComponent(host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  document.body.appendChild(fixture.nativeElement);
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance, settle: () => fixture.whenStable() };
}

afterEach(() => { document.body.innerHTML = ''; TestBed.resetTestingModule(); });

describe('group 4', () => {
  it('every component renders with its sample and passes axe', async () => {
    @Component({ imports: [SpendingChart, ProgressBar, SpendCategories, ApprovalQueue, ApprovalDetail, ApprovalJourney, Reroute, ModificationNotice, PendingRelease, StructureType,
      AccountStructure, StructureSimulation, LendLimits, SweepMonitor, Profile, SignInOptions, CodeDelivery, Devices, Appearance, LanguagePicker, AlertSubscriptions, DoNotDisturb,
      Consents, TransactionLimits, SessionSummary], template: `
      <bx-spending-chart orientation="columns" unit="USD" [items]="[{ label: 'Oct', value: 820 }, { label: 'Nov', value: 1640 }]" />
      <bx-budget-progress [items]="[{ label: 'Groceries', value: 320, max: 400 }, { label: 'Eating out', value: 210, max: 200 }]" />
      <bx-spend-categories [options]="['Eating out', 'Groceries', 'Travel']" />
      <bx-approval-queue [items]="[{ title: 'Payroll Feb · prioritized', meta: 'Financial · 182,400.00', value: 'PAY-4410' }]" />
      <bx-approval-detail [items]="kv" />
      <bx-approval-journey [items]="[{ label: 'Initiated', meta: 'A. Rao · 09:12' }, { label: 'Waiting, level 2', meta: 'Finance head', state: 'current' }]" />
      <bx-reroute [options]="[{ value: 'fh', label: 'Finance head' }, { value: 'tr', label: 'Treasury' }]" />
      <bx-modification-requested message="PAY-4410 was sent back: change the value date to a working day." />
      <bx-pending-release [items]="[{ title: 'Payroll Jan', meta: 'Approved 3 of 3', value: '182,400.00' }]" />
      <bx-structure-type value="Sweep" />
      <bx-account-structure [items]="[{ title: 'Header account ·· 1000', body: 'Sweeps to zero balance daily at 18:00.' }]" />
      <bx-structure-simulation [items]="kv" />
      <bx-intercompany-limits [items]="[{ label: 'Payroll Ltd', value: 120, max: 500 }]" />
      <bx-sweep-monitor [items]="[{ label: 'Sweep started', meta: '18:00' }]" />
      <bx-profile [items]="[{ label: 'Name', value: 'A. Rao' }]" />
      <bx-sign-in-options [options]="['Passkey', 'Facial ID', 'Soft token']" [value]="['Passkey']" />
      <bx-otp-delivery value="SMS" />
      <bx-devices [items]="[{ title: 'iPhone 15 · this device', meta: 'Registered 12 Mar', value: 'Active' }]" />
      <bx-appearance value="System" />
      <bx-language value="en" [options]="[{ value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }]" />
      <bx-alerts-subscription [options]="['Payments over 500.00', 'Low balance']" />
      <bx-do-not-disturb [value]="true" />
      <bx-consents [items]="[{ title: 'Budget app (open banking)', meta: 'Granted 02 Jan', value: 'Accounts' }]" />
      <bx-transaction-limits [items]="[{ label: 'Daily transfers', value: 1200, max: 5000 }]" />
      <bx-session-summary [items]="[{ label: 'Today 08:12', meta: 'iPhone 15 · London' }]" />` })
    class Host { kv = [{ label: 'Reference', value: 'PAY-4410' }, { label: 'Amount', value: '182,400.00 USD' }]; }
    const { el } = await mount(Host);
    expect(getByRole(el, 'figure', { name: 'Spending by month' })).toBeTruthy();
    expect(getByRole(el, 'progressbar', { name: 'Eating out' }).getAttribute('aria-valuetext')).toBe('210 of 200, over by 10');
    expect(getByRole(el, 'button', { name: 'Revoke: Budget app (open banking)' })).toBeTruthy();
    expect(getByText(el, 'Sent back for changes')).toBeTruthy();
    expect(getByRole(el, 'button', { name: 'Modify it' })).toBeTruthy();
    expect(getByRole(el, 'combobox', { name: 'Re-route to' })).toBeTruthy();
    expect(getAllByRole(el, 'radio', { name: 'Dark' }).length).toBe(1);
    expect(await violations(el)).toEqual([]);
  });

  it('bars and meters use steps of 5%; categories keep one; account structures open several', async () => {
    expect([step(320, 400), step(500, 400), step(1, 0)]).toEqual([80, 100, 0]);
    @Component({ imports: [SpendCategories, AccountStructure, AlertSubscriptions], template: `
      <bx-spend-categories [options]="['Eating out', 'Groceries']" [(value)]="cats" />
      <bx-account-structure [items]="[{ title: 'Header', body: 'A' }, { title: 'Child', body: 'B' }]" />
      <bx-alerts-subscription [options]="['Low balance']" [(value)]="alerts" />` })
    class Host { cats = signal<string[]>([]); alerts = signal<string[]>([]); }
    const { el, host, settle } = await mount(Host);
    await userEvent.click(getByRole(el, 'button', { name: 'Eating out' }));
    await userEvent.click(getByRole(el, 'button', { name: 'Groceries' }));
    await settle();
    expect(host.cats()).toEqual(['Groceries']);
    await userEvent.click(getByRole(el, 'button', { name: 'Header' }));
    await userEvent.click(getByRole(el, 'button', { name: 'Child' }));
    await settle();
    expect(getAllByRole(el, 'region').length).toBe(2);
    await userEvent.click(getByRole(el, 'switch', { name: 'Low balance' }));
    await settle();
    expect(host.alerts()).toEqual(['Low balance']);
  });
});
