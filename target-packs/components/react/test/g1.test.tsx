import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactElement, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Accordion, ActionMenu, Alert, Avatar, Breadcrumb, DestructiveButton, Divider, EmptyState, ErrorMessage, FilterChips, Grid, NotificationPanel,
  Pagination, SecondaryButton, Sheet, SideNav, Skeleton, Slider, Spinner, StatusBadge, Stepper, SuccessMessage, Timeline, ToggleGroup, Tooltip } from '../src';
import { violations } from './a11y';

afterEach(cleanup);

function Controlled<T>({ initial, children }: { initial: T; children: (value: T, set: (v: T) => void) => ReactElement }) {
  const [value, setValue] = useState<T>(initial);
  return children(value, setValue);
}

describe('group 1', () => {
  it('every component renders with its sample and passes axe', async () => {
    render(
      <div>
        <SecondaryButton label="Save for later" />
        <DestructiveButton label="Cancel payment" />
        <Slider label="Monthly saving" value={5000} max={20000} step={500} prefix="USD" />
        <ToggleGroup label="Show" options={['Day', 'Week', 'Month']} value="Week" />
        <FilterChips label="Filter" options={['Card', 'Transfer', 'Bills', 'Salary']} value={['Card']} />
        <ActionMenu items={['Download statement', 'Set a nickname', 'Close the account']} />
        <Accordion items={[{ title: 'How long does a transfer take?', body: 'Same day inside the bank.' }]} expanded={['How long does a transfer take?']} />
        <Stepper steps={['Details', 'Review', 'Done']} selectedStep="Review" />
        <Breadcrumb items={['Accounts', 'Savings ·· 4821', 'Statement']} />
        <SideNav items={['Accounts', 'Payments', 'Cards']} selection="Accounts" />
        <Grid columns={2}><div>One</div><div>Two</div></Grid>
        <Divider />
        <Divider label="Or" />
        <Avatar name="Asha Rao" />
        <Pagination page={2} pageCount={4} />
        <StatusBadge label="Completed" tone="success" />
        <Timeline items={[{ label: 'Initiated', meta: '09:12 · A. Rao' }, { label: 'Approved', state: 'current' }]} />
        <Spinner />
        <Skeleton />
        <EmptyState heading="No payees yet" text="Add one to pay faster." actionLabel="Add a payee" />
        <Tooltip label="Available balance" text="What you can spend now." />
        <Alert message="Transfers after 6 pm arrive the next working day." />
        <ErrorMessage message="The amount is more than your daily limit of 5,000.00." actionLabel="Change the amount" />
        <SuccessMessage message="Payment sent. Reference FX-20391." actionLabel="View receipt" />
        <NotificationPanel items={[{ title: 'Card payment due', meta: 'Due 18 Jan', value: '640.00', unread: true }]} />
      </div>,
    );
    expect(screen.getByRole('button', { name: 'Save for later' }).className).toContain('bx-btn--outlined');
    expect(screen.getByRole('button', { name: 'Cancel payment' }).className).toContain('bx-btn--danger');
    expect(screen.getByRole('alert').textContent).toContain('daily limit');
    expect(screen.getByRole('button', { name: 'Read: Card payment due' })).toBeTruthy();
    expect(await violations()).toEqual([]);
  });

  it('Slider writes back a number and says the value with its currency', () => {
    let seen = 0;
    render(<Slider label="Monthly saving" value={5000} max={20000} prefix="USD" onChange={(v) => { seen = v; }} />);
    const range = screen.getByLabelText('Monthly saving');
    expect(range.getAttribute('aria-valuetext')).toBe(`USD ${(5000).toLocaleString()}`);
    fireEvent.change(range, { target: { value: '5500' } });
    expect(seen).toBe(5500);
  });

  it('ToggleGroup chooses by click and arrow keys', async () => {
    render(<Controlled initial="Week">{(v, set) => <ToggleGroup label="Show" options={['Day', 'Week', 'Month']} value={v} onChange={set} />}</Controlled>);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Week' }), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Month' }).getAttribute('aria-checked')).toBe('true');
    await userEvent.click(screen.getByRole('radio', { name: 'Day' }));
    expect(screen.getByRole('radio', { name: 'Day' }).getAttribute('tabindex')).toBe('0');
  });

  it('FilterChips turns several on and off, or one when not multiple', async () => {
    render(<Controlled initial={[] as string[]}>{(v, set) => <FilterChips label="Filter" options={['Card', 'Bills']} value={v} onChange={set} />}</Controlled>);
    await userEvent.click(screen.getByRole('button', { name: 'Card' }));
    await userEvent.click(screen.getByRole('button', { name: 'Bills' }));
    expect(screen.getAllByRole('button', { pressed: true }).length).toBe(2);
    cleanup();
    render(<Controlled initial={['A']}>{(v, set) => <FilterChips label="One" options={['A', 'B']} value={v} multiple={false} onChange={set} />}</Controlled>);
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(screen.getByRole('button', { name: 'A' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('ActionMenu opens, moves with arrows, fires the action and gives focus back; Escape closes', async () => {
    const act = vi.fn();
    render(<ActionMenu items={['Download statement', { value: 'close', label: 'Close the account', danger: true }]} onAction={act} />);
    const more = screen.getByRole('button', { name: 'More' });
    await userEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.textContent).toBe('Download statement');
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    await userEvent.keyboard('{Enter}');
    expect(act).toHaveBeenCalledWith('close');
    expect(document.activeElement).toBe(more);
    await userEvent.click(more);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Accordion opens one section at a time, or several when multiple', async () => {
    const items = [{ title: 'How long?', body: 'Same day.' }, { title: 'Fees?', body: 'None.' }];
    render(<Accordion items={items} />);
    await userEvent.click(screen.getByRole('button', { name: 'How long?' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fees?' }));
    expect(screen.getByRole('button', { name: 'How long?' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('region', { name: 'Fees?' }).textContent).toBe('None.');
    cleanup();
    render(<Accordion items={items} multiple />);
    await userEvent.click(screen.getByRole('button', { name: 'How long?' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fees?' }));
    expect(screen.getAllByRole('region').length).toBe(2);
  });

  it('Stepper marks done, current and next', () => {
    render(<Stepper steps={['Details', 'Review', 'Done']} selectedStep="Review" />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((i) => i.className)).toEqual(['bx-step-item is-done', 'bx-step-item is-current', 'bx-step-item is-next']);
    expect(items[1].getAttribute('aria-current')).toBe('step');
  });

  it('Breadcrumb links earlier pages; SideNav marks the current page', async () => {
    const go = vi.fn();
    render(<><Breadcrumb items={['Accounts', 'Statement']} onAction={go} /><SideNav items={['Accounts', 'Payments']} selection="Payments" onSelectionChange={go} /></>);
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('button', { name: 'Accounts' }));
    expect(go).toHaveBeenCalledWith('Accounts');
    expect(screen.getByText('Statement').getAttribute('aria-current')).toBe('page');
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Payments' }).getAttribute('aria-current')).toBe('page');
  });

  it('Sheet is a dialog with its heading; Close closes it', async () => {
    render(<Controlled initial={true}>{(v, set) => <Sheet open={v} onOpenChange={set} heading="Filter transactions"><p>Filters</p></Sheet>}</Controlled>);
    expect(screen.getByRole('dialog', { name: 'Filter transactions' }).className).toContain('bx-sheet is-end');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Pagination shows the pages around this one and stops at the ends', async () => {
    const go = vi.fn();
    render(<Pagination page={5} pageCount={9} onPageChange={go} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['‹', '1', '4', '5', '6', '9', '›']);
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(go).toHaveBeenCalledWith(6);
    cleanup();
    render(<Pagination page={1} pageCount={1} />);
    expect((screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Tooltip ties the tip to its button and hides it on Escape', async () => {
    render(<Tooltip label="Available balance" text="What you can spend now." />);
    const b = screen.getByRole('button', { name: 'About Available balance' });
    expect(b.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip', { hidden: true }).id);
    await userEvent.tab();
    expect(screen.getByRole('tooltip').hidden).toBe(false);
    fireEvent.keyDown(b, { key: 'Escape' });
    expect(screen.getByRole('tooltip', { hidden: true }).hidden).toBe(true);
  });

  it('Alert: Dismiss hides it and tells the screen; the action fires', async () => {
    const close = vi.fn();
    const act = vi.fn();
    render(<SuccessMessage message="Payment sent." actionLabel="View receipt" onAction={act} dismissible onClose={close} />);
    expect(screen.getByRole('status').className).toContain('is-confirmation');
    await userEvent.click(screen.getByRole('button', { name: 'View receipt' }));
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect([act.mock.calls.length, close.mock.calls.length, screen.queryByRole('status')]).toEqual([1, 1, null]);
  });

  it('NotificationPanel names each row action and shows its empty text', async () => {
    const act = vi.fn();
    render(<NotificationPanel items={[{ id: 'n1', title: 'New statement ready', meta: 'Today' }]} onAction={act} />);
    await userEvent.click(screen.getByRole('button', { name: 'Read: New statement ready' }));
    expect(act.mock.calls[0][0].id).toBe('n1');
    cleanup();
    render(<NotificationPanel items={[]} />);
    expect(screen.getByText('Nothing here yet.')).toBeTruthy();
  });

  it('Avatar says the name; Skeleton and Spinner are announced', () => {
    render(<><Avatar name="asha rao" /><Spinner label="Loading accounts" /><Skeleton lines={2} /></>);
    expect(screen.getByRole('img', { name: 'asha rao' }).textContent).toBe('AR');
    expect(screen.getAllByRole('status').map((s) => s.textContent)).toEqual(['Loading accounts', 'Loading']);
  });
});
