/*
 * Group 4 (insights, approvals, liquidity, settings), the same markup and bx- classes as bx-g4.js in the premium JET
 * pack. Charts and meters show the figures the screen gives; bars are widths in steps of 5% (classes, no inline
 * style), and every figure is also text, so a screen reader hears the numbers.
 */
import { ChangeDetectionStrategy, Component, Directive, computed, input, model } from '@angular/core';

import { Dropdown } from './dropdown';
import { ACCORDION, ALERT, AccordionBase, AlertBase, CHIPS, ChipsBase, Part, ROWS, RowsBase, SEGMENTS, SegmentsBase, Severity, TIMELINE, TimelineBase } from './g1';
import { DETAILS, DetailsBase, PICKER, PickerBase } from './g2';
import { SETTING, SettingBase } from './g3';
import { ChartVariant, ProgressVariant, ringOffset, vx } from './variants';

/** A share in steps of 5% (0 to 100), for the bx-w-* and bx-h-* classes. */
export function step(part: number, whole: number): number {
  const p = whole > 0 ? Math.max(0, Math.min(1, part / whole)) : 0;
  return Math.round(p * 20) * 5;
}
const figure = (n: number, unit: string) => n.toLocaleString() + (unit ? ` ${unit}` : '');

/* ---------- BarChart ---------- */

export interface Bar { label: string; value: number; display?: string; tone?: 'danger' | 'success' }

export const CHART = `
  <figure [class]="'bx-chart is-' + dir() + vcss()" [attr.aria-labelledby]="id" [attr.data-testid]="testID() || null">
    <figcaption class="bx-panel-title" [id]="id">{{ head() }}</figcaption>
    @if (variant() === 'meter') { <span class="bx-meter-bar" aria-hidden="true">@for (s of segs(); track $index) {<span [class]="s"></span>}</span> }
    <ul class="bx-bars">
      @for (b of bars(); track $index) {
        <li class="bx-bar"><span class="bx-bar-label">{{ b.label }}</span><span class="bx-bar-track" aria-hidden="true"><span [class]="b.css"></span></span>
          <span class="bx-bar-value">{{ b.shown }}</span></li>
      }
    </ul>
    @if (note()) { <p class="bx-help">{{ note() }}</p> }
  </figure>`;

@Directive()
export abstract class ChartBase extends Part {
  readonly heading = input<string | undefined>(undefined);
  readonly items = input<ReadonlyArray<Bar>>([]);
  readonly max = input(0);
  readonly unit = input('');
  readonly orientation = input<'bars' | 'columns' | undefined>(undefined);
  readonly note = input('');
  /** The style: default, rounded, lollipop or meter (one bar split into the figures). */
  readonly variant = input<ChartVariant>('default');
  protected readonly vcss = computed(() => vx(this.variant()));
  /** The meter chart's one bar: each figure's share of the total. */
  protected readonly segs = computed(() => {
    const total = this.items().reduce((s, o) => s + Math.max(0, o.value || 0), 0);
    return this.items().map((o, i) => `bx-meter-seg bx-w-${step(Math.max(0, o.value || 0), total)} bx-seg-${i % 6}`);
  });
  protected readonly defaultHeading: string = '';
  protected readonly defaultOrientation: 'bars' | 'columns' = 'bars';
  protected readonly head = computed(() => this.heading() ?? this.defaultHeading);
  protected readonly dir = computed(() => this.orientation() ?? this.defaultOrientation);
  protected readonly bars = computed(() => {
    const top = this.max() || Math.max(0, ...this.items().map((o) => o.value || 0));
    const dir = this.dir() === 'columns' ? 'h' : 'w';
    return this.items().map((o) => ({ label: o.label, shown: o.display ?? figure(o.value || 0, this.unit()),
      css: `bx-bar-fill bx-${dir}-${step(o.value || 0, top)}` + (o.tone ? ` is-${o.tone}` : '') }));
  });
}

/** Spending by month as columns. */
@Component({ selector: 'bx-spending-chart', changeDetection: ChangeDetectionStrategy.OnPush, template: CHART })
export class SpendingChart extends ChartBase {
  protected override readonly defaultHeading = 'Spending by month';
  protected override readonly defaultOrientation = 'columns' as const;
}

/* ---------- meters ---------- */

export interface Meter { id?: string; label: string; value: number; max: number }

