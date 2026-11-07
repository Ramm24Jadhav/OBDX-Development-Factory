/*
 * Group 2 (accounts, payments, deposits), the same markup and bx- classes as bx-g2.js in the premium JET pack.
 * No business logic and nothing kept: amounts, balances and masked numbers come from the screen; an amount shows the
 * decimals of its currency; the IBAN check is the ISO 13616 checksum only.
 */
import { ChangeDetectionStrategy, Component, Directive, computed, forwardRef, input, model, output, signal } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';

import { Dropdown } from './dropdown';
import { FieldBase, FieldShell } from './field';
import { CHIPS, ChipsBase, Part, ROWS, RowsBase, SEGMENTS, STEPS, SegmentsBase, StepsBase, initials } from './g1';
import { decimalsOf } from './text-field';
import { BalanceVariant, FormVariant, LOADING, PayeesVariant, ReceiptVariant, TxListVariant, withVariant } from './variant';

/** An amount with its currency's decimals and the code after it; text is shown as given. */
export function money(amount: number | string | null | undefined, currency?: string): string {
  if (amount === null || amount === undefined || amount === '') { return ''; }
  if (typeof amount !== 'number') { return amount; }
  const d = decimalsOf(currency);
  return amount.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) + (currency ? ` ${currency}` : '');
}

/** The ISO 13616 checksum of an IBAN (spaces ignored): true when it is well formed. */
export function ibanValid(text: string): boolean {
  const s = (text || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) { return false; }
  let rest = 0;
  for (const c of s.slice(4) + s.slice(0, 4)) {
    for (const d of c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c) { rest = (rest * 10 + Number(d)) % 97; }
  }
  return rest === 1;
}
export const ibanGroups = (text: string): string => (text || '').replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();

export interface Detail { label: string; value: string; total?: boolean }
export interface AccountOption { value: string; label: string; meta?: string; disabled?: boolean }

/** A heading and an action label of the component's own, which the screen can replace. */
@Directive()
export abstract class Titled extends Part {
  readonly heading = input<string | undefined>(undefined);
  readonly actionLabel = input<string | undefined>(undefined);
  protected readonly defaults: { heading?: string; actionLabel?: string } = {};
  protected readonly head = computed(() => this.heading() ?? this.defaults.heading ?? '');
  protected readonly act = computed(() => this.actionLabel() ?? this.defaults.actionLabel ?? '');
}

/* ---------- AccountSelector ---------- */

export const PICKER = `<bx-select [testID]="testID()" [label]="name()" [options]="options()" [(value)]="value" [helpText]="help()" [required]="required()"
  [disabled]="disabled()" [placeholder]="placeholder()" [error]="error()" />`;

@Directive()
export abstract class PickerBase extends Part {
  /** Leave out for the component's own label. */
  readonly label = input<string | undefined>(undefined);
  readonly options = input<ReadonlyArray<AccountOption>>([]);
  readonly value = model<string>('');
  readonly required = input(false);
  readonly disabled = input(false);
  readonly placeholder = input('');
  readonly helpText = input('');
  readonly error = input('');
  protected readonly defaultLabel: string = '';
  protected readonly name = computed(() => this.label() ?? this.defaultLabel);
  protected readonly help = computed(() => this.helpText() || this.options().find((o) => o.value === this.value())?.meta || '');
}

/** Choose an account (oj-select-single); the chosen one's detail, such as its available balance, is the help line. [(value)]. */
@Component({ selector: 'bx-account-picker', changeDetection: ChangeDetectionStrategy.OnPush, imports: [Dropdown], template: PICKER })
export class AccountSelector extends PickerBase { protected override readonly defaultLabel = 'From account'; }

/* ---------- tiles ---------- */

export interface Tile { id?: string; label: string; value: string; meta?: string; tone?: 'danger' | 'success' }

