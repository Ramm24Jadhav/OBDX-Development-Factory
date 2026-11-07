/*
 * Group 3 (loans, cards, security), the same markup and bx- classes as bx-g3.js in the premium JET pack.
 * Nothing secret is kept: a code lives only in the field until the screen takes it, a card number is shown masked (the
 * last four digits); the screen talks to the device and the bank.
 */
import { ChangeDetectionStrategy, Component, DestroyRef, Directive, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';

import { Dialog } from './dialog';
import { FieldMessage } from './field';
import { ALERT, AlertBase, Part, ROWS, RowsBase, SEGMENTS, SLIDER, STEPS, SegmentsBase, Severity, SliderBase, StepsBase, TIMELINE, TimelineBase } from './g1';
import { DETAILS, DetailsBase, FORM, FormBase, TILES, TilesBase } from './g2';
import { TimeoutVariant, ringOffset, vx } from './variants';

/** The last four digits behind dots, as banks show a card or account number. */
export function masked(number: string): string {
  const d = (number || '').replace(/\D/g, '');
  return d ? `•••• ${d.slice(-4)}` : '';
}

/* ---------- RepaymentSchedule ---------- */

export interface ScheduleColumn { field: string; headerText: string; align?: 'start' | 'end' }

/** A table of dates and amounts; a row's status (due, overdue, paid) marks it. */
@Component({
  selector: 'bx-loan-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bx-grid-wrap" [attr.data-testid]="testID() || null">
      <table class="bx-grid">
        <caption>{{ caption() }}</caption>
        <thead><tr>@for (c of columns(); track c.field) { <th scope="col" [class]="c.align === 'end' ? 'bx-th is-end' : 'bx-th'">{{ c.headerText }}</th> }</tr></thead>
        <tbody>
          @for (r of rows(); track $index) {
            <tr [class]="r['status'] ? 'bx-tr is-' + r['status'] : 'bx-tr'">
              @for (c of columns(); track c.field) { <td [class]="c.align === 'end' ? 'bx-td is-end' : 'bx-td'">{{ r[c.field] ?? '' }}</td> }
            </tr>
          }
        </tbody>
      </table>
    </div>`,
})
export class RepaymentSchedule extends Part {
  readonly caption = input('Repayment schedule');
  readonly columns = input<ReadonlyArray<ScheduleColumn>>([{ field: 'date', headerText: 'Due date' }, { field: 'amount', headerText: 'Instalment', align: 'end' }]);
  readonly rows = input<ReadonlyArray<Record<string, string | number | undefined>>>([]);
}

/* ---------- codes ---------- */

export const CODE = `
  <div [class]="fieldClass()" [attr.data-testid]="testID() || null">
    <label class="bx-label" [attr.for]="id">{{ name() }}</label>
    <div class="bx-slots">
      <input class="bx-code-input" [id]="id" [type]="dots() ? 'password' : 'text'" [value]="value()" [attr.maxlength]="size()" inputmode="numeric"
             [attr.autocomplete]="dots() ? 'off' : 'one-time-code'" [disabled]="disabled()" spellcheck="false" [attr.aria-required]="required() || null"
             [attr.aria-invalid]="message() ? true : null" [attr.aria-describedby]="describedBy()" (focus)="focused.set(true)" (blur)="focused.set(false); touched.set(true)"
             (input)="type($event)" />
      @for (s of slots(); track $index) { <span [class]="s.css" aria-hidden="true">{{ s.ch }}</span> }
    </div>
    <bx-field-message [id]="id" [error]="message()" [helpText]="helpText()" />
    @if (act()) { <button type="button" class="bx-alert-action bx-code-action" (click)="action.emit()">{{ act() }}</button> }
  </div>`;

/** A code or PIN in slots: one input (so pasting and the phone's code suggestion work), digits only. [(value)], (completed). */
@Directive()
export abstract class CodeBase extends Part {
  /** Leave out for the component's own label, length, dots and action. */
  readonly label = input<string | undefined>(undefined);
  readonly value = model('');
  readonly length = input<number | undefined>(undefined);
  /** Dots instead of digits (a PIN). */
  readonly masked = input<boolean | undefined>(undefined);
  readonly required = input(false);
  readonly disabled = input(false);
  readonly helpText = input('');
  readonly error = input('');
  readonly actionLabel = input<string | undefined>(undefined);
  readonly completed = output<string>();
  readonly action = output<void>();
  protected readonly defaults: { label: string; length?: number; masked?: boolean; actionLabel?: string } = { label: 'Enter the code' };
  protected readonly name = computed(() => this.label() ?? this.defaults.label);
  protected readonly size = computed(() => this.length() ?? this.defaults.length ?? 6);
  protected readonly dots = computed(() => this.masked() ?? this.defaults.masked ?? false);
  protected readonly act = computed(() => this.actionLabel() ?? this.defaults.actionLabel ?? '');
  protected readonly focused = signal(false);
  protected readonly touched = signal(false);
  protected readonly message = computed(() => this.error() || (this.touched() && this.required() && !this.value() ? `${this.name()} is required.` : ''));
  protected readonly describedBy = computed(() => (this.message() ? `${this.id}-err` : this.helpText() ? `${this.id}-help` : null));
  protected readonly fieldClass = computed(() => 'bx-field bx-code' + (this.message() ? ' is-error' : '') + (this.focused() ? ' is-focus' : '') + (this.disabled() ? ' is-disabled' : ''));
  protected readonly slots = computed(() => {
    const v = this.value() ?? '';
    return Array.from({ length: this.size() }, (_, i) => ({ ch: v[i] ? (this.dots() ? '•' : v[i]) : '',
      css: 'bx-slot' + (v[i] ? ' is-filled' : '') + (i === v.length && this.focused() ? ' is-next' : '') }));
  });
  protected type(e: Event): void {
    const el = e.target as HTMLInputElement;
    const n = el.value.replace(/\D/g, '').slice(0, this.size());
    if (el.value !== n) { el.value = n; }
    this.value.set(n);
    if (n.length === this.size()) { this.completed.emit(n); }
  }
}

/** A one-time code with Send a new code. */
@Component({ selector: 'bx-otp', changeDetection: ChangeDetectionStrategy.OnPush, imports: [FieldMessage], template: CODE })
export class OtpInput extends CodeBase { protected override readonly defaults = { label: 'Enter the code', actionLabel: 'Send a new code' }; }
/** The code that activates a new card. */
@Component({ selector: 'bx-activate-card', changeDetection: ChangeDetectionStrategy.OnPush, imports: [FieldMessage], template: CODE })
export class ActivateCard extends CodeBase { protected override readonly defaults = { label: 'Enter the activation code' }; }
/** A new PIN, in dots. */
@Component({ selector: 'bx-reset-pin', changeDetection: ChangeDetectionStrategy.OnPush, imports: [FieldMessage], template: CODE })
export class ResetPin extends CodeBase { protected override readonly defaults = { label: 'Choose a new PIN', length: 4, masked: true }; }

/* ---------- CardTile ---------- */

/** The card's picture with the number masked; grey when blocked. A screen reader hears one line about it. */
@Component({
  selector: 'bx-card-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="frozen() ? 'bx-card-face is-frozen' : 'bx-card-face'" role="img" [attr.aria-label]="name()" [attr.data-testid]="testID() || null">
      <span class="bx-card-face-label" aria-hidden="true">{{ label() }}</span>
      <span class="bx-card-face-number bx-mono" aria-hidden="true">{{ shown() }}</span>
      <span class="bx-card-face-foot" aria-hidden="true"><span>{{ holder() }}</span><span>{{ expiry() }}</span><strong>{{ network() }}</strong></span>
      @if (frozen()) { <span class="bx-card-face-lock" aria-hidden="true">Blocked</span> }
    </div>`,
})
export class CardTile extends Part {
  readonly label = input.required<string>();
  readonly number = input('');
  readonly holder = input('');
  readonly expiry = input('');
  readonly network = input('');
  readonly frozen = input(false);
  protected readonly shown = computed(() => masked(this.number()));
  protected readonly name = computed(() => [this.label(), this.network(), `ending ${(this.number() || '').replace(/\D/g, '').slice(-4)}`, this.frozen() ? 'blocked' : '']
    .filter(Boolean).join(', '));
}

/* ---------- AuthChallenge ---------- */

const METHOD_ICON = { face: '☺', fingerprint: '◉', passkey: '⚿' };

/** Asks for a biometric or a passkey; the screen does the asking (WebAuthn or the app) and sets the state. (verify), (other). */
@Component({
  selector: 'bx-biometric',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="bx-card bx-challenge" [attr.aria-labelledby]="id" [attr.data-testid]="testID() || null">
      <span [class]="state() === 'waiting' ? 'bx-challenge-icon is-waiting' : 'bx-challenge-icon'" aria-hidden="true">{{ icon() }}</span>
      <h3 class="bx-card-title" [id]="id">{{ heading() }}</h3>
      @if (text()) { <p class="bx-thing-text">{{ text() }}</p> }
      @if (state() === 'failed') { <p class="bx-error" role="alert"><span class="bx-error-icon" aria-hidden="true">!</span>{{ failedText() }}</p> }
      <div class="bx-kv-actions">
        <button type="button" class="bx-btn bx-btn--borderless" (click)="other.emit()">{{ otherLabel() }}</button>
        <button type="button" class="bx-btn bx-btn--callToAction" [attr.aria-busy]="state() === 'waiting' || null" (click)="go()">{{ actionLabel() }}</button>
      </div>
    </section>`,
})
export class AuthChallenge extends Part {
  readonly heading = input('Confirm it is you');
  readonly text = input('');
  readonly method = input<'face' | 'fingerprint' | 'passkey'>('fingerprint');
  readonly actionLabel = input('Use fingerprint');
  readonly otherLabel = input('Use a code instead');
  /** ready, waiting (the device is asking) or failed. */
  readonly state = input<'ready' | 'waiting' | 'failed'>('ready');
  readonly failedText = input('That did not work. Try again, or use a code.');
  readonly verify = output<void>();
  readonly other = output<void>();
  protected readonly icon = computed(() => METHOD_ICON[this.method()]);
  protected go(): void { if (this.state() !== 'waiting') { this.verify.emit(); } }
}

/* ---------- settings ---------- */

export const SETTING = `
  <div [class]="value() && tone() ? 'bx-field bx-toggle is-' + tone() : 'bx-field bx-toggle'" [attr.data-testid]="testID() || null">
    <div class="bx-switch-row">
      <span class="bx-switch-label" [id]="id">{{ name() }}</span>
      <button type="button" role="switch" class="bx-switch" [attr.aria-checked]="value()" [attr.aria-labelledby]="id" [attr.aria-describedby]="note() ? id + '-note' : null"
              [disabled]="disabled()" (click)="value.set(!value())"></button>
    </div>
    @if (note()) { <span class="bx-help" role="status" [id]="id + '-note'">{{ note() }}</span> }
  </div>`;

/** One setting with what it means when on (or off), said when it changes. [(value)]. */
@Directive()
export abstract class SettingBase extends Part {
  /** Leave out for the component's own label and texts. */
  readonly label = input<string | undefined>(undefined);
  readonly value = model(false);
  readonly onText = input<string | undefined>(undefined);
  readonly offText = input('');
  readonly disabled = input(false);
  protected readonly defaults: { label?: string; onText?: string; tone?: string } = {};
  protected readonly name = computed(() => this.label() ?? this.defaults.label ?? '');
  protected readonly tone = computed(() => this.defaults.tone ?? '');
  protected readonly note = computed(() => (this.value() ? this.onText() ?? this.defaults.onText ?? '' : this.offText()));
}

/** Block the card, and what that means. */
@Component({ selector: 'bx-block-card', changeDetection: ChangeDetectionStrategy.OnPush, template: SETTING })
export class BlockCard extends SettingBase {
  protected override readonly defaults = { label: 'Block the card', onText: 'The card is blocked: payments and withdrawals are refused until you unblock it.', tone: 'danger' };
}

/* ---------- SessionExpiryWarning ---------- */

export function expiryText(s: number): string {
  return 'For your security you will be signed out in ' + (s >= 60 ? `${Math.ceil(s / 60)} ${s >= 120 ? 'minutes' : 'minute'}.` : `${s} ${s === 1 ? 'second' : 'seconds'}.`);
}

/** The session is about to end: a countdown, Stay signed in and Sign out; Escape does not close it. Said when it opens and in the last ten seconds. */
@Component({
  selector: 'bx-session-timeout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dialog],
  template: `
    <bx-dialog [open]="open()" [dialogTitle]="heading()" cancelBehavior="none" [testID]="testID()" [dialogClass]="'bx-timeout ' + vcss()">
      @if (variant() === 'countdown') {
        <span class="bx-countdown" aria-hidden="true"><svg viewBox="0 0 44 44" focusable="false"><circle class="bx-countdown-track" cx="22" cy="22" r="20"></circle>
          <circle class="bx-countdown-fill" cx="22" cy="22" r="20" stroke-dasharray="125.7" [attr.stroke-dashoffset]="ring()"></circle></svg><span class="bx-countdown-num">{{ left() }}</span></span>
      }
      <p>{{ text() }}</p>
      <span class="bx-visually-hidden" aria-live="assertive">{{ spoken() }}</span>
      <button footer type="button" class="bx-btn bx-btn--borderless" (click)="end('signOut')">Sign out</button>
      <button footer type="button" class="bx-btn bx-btn--callToAction" (click)="end('stay')">Stay signed in</button>
    </bx-dialog>`,
})
export class SessionExpiryWarning extends Part {
  readonly open = model(false);
  readonly seconds = input(60);
  readonly heading = input('Are you still there?');
  /** The style: standard (dialog), countdown (a ring that empties) or sheet. */
  readonly variant = input<TimeoutVariant>('standard');
  protected readonly vcss = computed(() => vx('timeout', this.variant()));
  protected readonly ring = computed(() => ringOffset(this.left() / (this.seconds() || 1), 20));
  readonly stay = output<void>();
  readonly signOut = output<void>();
  readonly expired = output<void>();
  protected readonly left = signal(60);
  protected readonly text = computed(() => expiryText(this.left()));
  protected readonly spoken = computed(() => (this.left() === this.seconds() || this.left() === 10 ? this.text() : ''));
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    effect(() => {
      const open = this.open();
      const seconds = this.seconds();
      untracked(() => {
        this.stop();
        if (!open) { return; }
        this.left.set(seconds);
        this.timer = setInterval(() => {
          this.left.set(this.left() - 1);
          if (this.left() <= 0) { this.stop(); this.open.set(false); this.expired.emit(); }
        }, 1000);
      });
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private stop(): void { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  protected end(how: 'stay' | 'signOut'): void {
    this.stop();
    this.open.set(false);
    if (how === 'stay') { this.stay.emit(); } else { this.signOut.emit(); }
  }
}

/* ---------- SensitiveField ---------- */

/** A number shown masked, in full on request. */
@Component({
  selector: 'bx-sensitive',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bx-field bx-sensitive" [attr.data-testid]="testID() || null">
      <span class="bx-label" [id]="id">{{ label() }}</span>
      <div class="bx-control is-readonly" role="group" [attr.aria-labelledby]="id">
        <span class="bx-input bx-mono bx-sensitive-value">{{ shown() ? value() : hidden() }}</span>
        <button type="button" class="bx-reveal" [attr.aria-pressed]="shown()" [attr.aria-label]="(shown() ? 'Hide ' : 'Show ') + label()" (click)="shown.set(!shown())">{{ shown() ? 'Hide' : 'Show' }}</button>
      </div>
    </div>`,
})
export class SensitiveField extends Part {
  readonly label = input('Card number');
  readonly value = input('');
  protected readonly shown = signal(false);
  protected readonly hidden = computed(() => masked(this.value()));
}

/* ---------- reused kinds ---------- */

/** Each loan with what is outstanding and the next instalment. */
@Component({ selector: 'bx-loan-summary', changeDetection: ChangeDetectionStrategy.OnPush, template: TILES })
export class LoansSummary extends TilesBase { protected override readonly defaults = { heading: 'Your loans' }; }
/** The cards with what is due and their limits. */
@Component({ selector: 'bx-card-list', changeDetection: ChangeDetectionStrategy.OnPush, template: TILES })
export class CardList extends TilesBase { protected override readonly defaults = { heading: 'Your cards' }; }
/** The fields of a loan repayment and Review. */
@Component({ selector: 'bx-loan-repayment', changeDetection: ChangeDetectionStrategy.OnPush, template: FORM })
export class LoanRepayment extends FormBase { protected override readonly defaults = { heading: 'Repay a loan', submitLabel: 'Review repayment' }; }
/** The fields of a dispute and Raise. */
@Component({ selector: 'bx-raise-dispute', changeDetection: ChangeDetectionStrategy.OnPush, template: FORM })
export class RaiseDispute extends FormBase { protected override readonly defaults = { heading: 'Raise a dispute', submitLabel: 'Raise dispute' }; }
/** The fields of an add-on card and Apply. */
@Component({ selector: 'bx-add-on-card', changeDetection: ChangeDetectionStrategy.OnPush, template: FORM })
export class AddOnCard extends FormBase { protected override readonly defaults = { heading: 'Add-on card', submitLabel: 'Apply' }; }
/** A promise to pay an overdue amount by a date. */
@Component({ selector: 'bx-promise-to-pay', changeDetection: ChangeDetectionStrategy.OnPush, template: DETAILS })
export class PromiseToPay extends DetailsBase { protected override readonly defaults = { heading: 'Promise to pay', actionLabel: 'Make the promise' }; }
/** A payment to confirm with a code. */
@Component({ selector: 'bx-secure-confirmation', changeDetection: ChangeDetectionStrategy.OnPush, template: DETAILS })
export class SecureConfirmation extends DetailsBase { protected override readonly defaults = { heading: 'Confirm the payment', actionLabel: 'Confirm with the code' }; }
/** A loan's disbursements in order. */
@Component({ selector: 'bx-disbursement', changeDetection: ChangeDetectionStrategy.OnPush, template: TIMELINE })
export class DisbursementTimeline extends TimelineBase { protected override readonly defaultLabel = 'Disbursements'; }
/** Pay a purchase over months. [(value)]. */
@Component({ selector: 'bx-convert-emi', changeDetection: ChangeDetectionStrategy.OnPush, template: SEGMENTS })
export class ConvertToEmi extends SegmentsBase { protected override readonly defaults = { label: 'Pay over', options: ['3 months', '6 months', '12 months'] }; }
/** How many points to redeem. [(value)]. */
@Component({ selector: 'bx-redeem-points', changeDetection: ChangeDetectionStrategy.OnPush, template: SLIDER })
export class RedeemPoints extends SliderBase { protected override readonly defaults = { label: 'Points to redeem', max: 12400, step: 100 }; }
/** The card's statements, each to download. */
@Component({ selector: 'bx-card-statements', changeDetection: ChangeDetectionStrategy.OnPush, template: ROWS })
export class CardStatements extends RowsBase { protected override readonly defaults = { heading: 'Statements', actionLabel: 'Download', emptyText: 'No statements yet.' }; }
/** The card's daily limit. [(value)]. */
@Component({ selector: 'bx-spend-limit', changeDetection: ChangeDetectionStrategy.OnPush, template: SLIDER })
export class CardLimits extends SliderBase { protected override readonly defaults = { label: 'Daily card limit', max: 10000, step: 100 }; }
/** The steps of proving who the customer is. */
@Component({ selector: 'bx-kyc-steps', changeDetection: ChangeDetectionStrategy.OnPush, template: STEPS })
export class KycSteps extends StepsBase {
  protected override readonly defaultLabel = 'Verify your identity';
  protected override readonly defaultSteps = ['ID', 'Selfie', 'Address'];
}
/** A payment the bank stopped, and what to do; announced at once. */
@Component({ selector: 'bx-fraud-alert', changeDetection: ChangeDetectionStrategy.OnPush, template: ALERT })
export class FraudAlert extends AlertBase {
  protected override readonly defaultSeverity: Severity = 'error';
  protected override readonly defaults = { heading: 'Was this you?', actionLabel: 'Review it' };
}

/** Group 3's components, for a screen's imports. */
export const G3_COMPONENTS = [LoansSummary, LoanRepayment, RepaymentSchedule, PromiseToPay, DisbursementTimeline, CardList, ConvertToEmi, RedeemPoints, BlockCard, RaiseDispute,
  AddOnCard, CardStatements, OtpInput, SessionExpiryWarning, SecureConfirmation, SensitiveField, CardTile, ActivateCard, CardLimits, ResetPin, AuthChallenge, KycSteps,
  FraudAlert] as const;
