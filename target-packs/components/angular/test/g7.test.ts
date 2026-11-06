import { Component, Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fireEvent, getByRole, getByText } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { G7_COMPONENTS, CountUp, FlipCard, HoldToConfirm, RevealDigits, RotatingText, SlideToConfirm, SwipeRow, TypedText, VoicePill } from '../src';
import { violations } from './a11y';

async function mount<T>(host: Type<T>) {
  const fixture = TestBed.createComponent(host);
  fixture.autoDetectChanges();
  await fixture.whenStable();
  document.body.appendChild(fixture.nativeElement);
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance, settle: () => fixture.whenStable() };
}

afterEach(() => { document.body.innerHTML = ''; TestBed.resetTestingModule(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('group 7', () => {
  it('has the 69 components', () => { expect(G7_COMPONENTS.length).toBe(69); });

  it('every component renders and passes axe', async () => {
    @Component({ imports: [...G7_COMPONENTS], template: `
      <bx-rolling-digits [value]="1250.5" currency="USD" /><bx-count-up [value]="1840.2" currency="USD" /><bx-split-flap-board [items]="[{ label: 'USD', value: '0.92 EUR' }]" />
      <bx-reveal-digits value="GB29 NWBK 6016 1331 9268 19" /><bx-blur-in-text text="Your money, clearly." /><bx-text-reveal text="Welcome back" />
      <bx-rotating-text prefix="Pay" [words]="['bills', 'friends']" /><bx-shimmer-text text="New offer" /><bx-gradient-text text="Platinum" /><bx-typed-text text="You spent 320.00 on groceries." />
      <bx-focus-word text="Save a little every day" /><bx-scroll-float-text text="Grow your savings" /><bx-fade-in-content><p>Fade</p></bx-fade-in-content><bx-scroll-reveal><p>Reveal</p></bx-scroll-reveal>
      <bx-scroll-expand><p>Expand</p></bx-scroll-expand><bx-edge-blur><p>Long list</p></bx-edge-blur><bx-glare-hover><p>Card</p></bx-glare-hover><bx-magnetic-button label="Open an account" />
      <bx-highlight-border><p>New</p></bx-highlight-border><bx-click-burst><p>Tap</p></bx-click-burst><bx-marquee [items]="['USD 0.92 EUR', 'GBP 1.17 EUR']" />
      <bx-animated-list label="Recent" [items]="['Coffee House', { title: 'Salary', meta: '31 Dec' }]" /><bx-spotlight-card heading="Platinum card" text="2% cashback" /><bx-tilt-card heading="Savings" />
      <bx-flip-card heading="Platinum" front="2% cashback" back="No annual fee in year one" /><bx-card-stack [items]="[{ title: 'Tip 1', text: 'Set a budget' }, { title: 'Tip 2' }]" />
      <bx-glow-border-card heading="Premium" /><bx-bento-grid label="Dashboard" [interactive]="true" [items]="[{ id: 'a', title: 'Spending', figure: '1,240.00', size: 'wide' }]" />
      <bx-carousel [slides]="[{ title: 'Travel insurance', text: 'Cover for the family' }, { title: 'Home loans' }]" /><bx-elastic-slider [value]="500" />
      <bx-option-wheel label="Tenure" [options]="['3 months', '6 months']" value="6 months" /><bx-pill-nav [items]="['Accounts', 'Payments']" selection="Accounts" />
      <bx-dock-nav [items]="[{ id: 'pay', label: 'Pay', icon: '↗' }]" /><bx-card-nav [items]="[{ id: 'loans', title: 'Loans', text: 'Home, car, personal' }]" />
      <bx-staggered-menu [items]="['Statements', 'Settings']" /><bx-document-folder [items]="[{ id: 'd1', title: 'Statement Dec', meta: 'PDF' }]" />
      <bx-scroll-stack [items]="[{ title: 'Step 1', text: 'Choose' }]" /><bx-profile-card name="Priya Nair" jobTitle="Relationship manager" [items]="[{ label: 'Phone', value: '+44 20 7946 0123' }]" actionLabel="Send a message" />
      <bx-glass-panel><p>Glass</p></bx-glass-panel><bx-gradient-backdrop><p>Hello</p></bx-gradient-backdrop><bx-soft-aurora><p>Hello</p></bx-soft-aurora><bx-silk-backdrop><p>Hello</p></bx-silk-backdrop>
      <bx-dot-grid><p>Hello</p></bx-dot-grid><bx-line-waves><p>Hello</p></bx-line-waves><bx-light-beams><p>Hello</p></bx-light-beams><bx-topography><p>Hello</p></bx-topography>
      <bx-particle-backdrop><p>Hello</p></bx-particle-backdrop><bx-slide-to-confirm /><bx-hold-to-confirm /><bx-otp-slots value="12" /><bx-receipt-tear [amount]="1250" currency="USD" />
      <bx-success-check label="Payment sent" /><bx-swipe-row heading="Coffee House" meta="Today" value="-4.50" [actions]="[{ value: 'dispute', label: 'Dispute', tone: 'danger' }]" />
      <bx-swipe-toast message="Saved as a payee" /><bx-bell-toggle /><bx-squish-switch label="Round up to save" /><bx-jelly-radio label="Card design" [options]="['Blue', 'Black']" />
      <bx-glide-select label="Show" [options]="['Day', 'Week']" value="Day" /><bx-rubber-segment label="Period" [options]="['1M', '3M']" value="1M" /><bx-scrub-field [value]="250" currency="USD" />
      <bx-budget-gauge label="Groceries" [value]="320" [max]="400" unit="USD" /><bx-status-mark label="Approved" /><bx-favourite-heart name="A. Rao" [value]="true" /><bx-peek-rating [value]="3" />
      <bx-warm-tooltip label="Reward points" text="Points expire after 2 years." /><bx-prompt-bar [suggestions]="['What did I spend on travel?']" /><bx-voice-pill />
      <bx-call-chip number="+44 20 7946 0000" /><bx-lattice-loader />` })
    class Host {}
    const { el } = await mount(Host);
    expect(getByText(el, 'Your money, clearly.')).toBeTruthy();
    expect(getByRole(el, 'link', { name: 'Call the bank, +44 20 7946 0000' }).getAttribute('href')).toBe('tel:+442079460000');
    expect(getByRole(el, 'progressbar', { name: 'Groceries' }).getAttribute('aria-valuetext')).toBe('320 USD of 400 USD');
    expect(getByRole(el, 'button', { name: 'Favourite A. Rao' }).getAttribute('aria-pressed')).toBe('true');
    expect(await violations(el)).toEqual([]);
  }, 60000);

  it('count-up and typed text move to the end; under reduced motion they start there', async () => {
    vi.useFakeTimers();
    @Component({ imports: [CountUp, TypedText], template: `<bx-count-up testID="c" [value]="1000" [duration]="300" /><bx-typed-text testID="t" text="Hi there" [speed]="20" />` })
    class Host {}
    const fixture = TestBed.createComponent(Host);
    fixture.autoDetectChanges();
    document.body.appendChild(fixture.nativeElement);
    await vi.advanceTimersByTimeAsync(500);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="c"] [aria-hidden="true"]')?.textContent).toBe((1000).toLocaleString(undefined, { minimumFractionDigits: 2 }));
    expect(el.querySelector('[data-testid="t"] [aria-hidden="true"]')?.textContent).toBe('Hi there');
    vi.useRealTimers();
    document.body.innerHTML = '';
    TestBed.resetTestingModule();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    @Component({ imports: [CountUp, TypedText], template: `<bx-count-up testID="c" [value]="7" /><bx-typed-text testID="t" text="Done" />` })
    class Still {}
    const { el: still } = await mount(Still);
    expect([still.querySelector('[data-testid="c"] [aria-hidden="true"]')?.textContent, still.querySelector('[data-testid="t"] [aria-hidden="true"]')?.textContent]).toEqual(['7.00', 'Done']);
  });

  it('rotating text says all the words; reveal digits masks and shows; the flip card hides the face away', async () => {
    @Component({ imports: [RotatingText, RevealDigits, FlipCard], template: `<bx-rotating-text testID="r" prefix="Pay" [words]="['bills', 'friends', 'cards']" />
      <bx-reveal-digits value="GB29 NWBK 6016 1331 9268 19" /><bx-flip-card heading="Platinum" front="Cashback" back="Fees" />` })
    class Host {}
    const { el, settle } = await mount(Host);
    expect(el.querySelector('[data-testid="r"] .bx-visually-hidden')?.textContent).toBe('Pay bills, friends or cards');
    expect(getByText(el, '•••• 6819', { selector: '.bx-visually-hidden' })).toBeTruthy();
    await userEvent.click(getByRole(el, 'button', { name: 'Show Account number' }));
    await userEvent.click(getByRole(el, 'button', { name: 'Show details' }));
    await settle();
    expect(getByText(el, 'GB29 NWBK 6016 1331 9268 19', { selector: '.bx-visually-hidden' })).toBeTruthy();
    expect([el.querySelector('.bx-flip-front')?.getAttribute('aria-hidden'), el.querySelector('.bx-flip-back')?.getAttribute('aria-hidden')]).toEqual(['true', null]);
  });

  it('slide to confirm: a press confirms, a partial drag does not; hold to confirm needs the full time', async () => {
    vi.stubGlobal('PointerEvent', class extends MouseEvent { pointerId = 1; });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return { width: this.classList.contains('bx-slide-handle') ? 50 : 300, height: 50, left: 0, top: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    @Component({ imports: [SlideToConfirm, HoldToConfirm], template: `<bx-slide-to-confirm (confirmed)="slid = slid + 1" /><bx-hold-to-confirm [duration]="200" (confirmed)="held = held + 1" />` })
    class Host { slid = 0; held = 0; }
    const { el, host, settle } = await mount(Host);
    const handle = getByRole(el, 'button', { name: 'Slide to pay: slide, or press to confirm' });
    fireEvent.pointerDown(handle, { clientX: 0 });
    fireEvent.pointerMove(handle, { clientX: 20 });
    fireEvent.pointerUp(handle, { clientX: 20 });
    fireEvent.click(handle);
    expect(host.slid).toBe(0);
    fireEvent.click(handle);
    await settle();
    expect([host.slid, getByRole(el, 'status').textContent]).toEqual([1, 'Paid']);
    const hold = getByRole(el, 'button', { name: 'Hold to confirm' });
    fireEvent.pointerDown(hold);
    fireEvent.pointerUp(hold);
    await new Promise((r) => setTimeout(r, 250));
    expect(host.held).toBe(0);
    fireEvent.keyDown(hold, { key: ' ' });
    await new Promise((r) => setTimeout(r, 250));
    expect(host.held).toBe(1);
  });

  it('swipe row actions and the voice pill', async () => {
    @Component({ imports: [SwipeRow, VoicePill], template: `<bx-swipe-row heading="Coffee House" [actions]="[{ value: 'dispute', label: 'Dispute' }]" (action)="did = $event" /><bx-voice-pill [(listening)]="on" />` })
    class Host { did = ''; on = signal(false); }
    const { el, host, settle } = await mount(Host);
    await userEvent.click(getByRole(el, 'button', { name: 'Dispute: Coffee House' }));
    await userEvent.click(getByRole(el, 'button', { name: 'Speak' }));
    await settle();
    expect([host.did, host.on(), getByRole(el, 'button', { name: 'Listening… press to stop' }).getAttribute('aria-pressed')]).toEqual(['dispute', true, 'true']);
  });
});