export const TILES = `
  <section class="bx-tiles-wrap" [attr.aria-label]="head() || null" [attr.data-testid]="testID() || null">
    @if (head()) { <h3 class="bx-panel-title">{{ head() }}</h3> }
    <ul class="bx-tiles">
      @for (o of items(); track $index) {
        <li>
          @if (clickable()) {
            <button type="button" [class]="tileClass(o) + ' is-interactive'" (click)="action.emit(o)">
              <span class="bx-tile-label">{{ o.label }}</span><span class="bx-tile-value">{{ o.value }}</span>@if (o.meta) {<span class="bx-tile-meta">{{ o.meta }}</span>}
            </button>
          } @else {
            <div [class]="tileClass(o)">
              <span class="bx-tile-label">{{ o.label }}</span><span class="bx-tile-value">{{ o.value }}</span>@if (o.meta) {<span class="bx-tile-meta">{{ o.meta }}</span>}
            </div>
          }
        </li>
      }
    </ul>
  </section>`;

@Directive()
export abstract class TilesBase extends Titled {
  readonly items = input<ReadonlyArray<Tile>>([]);
  /** Each tile is a button that opens it. */
  readonly interactive = input<boolean | undefined>(undefined);
  protected readonly defaultInteractive: boolean = true;
  protected readonly clickable = computed(() => this.interactive() ?? this.defaultInteractive);
  readonly action = output<Tile>();
  protected tileClass(o: Tile): string { return 'bx-tile' + (o.tone ? ` is-${o.tone}` : ''); }
}

/** Each account type with its total; pick one for detail. */
@Component({ selector: 'bx-account-summary', changeDetection: ChangeDetectionStrategy.OnPush, template: TILES })
export class AccountSummary extends TilesBase { protected override readonly defaults = { heading: 'Your accounts' }; }
/** The deposits, their interest and the next maturity. */
@Component({ selector: 'bx-td-summary', changeDetection: ChangeDetectionStrategy.OnPush, template: TILES })
export class DepositsSummary extends TilesBase { protected override readonly defaults = { heading: 'Deposits' }; }

/* ---------- AccountBalance ---------- */