export const METERS = `
  <section [class]="'bx-panel bx-meters' + vcss()" [attr.aria-label]="head() || null" [attr.data-testid]="testID() || null">
    @if (head()) { <h3 class="bx-panel-title">{{ head() }}</h3> }
    @for (m of rows(); track $index; let i = $index) {
      <div class="bx-meter">
        <div class="bx-meter-head"><span [id]="id + '-' + i">{{ m.label }}</span><span [class]="m.over ? 'bx-meter-text is-over' : 'bx-meter-text'">{{ m.text }}</span></div>
        <div class="bx-meter-track" role="progressbar" aria-valuemin="0" [attr.aria-valuemax]="m.max" [attr.aria-valuenow]="m.now" [attr.aria-valuetext]="m.text"
             [attr.aria-labelledby]="id + '-' + i">
          @switch (variant()) {
            @case ('ring') { <span [class]="'bx-meter-ring' + m.state" aria-hidden="true"><svg viewBox="0 0 44 44" focusable="false"><circle class="bx-ring-track" cx="22" cy="22" r="18"></circle>
              <circle class="bx-ring-fill" cx="22" cy="22" r="18" stroke-dasharray="113.1" [attr.stroke-dashoffset]="m.offset"></circle></svg><span class="bx-meter-pct">{{ m.pct }}%</span></span> }
            @case ('segmented') { <span [class]="'bx-meter-segs' + m.state" aria-hidden="true">@for (on of m.segs; track $index) {<span [class]="on ? 'is-on' : ''"></span>}</span> }
            @case ('linear') { <span [class]="m.css"></span><span class="bx-meter-stop" aria-hidden="true"></span> }
            @default { <span [class]="m.css"></span> }
          }
        </div>
      </div>
    }
  </section>`;

@Directive()
export abstract class MetersBase extends Part {
  readonly heading = input<string | undefined>(undefined);
  readonly items = input<ReadonlyArray<Meter>>([]);
  readonly unit = input('');
  /** From this share (%) the bar turns amber; leave out for the component's own (90). */
  readonly warnAt = input<number | undefined>(undefined);
  /** The style: default, linear, ring or segmented. */
  readonly variant = input<ProgressVariant>('default');
  protected readonly vcss = computed(() => vx(this.variant()));
  protected readonly defaultWarnAt: number = 90;
  protected readonly defaultHeading: string = '';
  protected readonly head = computed(() => this.heading() ?? this.defaultHeading);
  protected readonly rows = computed(() => this.items().map((o) => {
    const over = o.max > 0 && o.value > o.max;
    const share = step(o.value, o.max);
    const text = `${figure(o.value, this.unit())} of ${figure(o.max, this.unit())}` + (over ? `, over by ${figure(Math.round((o.value - o.max) * 100) / 100, this.unit())}` : '');
    const state = over ? ' is-over' : share >= (this.warnAt() ?? this.defaultWarnAt) ? ' is-near' : '';
    const pct = o.max > 0 ? Math.round(Math.min(1, Math.max(0, o.value / o.max)) * 100) : 0;
    return { label: o.label, text, over, max: o.max, now: Math.min(o.value, o.max), css: `bx-meter-fill bx-w-${share}` + state, state, pct, offset: ringOffset(pct / 100, 18),
      segs: Array.from({ length: 10 }, (_, k) => k < Math.floor(share / 10)) };
  }));
}

/** Budgets used this month (oj-progress-bar). */
@Component({ selector: 'bx-budget-progress', changeDetection: ChangeDetectionStrategy.OnPush, template: METERS })
export class ProgressBar extends MetersBase { protected override readonly defaultHeading = 'Budgets'; }
/** How much of each intercompany limit is used. */
@Component({ selector: 'bx-intercompany-limits', changeDetection: ChangeDetectionStrategy.OnPush, template: METERS })
export class LendLimits extends MetersBase { protected override readonly defaultHeading = 'Intercompany limits'; }
/** How much of each limit is used today. */
@Component({ selector: 'bx-transaction-limits', changeDetection: ChangeDetectionStrategy.OnPush, template: METERS })
export class TransactionLimits extends MetersBase { protected override readonly defaultHeading = 'Your limits today'; }
/** A savings goal and how far along it is. */
@Component({ selector: 'bx-savings-goal', changeDetection: ChangeDetectionStrategy.OnPush, template: METERS })
export class SavingsGoal extends MetersBase { protected override readonly defaultHeading = 'Savings goal'; }

/* ---------- checks: several settings, each a switch or a checkbox ---------- */

export interface SwitchOption { value: string; label: string; meta?: string; disabled?: boolean }

