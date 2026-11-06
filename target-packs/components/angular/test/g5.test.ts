import { Component, Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent, getAllByRole, getByLabelText, getByRole, getByText, queryByText, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { ApplicationTracker, Certificates, ComposeMessage, DepositCalculator, EReceipts, EligibilityCalculator, Faq, FeedbackRating, GoalCalculator, LiveChat, Locator, Mailbox,
  Nominations, Period, Place, ProductCard, RaiseRequest, SelfRegister, StatementFormat, StatementRequest, TaxSelfCertification, TermsConsent, TrackRequests, maturity } from '../src';
import { violations } from './a11y';

async function mount<T>(host: Type<T>) {
  const fixture = TestBed.createComponent(host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  document.body.appendChild(fixture.nativeElement);
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance, settle: () => fixture.whenStable() };
}

afterEach(() => { document.body.innerHTML = ''; TestBed.resetTestingModule(); });

const usd = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const places: Place[] = [{ id: 'b1', name: 'London Bridge', type: 'branch', distance: '0.4 km' }, { id: 'a1', name: 'Borough ATM', type: 'atm' }];

describe('group 5', () => {
  it('every component renders with its sample and passes axe', async () => {
    @Component({ imports: [RaiseRequest, TrackRequests, Mailbox, ComposeMessage, EReceipts, Certificates, StatementRequest, StatementFormat, SelfRegister, TaxSelfCertification,
      ProductCard, ApplicationTracker, TermsConsent, EligibilityCalculator, DepositCalculator, GoalCalculator, Locator, LiveChat, FeedbackRating, Nominations, Faq], template: `
      <bx-raise-request [items]="[{ label: 'Request', value: 'Cheque book' }]" />
      <bx-track-requests [items]="[{ label: 'Received', meta: 'SR-2210 · 10 Jan' }, { label: 'Dispatched', meta: 'Expected 15 Jan', state: 'pending' }]" />
      <bx-mailbox [items]="[{ title: 'Your cheque book is on the way', meta: 'Today', value: 'Mail', unread: true }]" />
      <bx-compose-mail />
      <bx-e-receipts [items]="[{ title: 'Transfer to A. Rao', meta: '14 Jan · 1,250.00', value: 'PDF' }]" />
      <bx-certificates [items]="[{ title: 'Interest certificate', meta: '2025', value: 'PDF' }]" />
      <bx-statement-request [value]="{ from: '2025-10-01', to: '2025-12-31' }" />
      <bx-statement-format value="PDF" />
      <bx-self-register selectedStep="Verify" />
      <bx-fatca-crs selectedStep="Identity" />
      <bx-product-showcase heading="Platinum credit card" text="2% cashback" badge="New" />
      <bx-application-tracker [items]="[{ label: 'Submitted', meta: '12 Jan' }]" />
      <bx-terms-consent [options]="['I accept the terms and conditions', 'Send me offers by email']" />
      <bx-eligibility-calculator [value]="6000" prefix="USD" />
      <bx-td-calculator currency="USD" />
      <bx-goal-calculator [value]="400" prefix="USD" />
      <bx-locator [items]="places" />
      <bx-live-chat [messages]="[{ id: 'm1', from: 'agent', name: 'Priya', text: 'Hello, how can I help?', time: '10:02' }]" />
      <bx-feedback [value]="4" />
      <bx-nominations [items]="[{ title: 'S. Rao · spouse', meta: 'Savings ·· 4821', value: '50%' }]" />
      <bx-faq [items]="[{ title: 'How do I reset my password?', body: 'Choose Forgot password on the sign-in page.' }]" />` })
    class Host { places = places; }
    const { el } = await mount(Host);
    expect(getAllByRole(el, 'listitem').length).toBeGreaterThan(4);
    expect(getAllByRole(el, 'checkbox').length).toBe(2);
    expect(getByRole(el, 'log', { name: 'Chat with us' })).toBeTruthy();
    expect(getByRole(el, 'list', { name: 'Register' }).querySelectorAll('li').length).toBe(4);
    expect(within(el.querySelector('bx-td-calculator') as HTMLElement).getByText(`${usd(Math.round(maturity(10000, 7, 12) * 100) / 100)} USD`)).toBeTruthy();
    expect(await violations(el)).toEqual([]);
  });

  it('the deposit calculator works out as the customer types', async () => {
    @Component({ imports: [DepositCalculator], template: `<bx-td-calculator currency="USD" [rate]="8" />` })
    class Host {}
    const { el, settle } = await mount(Host);
    expect(getByText(el, `${usd(10824.32)} USD`)).toBeTruthy();
    fireEvent.input(getByLabelText(el, 'Deposit (USD)'), { target: { value: '20000' } });
    await settle();
    expect(getByText(el, `${usd(21648.64)} USD`)).toBeTruthy();
  });

  it('StatementRequest checks the period before it asks', async () => {
    @Component({ imports: [StatementRequest], template: `<bx-statement-request [(value)]="period" [maxDays]="92" (request)="asked = $event" />` })
    class Host { period = signal<Period>({ from: '', to: '' }); asked: Period | null = null; }
    const { el, host, settle } = await mount(Host);
    await userEvent.click(getByRole(el, 'button', { name: 'Request' }));
    await settle();
    expect(getByRole(el, 'alert').textContent).toContain('Choose the first and the last day.');
    fireEvent.change(getByLabelText(el, 'From'), { target: { value: '2025-10-01' } });
    fireEvent.change(getByLabelText(el, 'To'), { target: { value: '2025-12-31' } });
    await userEvent.click(getByRole(el, 'button', { name: 'Request' }));
    await settle();
    expect(host.asked).toEqual({ from: '2025-10-01', to: '2025-12-31' });
  });

  it('chat sends on Enter, compose sends what was typed, the locator filters, the rating chooses', async () => {
    @Component({ imports: [LiveChat, ComposeMessage, Locator, FeedbackRating], template: `
      <bx-live-chat (send)="sent.push($event)" />
      <bx-compose-mail [(value)]="draft" (send)="sent.push($event)" />
      <bx-locator [items]="places" />
      <bx-feedback [(value)]="stars" />` })
    class Host { sent: string[] = []; draft = signal(''); places = places; stars = signal(0); }
    const { el, host, settle } = await mount(Host);
    await userEvent.type(getByRole(el, 'textbox', { name: 'Write a message' }), '  My card is stuck  {enter}');
    await userEvent.type(getByLabelText(el, 'Message to the bank'), 'Please send a cheque book.');
    await settle();
    await userEvent.click(within(el.querySelector('.bx-compose') as HTMLElement).getByRole('button', { name: 'Send' }));
    expect(host.sent).toEqual(['My card is stuck', 'Please send a cheque book.']);
    await userEvent.click(getByRole(el, 'button', { name: 'ATMs' }));
    await settle();
    expect([queryByText(el, 'London Bridge'), !!getByText(el, 'Borough ATM')]).toEqual([null, true]);
    await userEvent.click(getByRole(el, 'radio', { name: '4 stars, Good' }));
    await settle();
    expect([host.stars(), el.querySelectorAll('.bx-star.is-on').length]).toEqual([4, 4]);
  });
});