/** An account's balance in its currency, hidden on request. [(amountHidden)]. */
@Component({
  selector: 'bx-balance-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [class]="css()" [attr.aria-labelledby]="id" [attr.data-testid]="testID() || null">
      <div class="bx-balance-head">
        <h3 class="bx-balance-label" [id]="id">{{ label() }}</h3>
        @if (hideable() && !loading()) {
          <button type="button" class="bx-reveal" [attr.aria-pressed]="!amountHidden()" (click)="amountHidden.set(!amountHidden())">{{ amountHidden() ? 'Show balance' : 'Hide balance' }}</button>
        }
      </div>
      @if (loading()) {
        ${LOADING}
      } @else {
        <p class="bx-balance-amount">{{ amountHidden() ? '••••••' : shown() }}</p>
        @if (meta() && !amountHidden()) { <p class="bx-balance-meta">{{ meta() }}</p> }
      }
    </section>`,
})
export class AccountBalance extends Part {
  readonly label = input.required<string>();
  readonly amount = input<number | string>('');
  readonly currency = input('');
  readonly meta = input('');
  readonly hideable = input(true);
  /** The amount is hidden: [(amountHidden)]. */
  readonly amountHidden = model(false);
  readonly variant = input<BalanceVariant | undefined>(undefined);
  /** A skeleton in place of the amount while the screen fetches it. */
  readonly loading = input(false);
  protected readonly css = computed(() => withVariant('bx-balance', this.variant()));
  protected readonly shown = computed(() => money(this.amount(), this.currency() || undefined));
}

/* ---------- cards ---------- */

export const THING = `
  <article class="bx-card bx-thing" [attr.aria-labelledby]="id" [attr.data-testid]="testID() || null">
    <div class="bx-thing-head"><h3 class="bx-card-title" [id]="id">{{ heading() }}</h3>@if (badge()) {<span class="bx-badge is-info">{{ badge() }}</span>}</div>
    @if (text()) { <p class="bx-thing-text">{{ text() }}</p> }
    <ng-content />
    @if (act()) { <button type="button" class="bx-thing-action" [attr.aria-label]="actionName()" (click)="action.emit()">{{ act() }}</button> }
  </article>`;

@Directive()
export abstract class ThingBase extends Part {
  readonly heading = input.required<string>();
  readonly text = input('');
  readonly badge = input('');
  readonly actionLabel = input<string | undefined>(undefined);
  readonly action = output<void>();
  protected readonly defaultAction: string = '';
  protected readonly act = computed(() => this.actionLabel() ?? this.defaultAction);
  protected readonly actionName = computed(() => `${this.act().replace(/\s*→$/, '')}: ${this.heading()}`);
}

/** An account with its balance and a link to its detail. */
@Component({ selector: 'bx-account-card', changeDetection: ChangeDetectionStrategy.OnPush, template: THING })
export class AccountCard extends ThingBase { protected override readonly defaultAction = 'View details'; }
/** A payee with their bank and a way to pay them. */
@Component({ selector: 'bx-beneficiary-card', changeDetection: ChangeDetectionStrategy.OnPush, template: THING })
export class BeneficiaryCard extends ThingBase { protected override readonly defaultAction = 'Pay now'; }

/* ---------- details ---------- */

export const DETAILS = `
  <section class="bx-panel bx-kv" [attr.aria-label]="head() || null" [attr.data-testid]="testID() || null">
    @if (head()) { <h3 class="bx-panel-title">{{ head() }}</h3> }
    <dl class="bx-kv-list">
      @for (o of items(); track $index) { <div [class]="o.total ? 'bx-kv-row is-total' : 'bx-kv-row'"><dt>{{ o.label }}</dt><dd>{{ o.value }}</dd></div> }
    </dl>
    @if (act()) {
      <div class="bx-kv-actions"><button type="button" class="bx-btn bx-btn--callToAction" [disabled]="busy()" [attr.aria-busy]="busy() || null" (click)="action.emit()">{{ act() }}</button></div>
    }
  </section>`;

@Directive()
export abstract class DetailsBase extends Titled {
  readonly items = input<ReadonlyArray<Detail>>([]);
  readonly busy = input(false);
  readonly action = output<void>();
}

/** An account's details, such as its branch and IBAN. */
@Component({ selector: 'bx-account-details', changeDetection: ChangeDetectionStrategy.OnPush, template: DETAILS })
export class AccountDetails extends DetailsBase { protected override readonly defaults = { heading: 'Account details' }; }
/** A transfer to check before it goes. */
@Component({ selector: 'bx-transfer-summary', changeDetection: ChangeDetectionStrategy.OnPush, template: DETAILS })
export class TransferSummary extends DetailsBase { protected override readonly defaults = { heading: 'Check the transfer', actionLabel: 'Confirm transfer' }; }
/** One transaction in full. */
@Component({ selector: 'bx-transaction-details', changeDetection: ChangeDetectionStrategy.OnPush, template: DETAILS })
export class TransactionDetails extends DetailsBase { protected override readonly defaults = { heading: 'Transaction' }; }
/** Adding money to a deposit. */
@Component({ selector: 'bx-td-topup', changeDetection: ChangeDetectionStrategy.OnPush, template: DETAILS })
export class DepositTopUp extends DetailsBase { protected override readonly defaults = { heading: 'Top up the deposit', actionLabel: 'Top up' }; }
/** Closing a deposit early, with what the customer receives. */
@Component({ selector: 'bx-td-redemption', changeDetection: ChangeDetectionStrategy.OnPush, template: DETAILS })
export class DepositRedemption extends DetailsBase { protected override readonly defaults = { heading: 'Redeem the deposit', actionLabel: 'Redeem' }; }

/* ---------- AccountNumber (IBAN) ---------- */

/** An account number in groups of four, checked with the ISO checksum when the customer leaves it; the value has no spaces. */
@Component({
  selector: 'bx-iban',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldShell],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => AccountNumber), multi: true }],
  template: `
    <bx-field-shell [field]="this">
      <input class="bx-input bx-mono" [id]="id" [attr.data-testid]="testID() ? testID() + '-input' : null" [value]="typed() ?? groups()" [attr.placeholder]="placeholder() || null"
             [disabled]="isDisabled()" [readOnly]="readOnly()" autocomplete="off" spellcheck="false" autocapitalize="characters" [attr.aria-required]="required() || null"
             [attr.aria-invalid]="message() ? true : null" [attr.aria-describedby]="describedBy()" (focus)="focus()" (blur)="leave()" (input)="typed.set($any($event.target).value)" />
      @if (ok() && !message()) { <span class="bx-check-mark" aria-hidden="true">✓</span> }
    </bx-field-shell>`,
})
export class AccountNumber extends FieldBase<string> {
  protected readonly typed = signal<string | null>(null);
  protected readonly groups = computed(() => ibanGroups(this.value() ?? ''));
  protected readonly ok = computed(() => !!this.value() && ibanValid(this.value() ?? ''));
  protected leave(): void {
    this.blur();
    const t = this.typed();
    if (t === null) { return; }
    const s = t.replace(/\s+/g, '').toUpperCase();
    this.typed.set(null);
    if (s && !ibanValid(s)) { this.own.set('Check the IBAN: it starts with the country code, for example GB29 NWBK 6016 1331 9268 19.'); return; }
    this.own.set('');
    this.change(s);
  }
}

/* ---------- BeneficiarySelector (payee list) ---------- */

export interface Payee { id: string; name: string; meta?: string }

/** The saved payees, found by name, picked to pay. */
@Component({
  selector: 'bx-payee-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [class]="css()" [attr.aria-labelledby]="id" [attr.data-testid]="testID() || null">
      <h3 class="bx-panel-title" [id]="id">{{ heading() }}</h3>
      @if (searchable() && !loading()) {
        <div class="bx-control bx-payee-search"><span class="bx-search-icon" aria-hidden="true"></span>
          <input type="search" class="bx-input bx-search" [attr.aria-label]="'Search ' + heading()" placeholder="Name" [value]="query()" (input)="query.set($any($event.target).value)" /></div>
      }
      @if (loading()) {
        ${LOADING}
      } @else {
        @if (rows().length === 0) { <p class="bx-panel-empty" role="status">{{ emptyText() }}</p> }
        <ul class="bx-rows">
          @for (o of rows(); track o.id) {
            <li class="bx-row">
              <button type="button" class="bx-payee" (click)="action.emit(o)">
                @if (variant() !== 'compact') { <span class="bx-avatar is-sm" aria-hidden="true">{{ o.initials }}</span> }
                <span class="bx-row-main"><strong>{{ o.name }}</strong>@if (o.meta) {<span class="bx-row-meta">{{ o.meta }}</span>}</span>
              </button>
            </li>
          }
        </ul>
      }
    </section>`,
})
export class BeneficiarySelector extends Part {
  readonly heading = input('Payees');
  readonly items = input<ReadonlyArray<Payee>>([]);
  readonly searchable = input(true);
  readonly emptyText = input('No payees match.');
  readonly variant = input<PayeesVariant | undefined>(undefined);
  /** Skeleton rows while the screen fetches the payees. */
  readonly loading = input(false);
  readonly action = output<Payee>();
  protected readonly css = computed(() => withVariant('bx-panel bx-payees', this.variant()));
  protected readonly query = signal('');
  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.items().filter((o) => !q || o.name.toLowerCase().includes(q)).map((o) => ({ ...o, initials: initials(o.name) }));
  });
}