export const CHECKS = `
  <fieldset class="bx-field bx-checks" [attr.data-testid]="testID() || null">
    <legend class="bx-label">{{ name() }}</legend>
    @for (o of rows(); track o.value; let i = $index) {
      <div class="bx-switch-row">
        @if (kind() === 'switch') {
          <span class="bx-choice-text"><span class="bx-switch-label" [id]="id + '-' + i">{{ o.label }}</span>@if (o.meta) {<span class="bx-choice-meta">{{ o.meta }}</span>}</span>
          <button type="button" role="switch" class="bx-switch" [attr.aria-checked]="o.on" [attr.aria-labelledby]="id + '-' + i" [disabled]="o.off" (click)="toggle(o)"></button>
        } @else {
          <label [class]="o.on ? 'bx-choice is-on' : 'bx-choice'"><input type="checkbox" class="bx-choice-input" [checked]="o.on" [disabled]="o.off" (change)="toggle(o)" />
            <span class="bx-choice-mark" aria-hidden="true"></span><span class="bx-choice-label">{{ o.label }}</span></label>
        }
      </div>
    }
  </fieldset>`;

@Directive()
export abstract class ChecksBase extends Part {
  readonly label = input<string | undefined>(undefined);
  readonly options = input<ReadonlyArray<string | SwitchOption>>([]);
  readonly value = model<string[]>([]);
  /** A switch for each (settings) or a checkbox (consents). */
  readonly control = input<'switch' | 'checkbox' | undefined>(undefined);
  protected readonly defaultControl: 'switch' | 'checkbox' = 'switch';
  protected readonly kind = computed(() => this.control() ?? this.defaultControl);
  readonly disabled = input(false);
  protected readonly defaultLabel: string = '';
  protected readonly name = computed(() => this.label() ?? this.defaultLabel);
  protected readonly rows = computed(() => this.options().map((x) => {
    const o: SwitchOption = typeof x === 'string' ? { value: x, label: x } : x;
    return { ...o, on: this.value().includes(o.value), off: !!o.disabled || this.disabled() };
  }));
  protected toggle(o: SwitchOption & { on: boolean; off: boolean }): void {
    if (o.off) { return; }
    this.value.set(o.on ? this.value().filter((v) => v !== o.value) : [...this.value(), o.value]);
  }
}

/** Ways to sign in, each on or off. [(value)]. */
@Component({ selector: 'bx-sign-in-options', changeDetection: ChangeDetectionStrategy.OnPush, template: CHECKS })
export class SignInOptions extends ChecksBase { protected override readonly defaultLabel = 'Sign in with'; }
/** Where the card can be used, each a switch. [(value)]. */
@Component({ selector: 'bx-card-controls', changeDetection: ChangeDetectionStrategy.OnPush, template: CHECKS })
export class CardControls extends ChecksBase { protected override readonly defaultLabel = 'Allow'; }
/** Which alerts to get. [(value)]. */
@Component({ selector: 'bx-alerts-subscription', changeDetection: ChangeDetectionStrategy.OnPush, template: CHECKS })
export class AlertSubscriptions extends ChecksBase { protected override readonly defaultLabel = 'Tell me about'; }

/* ---------- reused kinds ---------- */

