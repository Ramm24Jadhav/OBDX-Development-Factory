import { Component, Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent, getAllByRole, getByRole, getByText, queryByRole, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { ActionMenu, Alert, Breadcrumb, Divider, EmptyState, ErrorMessage, Grid, NotificationPanel, Pagination, RowItem, SecondaryButton, Sheet, SideNav, Slider,
  Spinner, StatusBadge, Stepper, SuccessMessage, Timeline, ToggleGroup, Tooltip } from '../src';
import { violations } from './a11y';

async function mount<T>(host: Type<T>) {
  const fixture = TestBed.createComponent(host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  document.body.appendChild(fixture.nativeElement);
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance, settle: () => fixture.whenStable() };
}

afterEach(() => { document.body.innerHTML = ''; TestBed.resetTestingModule(); });

describe('group 1', () => {
  it('every component renders with its sample and passes axe', async () => {
    @Component({ imports: [SecondaryButton, Slider, ToggleGroup, ActionMenu, Stepper, Breadcrumb, SideNav, Grid, Divider, Pagination, StatusBadge, Timeline, Spinner,
      EmptyState, Tooltip, Alert, ErrorMessage, SuccessMessage, NotificationPanel], template: `
      <bx-secondary-button label="Save for later" />
      <bx-savings-slider label="Monthly saving" [value]="5000" [max]="20000" [step]="500" prefix="USD" />
      <bx-segmented label="Show" [options]="['Day', 'Week', 'Month']" value="Week" />
      <bx-action-menu [items]="['Download statement', 'Set a nickname', 'Close the account']" />
      <bx-stepper [steps]="['Details', 'Review', 'Done']" selectedStep="Review" />
      <bx-breadcrumb [items]="['Accounts', 'Savings ·· 4821', 'Statement']" />
      <bx-side-nav [items]="['Accounts', 'Payments', 'Cards']" selection="Accounts" />
      <bx-grid [columns]="2"><div>One</div><div>Two</div></bx-grid>
      <bx-divider /><bx-divider label="Or" />
      <bx-pagination [page]="2" [pageCount]="4" />
      <bx-status-badge label="Completed" tone="success" />
      <bx-timeline [items]="[{ label: 'Initiated', meta: '09:12 · A. Rao' }, { label: 'Approved', state: 'current' }]" />
      <bx-spinner />
      <bx-empty-state heading="No payees yet" text="Add one to pay faster." actionLabel="Add a payee" />
      <bx-tooltip label="Available balance" text="What you can spend now." />
      <bx-alert-banner message="Transfers after 6 pm arrive the next working day." />
      <bx-error-message message="The amount is more than your daily limit of 5,000.00." actionLabel="Change the amount" />
      <bx-success-message message="Payment sent. Reference FX-20391." actionLabel="View receipt" />
      <bx-notification-panel [items]="[{ title: 'Card payment due', meta: 'Due 18 Jan', value: '640.00', unread: true }]" />` })
    class Host {}
    const { el } = await mount(Host);
    expect(getByRole(el, 'button', { name: 'Save for later' }).className).toContain('bx-btn--outlined');
    expect(getByRole(el, 'alert').textContent).toContain('daily limit');
    expect(getByRole(el, 'heading', { name: 'Notifications' })).toBeTruthy();
    expect(getByRole(el, 'button', { name: 'Read: Card payment due' })).toBeTruthy();
    expect(await violations(el)).toEqual([]);
  });

  it('Slider and ToggleGroup write back; arrow keys move the segment', async () => {
    @Component({ imports: [Slider, ToggleGroup], template: `
      <bx-savings-slider label="Monthly saving" [(value)]="saving" [max]="20000" prefix="USD" />
      <bx-segmented label="Show" [options]="['Day', 'Week', 'Month']" [(value)]="show" />` })
    class Host { saving = signal(5000); show = signal('Week'); }
    const { el, host, settle } = await mount(Host);
    const range = getByRole(el, 'slider');
    expect(range.getAttribute('aria-valuetext')).toBe(`USD ${(5000).toLocaleString()}`);
    fireEvent.input(range, { target: { value: '5500' } });
    expect(host.saving()).toBe(5500);
    fireEvent.keyDown(getByRole(el, 'radio', { name: 'Week' }), { key: 'ArrowRight' });
    await settle();
    expect(host.show()).toBe('Month');
    await userEvent.click(getByRole(el, 'radio', { name: 'Day' }));
    expect(getByRole(el, 'radio', { name: 'Day' }).getAttribute('aria-checked')).toBe('true');
  });

  it('ActionMenu opens, fires the action and gives focus back; Escape closes', async () => {
    @Component({ imports: [ActionMenu], template: `<bx-action-menu [items]="items" (action)="seen = $event" />` })
    class Host { items = ['Download statement', { value: 'close', label: 'Close the account', danger: true }]; seen = ''; }
    const { el, host, settle } = await mount(Host);
    const more = getByRole(el, 'button', { name: 'More' });
    await userEvent.click(more);
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement?.textContent?.trim()).toBe('Download statement');
    fireEvent.keyDown(getByRole(el, 'menu'), { key: 'ArrowDown' });
    await userEvent.keyboard('{Enter}');
    await settle();
    expect(host.seen).toBe('close');
    await userEvent.click(more);
    fireEvent.keyDown(getByRole(el, 'menu'), { key: 'Escape' });
    await settle();
    expect(queryByRole(el, 'menu')).toBeNull();
  });

  it('Stepper, Breadcrumb and SideNav mark where the customer is', async () => {
    @Component({ imports: [Stepper, Breadcrumb, SideNav], template: `
      <bx-stepper [steps]="['Details', 'Review', 'Done']" selectedStep="Review" />
      <bx-breadcrumb [items]="['Accounts', 'Statement']" (action)="went = $event" />
      <bx-side-nav [items]="['Accounts', 'Payments']" [(selection)]="page" />` })
    class Host { went = ''; page = signal('Accounts'); }
    const { el, host, settle } = await mount(Host);
    const steps = within(el.querySelector('.bx-steps') as HTMLElement).getAllByRole('listitem');
    expect(steps.map((s) => s.className)).toEqual(['bx-step-item is-done', 'bx-step-item is-current', 'bx-step-item is-next']);
    await userEvent.click(within(getByRole(el, 'navigation', { name: 'Breadcrumb' })).getByRole('button', { name: 'Accounts' }));
    expect(host.went).toBe('Accounts');
    expect(getByText(el, 'Statement').getAttribute('aria-current')).toBe('page');
    await userEvent.click(within(getByRole(el, 'navigation', { name: 'Main' })).getByRole('button', { name: 'Payments' }));
    await settle();
    expect(host.page()).toBe('Payments');
    expect(within(getByRole(el, 'navigation', { name: 'Main' })).getByRole('button', { name: 'Payments' }).getAttribute('aria-current')).toBe('page');
  });

  it('Sheet is a dialog with its heading; Close and Escape close it', async () => {
    @Component({ imports: [Sheet], template: `<bx-sheet [(open)]="open" heading="Filter transactions"><p>Filters</p></bx-sheet>` })
    class Host { open = signal(true); }
    const { el, host, settle } = await mount(Host);
    expect(getByRole(el, 'dialog', { name: 'Filter transactions' }).className).toContain('bx-sheet is-end');
    expect(await violations(el)).toEqual([]);
    await userEvent.click(getByRole(el, 'button', { name: 'Close' }));
    await settle();
    expect(host.open()).toBe(false);
    host.open.set(true);
    await settle();
    fireEvent.keyDown(getByRole(el, 'dialog'), { key: 'Escape' });
    await settle();
    expect(queryByRole(el, 'dialog')).toBeNull();
  });

  it('Pagination shows the pages around this one and stops at the ends', async () => {
    @Component({ imports: [Pagination], template: `<bx-pagination [(page)]="page" [pageCount]="9" />` })
    class Host { page = signal(5); }
    const { el, host, settle } = await mount(Host);
    expect(getAllByRole(el, 'button').map((b) => b.textContent?.trim())).toEqual(['‹', '1', '4', '5', '6', '9', '›']);
    await userEvent.click(getByRole(el, 'button', { name: 'Next page' }));
    await settle();
    expect(host.page()).toBe(6);
    host.page.set(9);
    await settle();
    expect((getByRole(el, 'button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Tooltip ties the tip to its button and hides it on Escape', async () => {
    @Component({ imports: [Tooltip], template: `<bx-tooltip label="Available balance" text="What you can spend now." />` })
    class Host {}
    const { el, settle } = await mount(Host);
    const b = getByRole(el, 'button', { name: 'About Available balance' });
    expect(b.getAttribute('aria-describedby')).toBe(getByRole(el, 'tooltip', { hidden: true }).id);
    b.focus();
    await settle();
    expect(getByRole(el, 'tooltip').hidden).toBe(false);
    fireEvent.keyDown(b, { key: 'Escape' });
    await settle();
    expect(getByRole(el, 'tooltip', { hidden: true }).hidden).toBe(true);
  });

  it('messages: an error is announced at once; Dismiss hides one and tells the screen', async () => {
    @Component({ imports: [ErrorMessage, SuccessMessage], template: `
      <bx-error-message message="Over your limit." />
      <bx-success-message message="Payment sent." actionLabel="View receipt" [dismissible]="true" (action)="acted = acted + 1" (closed)="closed = closed + 1" />` })
    class Host { acted = 0; closed = 0; }
    const { el, host } = await mount(Host);
    expect(getByRole(el, 'alert').className).toContain('is-error');
    expect(getByRole(el, 'status').className).toContain('is-confirmation');
    await userEvent.click(getByRole(el, 'button', { name: 'View receipt' }));
    await userEvent.click(getByRole(el, 'button', { name: 'Dismiss' }));
    expect([host.acted, host.closed, queryByRole(el, 'status')]).toEqual([1, 1, null]);
  });

  it('NotificationPanel names each row action; a heading of its own replaces the default', async () => {
    @Component({ imports: [NotificationPanel], template: `
      <bx-notification-panel [items]="items" (action)="seen = $event" />
      <bx-notification-panel heading="Alerts" [items]="[]" emptyText="No alerts." />` })
    class Host { items: RowItem[] = [{ id: 'n1', title: 'New statement ready', meta: 'Today' }]; seen: RowItem | null = null; }
    const { el, host } = await mount(Host);
    await userEvent.click(getByRole(el, 'button', { name: 'Read: New statement ready' }));
    expect(host.seen?.id).toBe('n1');
    expect(getByRole(el, 'heading', { name: 'Alerts' })).toBeTruthy();
    expect(getByText(el, 'No alerts.')).toBeTruthy();
  });
});