/* ---------- forms ---------- */

export const FORM = `
  <section [class]="css()" [attr.aria-labelledby]="id" [attr.data-testid]="testID() || null">
    <h3 class="bx-card-title" [id]="id">{{ head() }}</h3>
    <div class="bx-form-body"><ng-content /></div>
    @if (items().length) {
      <dl class="bx-kv-list">@for (o of items(); track $index) { <div class="bx-kv-row"><dt>{{ o.label }}</dt><dd>{{ o.value }}</dd></div> }</dl>
    }
    <div class="bx-kv-actions">
      @if (cancelLabel()) { <button type="button" class="bx-btn bx-btn--borderless" (click)="cancelled.emit()">{{ cancelLabel() }}</button> }
      <button type="button" class="bx-btn bx-btn--callToAction" [disabled]="busy()" [attr.aria-busy]="busy() || null" (click)="submitted.emit()">{{ submit() }}</button>
    </div>
  </section>`;

@Directive()
export abstract class FormBase extends Part {
  readonly heading = input<string | undefined>(undefined);
  /** A summary under the fields. */
  readonly items = input<ReadonlyArray<Detail>>([]);
  readonly submitLabel = input<string | undefined>(undefined);
  readonly cancelLabel = input('');
  readonly busy = input(false);
  readonly variant = input<FormVariant | undefined>(undefined);
  readonly submitted = output<void>();
  protected readonly css = computed(() => withVariant('bx-card bx-form', this.variant()));
  readonly cancelled = output<void>();
  protected readonly defaults: { heading: string; submitLabel: string } = { heading: '', submitLabel: 'Continue' };
  protected readonly head = computed(() => this.heading() ?? this.defaults.heading);
  protected readonly submit = computed(() => this.submitLabel() ?? this.defaults.submitLabel);
}

