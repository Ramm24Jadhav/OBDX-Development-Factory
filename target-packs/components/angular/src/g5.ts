/*
 * Group 5 (service, documents, onboarding, calculators, help), the same markup and bx- classes as bx-g5.js in the
 * premium JET pack. The calculators are estimates with the standard formulas (an instalment, compound interest, an
 * amount at a rate); the rates come from the screen, and the bank's own figures come from its services.
 */
import { ChangeDetectionStrategy, Component, Directive, computed, input, model, output, signal } from '@angular/core';

import { ACCORDION, AccordionBase, Part, ROWS, RowsBase, SEGMENTS, SLIDER, STEPS, SegmentsBase, SliderBase, StepsBase, TIMELINE, TimelineBase } from './g1';
import { FORM, FormBase, THING, ThingBase, money } from './g2';
import { CHECKS, ChecksBase } from './g4';
import { CalcVariant, ChatVariant, LOADING, LocatorVariant, withVariant } from './variant';

/** The monthly instalment of a loan: principal, yearly rate in %, months. */
export function instalment(principal: number, rate: number, months: number): number {
  if (!(principal > 0) || !(months > 0)) { return 0; }
  const r = (rate || 0) / 1200;
  if (r === 0) { return principal / months; }
  const f = (1 + r) ** months;
  return principal * r * f / (f - 1);
}
/** What a deposit is worth at the end: principal, yearly rate in %, months, compounding times a year. */
export function maturity(principal: number, rate: number, months: number, times = 4): number {
  if (!(principal > 0) || !(months > 0)) { return principal || 0; }
  return principal * (1 + (rate || 0) / 100 / times) ** (times * months / 12);
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/* ---------- ComposeMessage ---------- */

/** A message to the bank, with a counter and Send. [(value)], (send). */
@Component({
  selector: 'bx-compose-mail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bx-field bx-compose" [attr.data-testid]="testID() || null">
      <label class="bx-label" [attr.for]="id">{{ label() }}</label>
      <div class="bx-control is-multiline">
        <textarea class="bx-input bx-textarea" rows="5" [id]="id" [value]="value()" [attr.maxlength]="maxLength()" [attr.aria-describedby]="id + '-count'"
                  (input)="value.set($any($event.target).value)"></textarea>
        <span class="bx-counter" [id]="id + '-count'">{{ value().length }} / {{ maxLength() }}</span>
      </div>
      @if (helpText()) { <span class="bx-help">{{ helpText() }}</span> }
      <div class="bx-kv-actions"><button type="button" class="bx-btn bx-btn--callToAction" [disabled]="off()" [attr.aria-busy]="busy() || null" (click)="send.emit(value())">{{ sendLabel() }}</button></div>
    </div>`,
})
export class ComposeMessage extends Part {
  readonly label = input('Message to the bank');
  readonly value = model('');
  readonly maxLength = input(500);
  readonly sendLabel = input('Send');
  readonly busy = input(false);
  readonly helpText = input('');
  readonly send = output<string>();
  protected readonly off = computed(() => !this.value().trim() || this.busy());
}

/* ---------- StatementRequest ---------- */

export interface Period { from: string; to: string }

/** The first and last day, checked when the customer asks (both, in order, within maxDays), then (request). [(value)]. */
@Component({
  selector: 'bx-statement-request',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset [class]="problem() ? 'bx-field bx-period is-error' : 'bx-field bx-period'" [attr.aria-describedby]="problem() ? id + '-err' : null" [attr.data-testid]="testID() || null">
      <legend class="bx-label">{{ label() }}</legend>
      <div class="bx-range">
        <div class="bx-field"><label class="bx-label" [attr.for]="id + '-f'">From</label><div class="bx-control">
          <input type="date" class="bx-input" [id]="id + '-f'" [value]="value().from" [attr.min]="min() || null" [attr.max]="max() || null" (change)="set('from', $event)" /></div></div>
        <div class="bx-field"><label class="bx-label" [attr.for]="id + '-t'">To</label><div class="bx-control">
          <input type="date" class="bx-input" [id]="id + '-t'" [value]="value().to" [attr.min]="min() || null" [attr.max]="max() || null" (change)="set('to', $event)" /></div></div>
      </div>
      @if (problem()) { <span class="bx-error" role="alert" [id]="id + '-err'"><span class="bx-error-icon" aria-hidden="true">!</span>{{ problem() }}</span> }
      <div class="bx-kv-actions"><button type="button" class="bx-btn bx-btn--callToAction" (click)="ask()">{{ actionLabel() }}</button></div>
    </fieldset>`,
})
export class StatementRequest extends Part {
  readonly label = input('Statement period');
  readonly value = model<Period>({ from: '', to: '' });
  readonly min = input('');
  readonly max = input('');
  readonly maxDays = input(0);
  readonly actionLabel = input('Request');
  readonly request = output<Period>();
  protected readonly problem = signal('');
  protected set(which: 'from' | 'to', e: Event): void {
    this.problem.set('');
    this.value.set({ ...this.value(), [which]: (e.target as HTMLInputElement).value });
  }
  protected ask(): void {
    const v = this.value();
    const days = v.from && v.to ? (Date.parse(v.to) - Date.parse(v.from)) / 86400000 : NaN;
    const msg = !v.from || !v.to ? 'Choose the first and the last day.' : days < 0 ? 'The last day is before the first. Swap them.'
      : this.maxDays() && days + 1 > this.maxDays() ? `Choose up to ${this.maxDays()} days.` : '';
    this.problem.set(msg);
    if (!msg) { this.request.emit(v); }
  }
}

/* ---------- calculators ---------- */

export const CALC = `
  <section [class]="css()" [attr.aria-labelledby]="id" [attr.data-testid]="testID() || null">
    <h3 class="bx-card-title" [id]="id">{{ head() }}</h3>
    <div class="bx-calc-fields">
      <div class="bx-field"><label class="bx-label" [attr.for]="id + '-a'">{{ amountLabel() }}</label><div class="bx-control">
        <input type="number" class="bx-input bx-num" inputmode="decimal" min="0" [id]="id + '-a'" [value]="figures().a" (input)="a.set(num($event))" /></div></div>
      @if (!isFx()) {
        <div class="bx-field"><label class="bx-label" [attr.for]="id + '-r'">Rate (% a year)</label><div class="bx-control">
          <input type="number" class="bx-input bx-num" inputmode="decimal" min="0" step="0.05" [id]="id + '-r'" [value]="figures().r" (input)="r.set(num($event))" /></div></div>
        <div class="bx-field"><label class="bx-label" [attr.for]="id + '-m'">Months</label><div class="bx-control">
          <input type="number" class="bx-input bx-num" inputmode="decimal" min="1" step="1" [id]="id + '-m'" [value]="figures().m" (input)="m.set(num($event))" /></div></div>
      }
    </div>
    <div class="bx-calc-result" aria-live="polite"><span class="bx-calc-title">{{ title() }}</span><strong class="bx-calc-main">{{ result().main }}</strong>
      <span class="bx-calc-line">{{ result().line }}</span></div>
    <p class="bx-help">{{ noteText() }}</p>
    @if (actionLabel()) {
      <div class="bx-kv-actions"><button type="button" class="bx-btn bx-btn--callToAction" (click)="action.emit({ amount: figures().a, rate: figures().r, months: figures().m, result: result().value })">{{ actionLabel() }}</button></div>
    }
  </section>`;

@Directive()
export abstract class CalcBase extends Part {
  readonly heading = input<string | undefined>(undefined);
  readonly variant = input<CalcVariant | undefined>(undefined);
  protected readonly css = computed(() => withVariant('bx-card bx-calc', this.variant()));
  readonly currency = input('');
  readonly toCurrency = input('');
  /** Yearly rate in % (loan, deposit), or the exchange rate (fx); leave out for the component's own. */
  readonly rate = input<number | undefined>(undefined);
  readonly amount = input<number | undefined>(undefined);
  readonly months = input<number | undefined>(undefined);
  /** Times a year a deposit's interest is added. */
  readonly compounding = input(4);
  /** Leave out for the component's own. */
  readonly note = input<string | undefined>(undefined);
  readonly actionLabel = input('');
  readonly action = output<{ amount: number; rate: number; months: number; result: number }>();
  protected readonly mode: 'loan' | 'td' | 'fx' = 'loan';
  protected readonly isFx = computed(() => this.mode === 'fx');
  protected readonly defaults: { heading: string; amount: number; rate: number; months: number; note?: string } = { heading: 'Loan calculator', amount: 10000, rate: 9.5, months: 36 };
  protected readonly head = computed(() => this.heading() ?? this.defaults.heading);
  protected readonly noteText = computed(() => this.note() ?? this.defaults.note ?? 'An estimate. The bank confirms the figures when you apply.');
  protected readonly a = signal<number | null>(null);
  protected readonly r = signal<number | null>(null);
  protected readonly m = signal<number | null>(null);
  protected readonly figures = computed(() => ({ a: this.a() ?? this.amount() ?? this.defaults.amount, r: this.r() ?? this.rate() ?? this.defaults.rate,
    m: this.m() ?? this.months() ?? this.defaults.months }));
  protected readonly title = computed(() => (this.mode === 'fx' ? 'You get' : this.mode === 'td' ? 'At maturity' : 'Monthly instalment'));
  protected readonly amountLabel = computed(() => (this.mode === 'fx' ? 'You send' : this.mode === 'td' ? 'Deposit' : 'Loan amount') + (this.currency() ? ` (${this.currency()})` : ''));
  protected readonly result = computed(() => {
    const { a, r, m } = this.figures();
    const cur = this.currency() || undefined;
    if (this.mode === 'fx') { const got = round2(a * r); return { main: money(got, this.toCurrency() || undefined), line: `1 ${this.currency()} = ${r} ${this.toCurrency()}`, value: got }; }
    if (this.mode === 'td') { const end = round2(maturity(a, r, m, this.compounding())); return { main: money(end, cur), line: `Interest ${money(round2(end - a), cur)}`, value: end }; }
    const each = round2(instalment(a, r, m));
    return { main: money(each, cur), line: `Total interest ${money(round2(each * m - a), cur)}`, value: each };
  });
  protected num(e: Event): number { const n = Number((e.target as HTMLInputElement).value); return Number.isFinite(n) ? n : 0; }
}

/** What a deposit is worth at maturity. */
@Component({ selector: 'bx-td-calculator', changeDetection: ChangeDetectionStrategy.OnPush, template: CALC })
export class DepositCalculator extends CalcBase {
  protected override readonly mode: 'loan' | 'td' | 'fx' = 'td';
  protected override readonly defaults = { heading: 'Deposit calculator', amount: 10000, rate: 7, months: 12 };
}
/** The monthly instalment of a loan. */
@Component({ selector: 'bx-loan-calculator', changeDetection: ChangeDetectionStrategy.OnPush, template: CALC })
export class LoanCalculator extends CalcBase {}
/** What an amount is in another currency at today's rate. */
@Component({ selector: 'bx-currency-converter', changeDetection: ChangeDetectionStrategy.OnPush, template: CALC })
export class ForexCalculator extends CalcBase {
  protected override readonly mode: 'loan' | 'td' | 'fx' = 'fx';
  protected override readonly defaults = { heading: 'Currency converter', amount: 1000, rate: 0.92, months: 1,
    note: "An estimate at today's rate. The rate is fixed when you send." };
}

/* ---------- Locator ---------- */

export interface Place { id: string; name: string; type: 'branch' | 'atm'; address?: string; distance?: string; hours?: string }

/** Branches and ATMs near the customer, filtered by kind and name; Directions is the screen's (a map app). */
@Component({
  selector: 'bx-locator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [class]="css()" [attr.aria-labelledby]="id" [attr.data-testid]="testID() || null">
      <h3 class="bx-panel-title" [id]="id">{{ heading() }}</h3>
      <div class="bx-control bx-payee-search"><span class="bx-search-icon" aria-hidden="true"></span>
        <input type="search" class="bx-input bx-search" aria-label="Search by name or area" placeholder="Name or area" [value]="query()" (input)="query.set($any($event.target).value)" /></div>
      <div class="bx-chip-row" role="group" aria-label="Show">
        @for (k of kinds; track k.key) {
          <button type="button" [class]="kind() === k.key ? 'bx-filter-chip is-on' : 'bx-filter-chip'" [attr.aria-pressed]="kind() === k.key" (click)="kind.set(k.key)">{{ k.label }}</button>
        }
      </div>
      @if (loading()) {
        ${LOADING}
      } @else {
        @if (rows().length === 0) { <p class="bx-panel-empty" role="status">{{ emptyText() }}</p> }
        <ul class="bx-rows">
          @for (o of rows(); track o.id) {
            <li class="bx-row">
              <span class="bx-row-main"><strong>{{ o.name }}</strong><span class="bx-row-meta">{{ o.meta }}</span>@if (o.hours) {<span class="bx-row-meta">{{ o.hours }}</span>}</span>
              <button type="button" class="bx-btn bx-btn--borderless bx-btn--sm" [attr.aria-label]="'Directions to ' + o.name" (click)="action.emit(o)">Directions</button>
            </li>
          }
        </ul>
      }
    </section>`,
})
export class Locator extends Part {
  readonly heading = input('Find a branch or ATM');
  readonly items = input<ReadonlyArray<Place>>([]);
  readonly emptyText = input('Nothing matches. Try another name or area.');
  readonly variant = input<LocatorVariant | undefined>(undefined);
  /** Skeleton rows while the screen fetches the places. */
  readonly loading = input(false);
  readonly action = output<Place>();
  protected readonly css = computed(() => withVariant('bx-panel bx-locator', this.variant()));
  protected readonly kinds = [{ key: 'all', label: 'All' }, { key: 'branch', label: 'Branches' }, { key: 'atm', label: 'ATMs' }] as const;
  protected readonly query = signal('');
  protected readonly kind = signal<'all' | 'branch' | 'atm'>('all');
  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.items().filter((o) => (this.kind() === 'all' || o.type === this.kind()) && (!q || `${o.name} ${o.address ?? ''}`.toLowerCase().includes(q)))
      .map((o) => ({ ...o, meta: [o.type === 'atm' ? 'ATM' : 'Branch', o.address, o.distance].filter(Boolean).join(' · ') }));
  });
}

/* ---------- LiveChat ---------- */

export interface ChatMessage { id: string; from: 'customer' | 'agent'; text: string; name?: string; time?: string }

/** A conversation with the bank: new messages are announced (a log), Enter sends. */
@Component({
  selector: 'bx-live-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [class]="css()" [attr.aria-labelledby]="id" [attr.data-testid]="testID() || null">
      <h3 class="bx-panel-title" [id]="id">{{ heading() }}</h3>
      @if (loading()) { ${LOADING} }
      <div class="bx-chat-log" role="log" aria-live="polite" [attr.aria-labelledby]="id">
        @for (m of messages(); track m.id) {
          <div [class]="m.from === 'customer' ? 'bx-msg is-mine' : 'bx-msg'">
            <span class="bx-msg-who">{{ m.from === 'customer' ? 'You' : (m.name || 'The bank') }}@if (m.time) { · {{ m.time }}}</span><span class="bx-msg-text">{{ m.text }}</span>
          </div>
        }
      </div>
      @if (typing()) { <p class="bx-chat-typing" role="status">The bank is writing…</p> }
      <div class="bx-chat-compose">
        <div class="bx-control"><input class="bx-input" [attr.aria-label]="placeholder()" [placeholder]="placeholder()" [value]="draft()" [disabled]="disabled()"
             (input)="draft.set($any($event.target).value)" (keydown.enter)="$event.preventDefault(); go()" /></div>
        <button type="button" class="bx-btn bx-btn--callToAction" [disabled]="off()" (click)="go()">Send</button>
      </div>
    </section>`,
})
export class LiveChat extends Part {
  readonly heading = input('Chat with us');
  readonly messages = input<ReadonlyArray<ChatMessage>>([]);
  readonly typing = input(false);
  readonly disabled = input(false);
  readonly placeholder = input('Write a message');
  readonly variant = input<ChatVariant | undefined>(undefined);
  /** Skeleton lines while the screen fetches the history. */
  readonly loading = input(false);
  readonly send = output<string>();
  protected readonly css = computed(() => withVariant('bx-panel bx-chat', this.variant()));
  protected readonly draft = signal('');
  protected readonly off = computed(() => !this.draft().trim() || this.disabled());
  protected go(): void { if (this.off()) { return; } const t = this.draft().trim(); this.draft.set(''); this.send.emit(t); }
}

/* ---------- FeedbackRating ---------- */

const WORDS = ['', 'Very poor', 'Poor', 'Fine', 'Good', 'Very good'];

/** One to five stars, as radios, and the word for what was chosen. [(value)]. */
@Component({
  selector: 'bx-feedback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="bx-field bx-rating" [attr.data-testid]="testID() || null">
      <legend class="bx-label">{{ label() }}</legend>
      <div class="bx-stars">
        @for (s of stars(); track s.i) {
          <label [class]="s.i <= value() ? 'bx-star is-on' : 'bx-star'">
            <input type="radio" class="bx-visually-hidden" [name]="id" [checked]="s.i === value()" (change)="value.set(s.i)" />
            <span aria-hidden="true">★</span><span class="bx-visually-hidden">{{ s.label }}</span>
          </label>
        }
        @if (word()) { <span class="bx-rating-word" aria-hidden="true">{{ word() }}</span> }
      </div>
    </fieldset>`,
})
export class FeedbackRating extends Part {
  readonly label = input('How was it?');
  readonly value = model(0);
  protected readonly stars = computed(() => [1, 2, 3, 4, 5].map((i) => ({ i, label: `${i} ${i === 1 ? 'star' : 'stars'}, ${WORDS[i]}` })));
  protected readonly word = computed(() => WORDS[this.value()] || '');
}

/* ---------- reused kinds ---------- */

/** The fields of a service request and Raise. */
@Component({ selector: 'bx-raise-request', changeDetection: ChangeDetectionStrategy.OnPush, template: FORM })
export class RaiseRequest extends FormBase { protected override readonly defaults = { heading: 'Raise a request', submitLabel: 'Raise request' }; }
/** Where a service request is. */
@Component({ selector: 'bx-track-requests', changeDetection: ChangeDetectionStrategy.OnPush, template: TIMELINE })
export class TrackRequests extends TimelineBase { protected override readonly defaultLabel = 'Your request'; }
/** Where an application is. */
@Component({ selector: 'bx-application-tracker', changeDetection: ChangeDetectionStrategy.OnPush, template: TIMELINE })
export class ApplicationTracker extends TimelineBase { protected override readonly defaultLabel = 'Your application'; }
/** Messages from the bank, each to open. */
@Component({ selector: 'bx-mailbox', changeDetection: ChangeDetectionStrategy.OnPush, template: ROWS })
export class Mailbox extends RowsBase { protected override readonly defaults = { heading: 'Messages', actionLabel: 'Open' }; }
/** Receipts to download. */
@Component({ selector: 'bx-e-receipts', changeDetection: ChangeDetectionStrategy.OnPush, template: ROWS })
export class EReceipts extends RowsBase { protected override readonly defaults = { heading: 'E-receipts', actionLabel: 'Download' }; }
/** Certificates to download. */
@Component({ selector: 'bx-certificates', changeDetection: ChangeDetectionStrategy.OnPush, template: ROWS })
export class Certificates extends RowsBase { protected override readonly defaults = { heading: 'Certificates', actionLabel: 'Download' }; }
/** Nominees on an account, each to edit. */
@Component({ selector: 'bx-nominations', changeDetection: ChangeDetectionStrategy.OnPush, template: ROWS })
export class Nominations extends RowsBase { protected override readonly defaults = { heading: 'Nominees', actionLabel: 'Edit' }; }
/** The statement's file format. [(value)]. */
@Component({ selector: 'bx-statement-format', changeDetection: ChangeDetectionStrategy.OnPush, template: SEGMENTS })
export class StatementFormat extends SegmentsBase { protected override readonly defaults = { label: 'Format', options: ['PDF', 'CSV', 'Both'] }; }
/** The steps of registering online. */
@Component({ selector: 'bx-self-register', changeDetection: ChangeDetectionStrategy.OnPush, template: STEPS })
export class SelfRegister extends StepsBase {
  protected override readonly defaultLabel = 'Register';
  protected override readonly defaultSteps = ['Details', 'Verify', 'Password', 'Done'];
}
/** The steps of the FATCA and CRS self-certification. */
@Component({ selector: 'bx-fatca-crs', changeDetection: ChangeDetectionStrategy.OnPush, template: STEPS })
export class TaxSelfCertification extends StepsBase {
  protected override readonly defaultLabel = 'Tax self-certification';
  protected override readonly defaultSteps = ['Identity', 'Tax residency', 'Declaration', 'Review'];
}
/** A product with what it offers and Apply. */
@Component({ selector: 'bx-product-showcase', changeDetection: ChangeDetectionStrategy.OnPush, template: THING })
export class ProductCard extends ThingBase { protected override readonly defaultAction = 'Apply now'; }
/** The terms and other consents, as checkboxes. [(value)]. */
@Component({ selector: 'bx-terms-consent', changeDetection: ChangeDetectionStrategy.OnPush, template: CHECKS })
export class TermsConsent extends ChecksBase {
  protected override readonly defaultLabel = 'Before you continue';
  protected override readonly defaultControl = 'checkbox' as const;
}
/** The income the customer earns, for an eligibility check. [(value)]. */
@Component({ selector: 'bx-eligibility-calculator', changeDetection: ChangeDetectionStrategy.OnPush, template: SLIDER })
export class EligibilityCalculator extends SliderBase { protected override readonly defaults = { label: 'Monthly income', max: 20000, step: 500 }; }
/** How much to save each month for a goal. [(value)]. */
@Component({ selector: 'bx-goal-calculator', changeDetection: ChangeDetectionStrategy.OnPush, template: SLIDER })
export class GoalCalculator extends SliderBase { protected override readonly defaults = { label: 'Saving each month', max: 5000, step: 50 }; }
/** Questions and answers. [(expanded)]. */
@Component({ selector: 'bx-faq', changeDetection: ChangeDetectionStrategy.OnPush, template: ACCORDION })
export class Faq extends AccordionBase {}

/** Group 5's components, for a screen's imports. */
export const G5_COMPONENTS = [RaiseRequest, TrackRequests, Mailbox, ComposeMessage, EReceipts, Certificates, StatementRequest, StatementFormat, SelfRegister, TaxSelfCertification,
  ProductCard, ApplicationTracker, TermsConsent, EligibilityCalculator, DepositCalculator, GoalCalculator, Locator, LiveChat, FeedbackRating, Nominations, Faq, LoanCalculator,
  ForexCalculator] as const;