/** Choose a transaction's category (one). [(value)]. */
@Component({ selector: 'bx-spend-categories', changeDetection: ChangeDetectionStrategy.OnPush, template: CHIPS })
export class SpendCategories extends ChipsBase { protected override readonly defaultLabel = 'Category'; protected override readonly defaultMultiple = false; }
/** Payments and requests waiting for this approver. */
@Component({ selector: 'bx-approval-queue', changeDetection: ChangeDetectionStrategy.OnPush, template: ROWS })
export class ApprovalQueue extends RowsBase { protected override readonly defaults = { heading: 'Waiting for your approval', actionLabel: 'Review' }; }
/** Approved items waiting for release. */
@Component({ selector: 'bx-pending-release', changeDetection: ChangeDetectionStrategy.OnPush, template: ROWS })
export class PendingRelease extends RowsBase { protected override readonly defaults = { heading: 'Approved, waiting for release', actionLabel: 'Release' }; }
/** The registered devices, each with Remove. */
@Component({ selector: 'bx-devices', changeDetection: ChangeDetectionStrategy.OnPush, template: ROWS })
export class Devices extends RowsBase { protected override readonly defaults = { heading: 'Your devices', actionLabel: 'Remove' }; }
/** Apps given access (open banking), each with Revoke. */
@Component({ selector: 'bx-consents', changeDetection: ChangeDetectionStrategy.OnPush, template: ROWS })
export class Consents extends RowsBase { protected override readonly defaults = { heading: 'Apps you have allowed', actionLabel: 'Revoke' }; }
/** One item to approve, in full. */
@Component({ selector: 'bx-approval-detail', changeDetection: ChangeDetectionStrategy.OnPush, template: DETAILS })
export class ApprovalDetail extends DetailsBase { protected override readonly defaults = { heading: 'Approval', actionLabel: 'Approve' }; }
/** What a structure would do. */
@Component({ selector: 'bx-structure-simulation', changeDetection: ChangeDetectionStrategy.OnPush, template: DETAILS })
export class StructureSimulation extends DetailsBase { protected override readonly defaults = { heading: 'Simulation', actionLabel: 'Run the simulation' }; }
/** The customer's details and Edit. */
@Component({ selector: 'bx-profile', changeDetection: ChangeDetectionStrategy.OnPush, template: DETAILS })
export class Profile extends DetailsBase { protected override readonly defaults = { heading: 'Your profile', actionLabel: 'Edit profile' }; }
/** Who has approved, and who is next. */
@Component({ selector: 'bx-approval-journey', changeDetection: ChangeDetectionStrategy.OnPush, template: TIMELINE })
export class ApprovalJourney extends TimelineBase { protected override readonly defaultLabel = 'Approval journey'; }
/** Today's sweep, step by step. */
@Component({ selector: 'bx-sweep-monitor', changeDetection: ChangeDetectionStrategy.OnPush, template: TIMELINE })
export class SweepMonitor extends TimelineBase { protected override readonly defaultLabel = "Today's sweep"; }
/** Recent sign-ins, where and on what. */
@Component({ selector: 'bx-session-summary', changeDetection: ChangeDetectionStrategy.OnPush, template: TIMELINE })
export class SessionSummary extends TimelineBase { protected override readonly defaultLabel = 'Recent sign-ins'; }
/** Send an approval to someone else. [(value)]. */
@Component({ selector: 'bx-reroute', changeDetection: ChangeDetectionStrategy.OnPush, imports: [Dropdown], template: PICKER })
export class Reroute extends PickerBase { protected override readonly defaultLabel = 'Re-route to'; }
/** The language of the app. [(value)]. */
@Component({ selector: 'bx-language', changeDetection: ChangeDetectionStrategy.OnPush, imports: [Dropdown], template: PICKER })
export class LanguagePicker extends PickerBase { protected override readonly defaultLabel = 'Language'; }
/** An item sent back for changes. */
@Component({ selector: 'bx-modification-requested', changeDetection: ChangeDetectionStrategy.OnPush, template: ALERT })
export class ModificationNotice extends AlertBase {
  protected override readonly defaultSeverity: Severity = 'warning';
  protected override readonly defaults = { heading: 'Sent back for changes', actionLabel: 'Modify it' };
}
/** The kind of liquidity structure. [(value)]. */
@Component({ selector: 'bx-structure-type', changeDetection: ChangeDetectionStrategy.OnPush, template: SEGMENTS })
export class StructureType extends SegmentsBase { protected override readonly defaults = { label: 'Structure', options: ['Sweep', 'Pool', 'Hybrid'] }; }
/** Where one-time codes go. [(value)]. */
@Component({ selector: 'bx-otp-delivery', changeDetection: ChangeDetectionStrategy.OnPush, template: SEGMENTS })
export class CodeDelivery extends SegmentsBase { protected override readonly defaults = { label: 'Send codes by', options: ['SMS', 'Email', 'App'] }; }
/** Light, dark or the system's. [(value)]. */
@Component({ selector: 'bx-appearance', changeDetection: ChangeDetectionStrategy.OnPush, template: SEGMENTS })
export class Appearance extends SegmentsBase { protected override readonly defaults = { label: 'Theme', options: ['Light', 'Dark', 'System'] }; }
/** The header and child accounts of a structure, each with its rule (several open at once). [(expanded)]. */
@Component({ selector: 'bx-account-structure', changeDetection: ChangeDetectionStrategy.OnPush, template: ACCORDION })
export class AccountStructure extends AccordionBase { protected override readonly defaultMultiple = true; }
/** Quiet hours for alerts. [(value)]. */
@Component({ selector: 'bx-do-not-disturb', changeDetection: ChangeDetectionStrategy.OnPush, template: SETTING })
export class DoNotDisturb extends SettingBase {
  protected override readonly defaults = { label: 'Quiet hours, 22:00 to 07:00', onText: 'Alerts wait until the quiet hours end; security alerts still come at once.' };
}

/** Group 4's components, for a screen's imports. */
export const G4_COMPONENTS = [SpendingChart, ProgressBar, SpendCategories, ApprovalQueue, ApprovalDetail, ApprovalJourney, Reroute, ModificationNotice, PendingRelease, StructureType,
  AccountStructure, StructureSimulation, LendLimits, SweepMonitor, Profile, SignInOptions, CodeDelivery, Devices, Appearance, LanguagePicker, AlertSubscriptions, DoNotDisturb,
  Consents, TransactionLimits, SessionSummary, SavingsGoal, CardControls] as const;