/** The fields of a payment (in the default slot) and Review. Checks and the service call are the screen's. */
@Component({ selector: 'bx-payment-form', changeDetection: ChangeDetectionStrategy.OnPush, template: FORM })
export class PaymentForm extends FormBase { protected override readonly defaults = { heading: 'Payment', submitLabel: 'Review payment' }; }
/** The fields of a new deposit and Review. */
@Component({ selector: 'bx-new-td', changeDetection: ChangeDetectionStrategy.OnPush, template: FORM })
export class NewDepositForm extends FormBase { protected override readonly defaults = { heading: 'New deposit', submitLabel: 'Review deposit' }; }

/* ---------- TransactionHistory ---------- */

export interface Transaction { id: string; description: string; date?: string; meta?: string; amount: number | string; currency?: string }

export const TRANSACTIONS = `
    <section [class]="css()" [attr.aria-labelledby]="id" [attr.data-testid]="testID() || null">
      <h3 class="bx-panel-title" [id]="id">{{ head() }}</h3>
      @if (loading()) { ${LOADING} } @else if (rows().length === 0) { <p class="bx-panel-empty">{{ emptyText() }}</p> }
      @if (!loading()) {
      <ul class="bx-rows">
        @for (o of rows(); track o.item.id) {
          <li class="bx-row">
            @if (interactive()) {
              <button type="button" class="bx-payee bx-tx" (click)="action.emit(o.item)">
                @if (variant() !== 'compact') { <span class="bx-avatar is-sm" aria-hidden="true">{{ o.initials }}</span> }
                <span class="bx-row-main"><strong>{{ o.item.description }}</strong>@if (o.meta) {<span class="bx-row-meta">{{ o.meta }}</span>}</span>
                <span [class]="o.css"><span class="bx-visually-hidden">{{ o.direction }}</span>{{ o.shown }}</span>
              </button>
            } @else {
              <div class="bx-payee bx-tx">
                @if (variant() !== 'compact') { <span class="bx-avatar is-sm" aria-hidden="true">{{ o.initials }}</span> }
                <span class="bx-row-main"><strong>{{ o.item.description }}</strong>@if (o.meta) {<span class="bx-row-meta">{{ o.meta }}</span>}</span>
                <span [class]="o.css"><span class="bx-visually-hidden">{{ o.direction }}</span>{{ o.shown }}</span>
              </div>
            }
          </li>
        }
      </ul>
      }
    </section>`;

/** What came in and went out; money in is green with a plus, and a screen reader says which. */
@Component({ selector: 'bx-transaction-list', changeDetection: ChangeDetectionStrategy.OnPush, template: TRANSACTIONS })
export class TransactionHistory extends Part {
  /** Leave out for the component's own heading. */
  readonly heading = input<string | undefined>(undefined);
  protected readonly defaultHeading: string = 'Transactions';
  protected readonly head = computed(() => this.heading() ?? this.defaultHeading);
  readonly items = input<ReadonlyArray<Transaction>>([]);
  readonly currency = input('');
  readonly interactive = input(true);
  readonly emptyText = input('No transactions in this period.');
  readonly variant = input<TxListVariant | undefined>(undefined);
  /** Skeleton rows while the screen fetches the transactions. */
  readonly loading = input(false);
  readonly action = output<Transaction>();
  protected readonly css = computed(() => withVariant('bx-panel bx-txlist', this.variant()));
  protected readonly rows = computed(() => this.items().map((item) => {
    const n = typeof item.amount === 'number' ? item.amount : Number(String(item.amount).replace(/[^\d.-]/g, ''));
    const shown = typeof item.amount === 'number' ? (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n), item.currency ?? (this.currency() || undefined)) : item.amount;
    return { item, shown, meta: [item.date, item.meta].filter(Boolean).join(' · '), initials: initials(item.description), css: 'bx-tx-amount' + (n > 0 ? ' is-in' : ''),
      direction: n > 0 ? 'Money in' : n < 0 ? 'Money out' : '' };
  }));
}

/* ---------- TransactionReceipt ---------- */

/** Done: the amount, the reference, the details and what to do with it (the actions in the default slot). */
@Component({
  selector: 'bx-receipt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [class]="css()" [attr.aria-labelledby]="id" [attr.data-testid]="testID() || null">
      <span class="bx-receipt-mark" aria-hidden="true">✓</span>
      <h3 class="bx-receipt-title" [id]="id">{{ heading() }}</h3>
      @if (shown()) { <p class="bx-receipt-amount">{{ shown() }}</p> }
      @if (reference()) { <p class="bx-receipt-ref">Reference <span class="bx-mono">{{ reference() }}</span></p> }
      @if (items().length) {
        <dl class="bx-kv-list">@for (o of items(); track $index) { <div class="bx-kv-row"><dt>{{ o.label }}</dt><dd>{{ o.value }}</dd></div> }</dl>
      }
      <div class="bx-kv-actions"><ng-content /></div>
    </section>`,
})
export class TransactionReceipt extends Part {
  readonly heading = input('Payment sent');
  readonly amount = input<number | string>('');
  readonly currency = input('');
  readonly items = input<ReadonlyArray<Detail>>([]);
  readonly reference = input('');
  readonly variant = input<ReceiptVariant | undefined>(undefined);
  protected readonly css = computed(() => withVariant('bx-card bx-receipt', this.variant()));
  protected readonly shown = computed(() => money(this.amount(), this.currency() || undefined));
}

/* ---------- choice cards ---------- */

export interface ChoiceOption { value: string; label: string; meta?: string; disabled?: boolean }

export const CHOICE = `
  <fieldset class="bx-field" [attr.data-testid]="testID() || null">
    <legend class="bx-label">{{ legend() }}@if (required()) {<span class="bx-req" aria-hidden="true"> *</span>}</legend>
    <div class="bx-choices">
      @for (o of rows(); track o.value; let i = $index) {
        <label [class]="o.css">
          <input type="radio" class="bx-choice-input" [id]="id + '-' + i" [name]="id" [checked]="o.on" [disabled]="!!o.disabled" (change)="value.set(o.value)" />
          <span class="bx-choice-mark" aria-hidden="true"></span>
          <span class="bx-choice-text"><span class="bx-choice-label">{{ o.label }}</span>@if (o.meta) {<span class="bx-choice-meta">{{ o.meta }}</span>}</span>
        </label>
      }
    </div>
  </fieldset>`;

@Directive()
export abstract class ChoiceBase extends Part {
  readonly label = input<string | undefined>(undefined);
  readonly options = input<ReadonlyArray<string | ChoiceOption>>([]);
  readonly value = model('');
  readonly required = input(false);
  protected readonly defaultLabel: string = '';
  protected readonly legend = computed(() => this.label() ?? this.defaultLabel);
  protected readonly rows = computed(() => this.options().map((x) => {
    const o: ChoiceOption = typeof x === 'string' ? { value: x, label: x } : x;
    const on = o.value === this.value();
    return { ...o, on, css: 'bx-choice' + (on ? ' is-on' : '') + (o.disabled ? ' is-disabled' : '') };
  }));
}

/** What happens to a deposit when it matures. [(value)]. */
@Component({ selector: 'bx-maturity-instructions', changeDetection: ChangeDetectionStrategy.OnPush, template: CHOICE })
export class MaturityInstructions extends ChoiceBase { protected override readonly defaultLabel = 'At maturity'; }

/* ---------- reused kinds ---------- */

/** Where a payment is. */
@Component({ selector: 'bx-payment-status', changeDetection: ChangeDetectionStrategy.OnPush, template: STEPS })
export class PaymentStatus extends StepsBase { protected override readonly defaultLabel = 'Payment status'; }
/** What kind of transactions to show. [(value)]. */
@Component({ selector: 'bx-transaction-filter', changeDetection: ChangeDetectionStrategy.OnPush, template: CHIPS })
export class TransactionFilter extends ChipsBase { protected override readonly defaultLabel = 'Show'; }
/** How often a payment goes. [(value)]. */
@Component({ selector: 'bx-repeat', changeDetection: ChangeDetectionStrategy.OnPush, template: SEGMENTS })
export class PaymentSchedule extends SegmentsBase { protected override readonly defaults = { label: 'Repeat', options: ['Once', 'Weekly', 'Monthly'] }; }
/** Bills due soon, each with Pay. */
@Component({ selector: 'bx-upcoming-bills', changeDetection: ChangeDetectionStrategy.OnPush, template: ROWS })
export class UpcomingBills extends RowsBase { protected override readonly defaults = { heading: 'Upcoming bills', actionLabel: 'Pay', emptyText: 'No bills due.' }; }

/* ---------- quick actions ---------- */

export interface QuickItem { id: string; label: string; icon?: string }

export const QUICK = `
  <nav class="bx-quick" [attr.aria-label]="name()" [attr.data-testid]="testID() || null">
    <ul>
      @for (o of items(); track o.id) {
        <li><button type="button" class="bx-quick-item" (click)="action.emit(o.id)"><span class="bx-quick-icon" aria-hidden="true">{{ o.icon || '•' }}</span><span>{{ o.label }}</span></button></li>
      }
    </ul>
  </nav>`;

@Directive()
export abstract class QuickBase extends Part {
  /** Names the shortcuts; leave out for the component's own. */
  readonly label = input<string | undefined>(undefined);
  readonly items = input<ReadonlyArray<QuickItem>>([]);
  readonly action = output<string>();
  protected readonly defaultLabel: string = 'Quick actions';
  protected readonly name = computed(() => this.label() ?? this.defaultLabel);
}

/** Shortcuts as tiles of an icon and a word. */
@Component({ selector: 'bx-quick-actions', changeDetection: ChangeDetectionStrategy.OnPush, template: QUICK })
export class QuickActions extends QuickBase {}

/** Group 2's components, for a screen's imports. */
export const G2_COMPONENTS = [AccountSelector, AccountSummary, AccountBalance, AccountCard, AccountDetails, AccountNumber, BeneficiarySelector, BeneficiaryCard, PaymentForm,
  TransferSummary, PaymentStatus, TransactionHistory, TransactionFilter, TransactionDetails, TransactionReceipt, DepositsSummary, NewDepositForm, MaturityInstructions,
  DepositTopUp, DepositRedemption, QuickActions, PaymentSchedule, UpcomingBills] as const;

