/*
 * Group 6 (the corporate dashboard widgets the catalogue names in Angular), the same markup and bx- classes as
 * bx-g6.js in the premium JET pack. A widget shows what the screen gives it and says what was pressed; the dashboard
 * fetches and arranges them.
 */
import { ChangeDetectionStrategy, Component, Directive, computed, input, model, output } from '@angular/core';

import { FileUpload } from './forms';
import { ALERT, AlertBase, Part, ROWS, RowsBase, Severity, arrow } from './g1';
import { QUICK, QuickBase, THING, TILES, TRANSACTIONS, ThingBase, TilesBase, TransactionHistory } from './g2';
import { CHART, ChartBase, METERS, MetersBase } from './g4';
import { CALC, CalcBase } from './g5';

export type { QuickItem } from './g2';

/* ---------- tab summary ---------- */

export interface SummaryTab { id: string; label: string; summary: string }

export const TABSUM = `
  <section class="bx-panel bx-tabsum" [attr.aria-labelledby]="id" [attr.data-testid]="testID() || null">
    <h3 class="bx-panel-title" [id]="id">{{ head() }}</h3>
    <div [class]="'bx-tabs' + vc('tabs')" role="tablist" [attr.aria-labelledby]="id" [attr.aria-orientation]="variant() === 'vertical' ? 'vertical' : null" (keydown)="key($event)">
      @for (o of items(); track o.id) {
        <button type="button" role="tab" [id]="id + '-t-' + o.id" [class]="o.id === chosen()?.id ? 'bx-tab is-on' : 'bx-tab'" [attr.aria-selected]="o.id === chosen()?.id"
                [attr.tabindex]="o.id === chosen()?.id ? 0 : -1" [attr.aria-controls]="id + '-panel'" (click)="selection.set(o.id)">{{ o.label }}</button>
      }
    </div>
    <div class="bx-tabsum-panel" role="tabpanel" [id]="id + '-panel'" [attr.aria-labelledby]="chosen() ? id + '-t-' + chosen()?.id : null">
      <p class="bx-tabsum-figure">{{ chosen()?.summary }}</p>
      @if (actionLabel()) { <button type="button" class="bx-thing-action" (click)="action.emit(chosen()?.id ?? '')">{{ actionLabel() }}</button> }
    </div>
  </section>`;

@Directive()
export abstract class TabSummaryBase extends Part {
  readonly heading = input<string | undefined>(undefined);
  readonly items = input<ReadonlyArray<SummaryTab>>([]);
  /** The chosen tab's id: [(selection)]. The first tab until one is chosen. */
  readonly selection = model('');
  readonly actionLabel = input('View all');
  readonly action = output<string>();
  protected readonly defaultHeading: string = '';
  protected readonly head = computed(() => this.heading() ?? this.defaultHeading);
  protected readonly chosen = computed<SummaryTab | undefined>(() => this.items().find((o) => o.id === this.selection()) ?? this.items()[0]);
  protected key(e: KeyboardEvent): void {
    const l = this.items();
    const c = this.chosen();
    const next = arrow(e.key, c ? Math.max(0, l.indexOf(c)) : 0, l.length);
    if (next < 0) { return; }
    e.preventDefault();
    this.selection.set(l[next].id);
    this.focusLater('.bx-tab.is-on');
  }
}

/** The accounts by type, a tab each. */
@Component({ selector: 'bx-accounts-corp', changeDetection: ChangeDetectionStrategy.OnPush, template: TABSUM })
export class AccountsWidget extends TabSummaryBase { protected override readonly defaultHeading = 'Accounts'; }
/** Transactions by state, a tab each. */
@Component({ selector: 'bx-transactions-widget', changeDetection: ChangeDetectionStrategy.OnPush, template: TABSUM })
export class TransactionsWidget extends TabSummaryBase { protected override readonly defaultHeading = 'Transactions'; }

/* ---------- BulkUploadWidget ---------- */

/** A file for bulk payments (the bx-document-upload field), its template, and Upload. [(value)], (upload), (template). */
@Component({
  selector: 'bx-bulk-file-upload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FileUpload],
  template: `
    <section class="bx-panel" [attr.aria-labelledby]="id" [attr.data-testid]="testID() || null">
      <h3 class="bx-panel-title" [id]="id">{{ heading() }}</h3>
      <bx-document-upload [label]="label()" [accept]="accept()" [(value)]="value" />
      <div class="bx-kv-actions">
        <button type="button" class="bx-btn bx-btn--borderless" (click)="template.emit()">{{ templateLabel() }}</button>
        <button type="button" class="bx-btn bx-btn--callToAction" [disabled]="!(value() ?? []).length" (click)="upload.emit(value() ?? [])">{{ actionLabel() }}</button>
      </div>
    </section>`,
})
export class BulkUploadWidget extends Part {
  readonly heading = input('Bulk file upload');
  readonly label = input('Payments file');
  readonly accept = input('.csv,.xlsx');
  readonly value = model<File[] | undefined>([]);
  readonly templateLabel = input('Download the template');
  readonly actionLabel = input('Upload');
  readonly upload = output<File[]>();
  readonly template = output<void>();
}

/* ---------- QuickLinksWidget ---------- */

/** Shortcuts for the corporate user, tiles of an icon and a word. */
@Component({ selector: 'bx-quick-links-corp', changeDetection: ChangeDetectionStrategy.OnPush, template: QUICK })
export class QuickLinksWidget extends QuickBase { protected override readonly defaultLabel = 'Quick links'; }

/* ---------- reused kinds ---------- */

/** Assets, liabilities and net worth. */
@Component({ selector: 'bx-financial-overview', changeDetection: ChangeDetectionStrategy.OnPush, template: TILES })
export class FinancialOverviewWidget extends TilesBase { protected override readonly defaults = { heading: 'Financial position' }; protected override readonly defaultInteractive = false; }
/** Bills receivable and payable. */
@Component({ selector: 'bx-bills-receivable-payable', changeDetection: ChangeDetectionStrategy.OnPush, template: TILES })
export class TradeBillsWidget extends TilesBase { protected override readonly defaults = { heading: 'Trade bills' }; }
/** Today's processed, in progress and rejected items. */
@Component({ selector: 'bx-work-snapshot', changeDetection: ChangeDetectionStrategy.OnPush, template: TILES })
export class WorkSnapshotWidget extends TilesBase { protected override readonly defaults = { heading: "Today's work" }; }
/** The position in each currency. */
@Component({ selector: 'bx-position-by-currency', changeDetection: ChangeDetectionStrategy.OnPush, template: CHART })
export class CurrencyPositionWidget extends ChartBase { protected override readonly defaultHeading = 'Position by currency'; }
/** What is waiting, by area. */
@Component({ selector: 'bx-pending-for-action', changeDetection: ChangeDetectionStrategy.OnPush, template: CHART })
export class PendingActionWidget extends ChartBase { protected override readonly defaultHeading = 'Pending for action'; }
/** How much of each credit line is used. */
@Component({ selector: 'bx-credit-line-usage', changeDetection: ChangeDetectionStrategy.OnPush, template: METERS })
export class CreditLineWidget extends MetersBase { protected override readonly defaultHeading = 'Credit lines'; }
/** The company's limits used. */
@Component({ selector: 'bx-corporate-limits', changeDetection: ChangeDetectionStrategy.OnPush, template: METERS })
export class CorporateLimitsWidget extends MetersBase { protected override readonly defaultHeading = 'Limits'; }
/** This user's own limits used. */
@Component({ selector: 'bx-my-limits', changeDetection: ChangeDetectionStrategy.OnPush, template: METERS })
export class MyLimitsWidget extends MetersBase { protected override readonly defaultHeading = 'My limits'; }
/** Letters of credit and guarantees expiring soon. */
@Component({ selector: 'bx-trade-instruments', changeDetection: ChangeDetectionStrategy.OnPush, template: ROWS })
export class TradeInstrumentsWidget extends RowsBase { protected override readonly defaults = { heading: 'Expiring soon', actionLabel: 'View' }; }
/** Reports to download. */
@Component({ selector: 'bx-reports', changeDetection: ChangeDetectionStrategy.OnPush, template: ROWS })
export class ReportsWidget extends RowsBase { protected override readonly defaults = { heading: 'Reports', actionLabel: 'Download' }; }
/** The last five payments, each to repeat. */
@Component({ selector: 'bx-last-5-payments', changeDetection: ChangeDetectionStrategy.OnPush, template: ROWS })
export class LastPaymentsWidget extends RowsBase { protected override readonly defaults = { heading: 'Last 5 payments', actionLabel: 'Repeat' }; }
/** Notices from the bank, each with Read. */
@Component({ selector: 'bx-notifications-widget', changeDetection: ChangeDetectionStrategy.OnPush, template: ROWS })
export class NotificationsWidget extends RowsBase { protected override readonly defaults = { heading: 'Notifications', actionLabel: 'Read' }; }
/** Items waiting for this approver, each with Approve. */
@Component({ selector: 'bx-pending-approvals', changeDetection: ChangeDetectionStrategy.OnPush, template: ROWS })
export class PendingApprovalsWidget extends RowsBase { protected override readonly defaults = { heading: 'Pending approvals', actionLabel: 'Approve' }; }

/* ---------- the retail dashboard ---------- */

/** Each kind of holding with its total. */
@Component({ selector: 'bx-overview', changeDetection: ChangeDetectionStrategy.OnPush, template: TILES })
export class OverviewWidget extends TilesBase { protected override readonly defaults = { heading: 'Overview' }; }
/** Things worth a look today, each with an action. */
@Component({ selector: 'bx-quick-insights', changeDetection: ChangeDetectionStrategy.OnPush, template: ROWS })
export class QuickInsightsWidget extends RowsBase { protected override readonly defaults = { heading: 'Worth a look', actionLabel: 'Act', emptyText: 'Nothing needs you today.' }; }
/** The latest transactions. */
@Component({ selector: 'bx-recent-transactions', changeDetection: ChangeDetectionStrategy.OnPush, template: TRANSACTIONS })
export class RecentTransactionsWidget extends TransactionHistory { protected override readonly defaultHeading = 'Recent transactions'; }
/** Bills due, each with Pay now. */
@Component({ selector: 'bx-bills-widget', changeDetection: ChangeDetectionStrategy.OnPush, template: ROWS })
export class BillsWidget extends RowsBase { protected override readonly defaults = { heading: 'Bills', actionLabel: 'Pay now', emptyText: 'No bills due.' }; }
/** Where the money went, by category. */
@Component({ selector: 'bx-spend-analysis', changeDetection: ChangeDetectionStrategy.OnPush, template: CHART })
export class SpendAnalysisWidget extends ChartBase { protected override readonly defaultHeading = 'Where your money went'; }
/** Savings goals and how far along each is. */
@Component({ selector: 'bx-goals', changeDetection: ChangeDetectionStrategy.OnPush, template: METERS })
export class GoalsWidget extends MetersBase { protected override readonly defaultHeading = 'Goals'; }
/** Budgets used this month. */
@Component({ selector: 'bx-budgets', changeDetection: ChangeDetectionStrategy.OnPush, template: METERS })
export class BudgetsWidget extends MetersBase { protected override readonly defaultHeading = 'Budgets'; }
/** A loan calculator on the dashboard. */
@Component({ selector: 'bx-calculators', changeDetection: ChangeDetectionStrategy.OnPush, template: CALC })
export class CalculatorsWidget extends CalcBase { protected override readonly defaults = { heading: 'Calculators', amount: 10000, rate: 9.5, months: 36 }; }
/** The credit score on its scale; a high score never turns amber. */
@Component({ selector: 'bx-credit-score', changeDetection: ChangeDetectionStrategy.OnPush, template: METERS })
export class CreditScoreWidget extends MetersBase { protected override readonly defaultHeading = 'Credit score'; protected override readonly defaultWarnAt = 101; }
/** Points, vouchers and cashback. */
@Component({ selector: 'bx-rewards', changeDetection: ChangeDetectionStrategy.OnPush, template: TILES })
export class RewardsWidget extends TilesBase { protected override readonly defaults = { heading: 'Rewards' }; }
/** The relationship manager and a way to write to them. */
@Component({ selector: 'bx-financial-advisor', changeDetection: ChangeDetectionStrategy.OnPush, template: THING })
export class FinancialAdvisorWidget extends ThingBase { protected override readonly defaultAction = 'Send a message'; }
/** An offer for the customer. */
@Component({ selector: 'bx-special-offers', changeDetection: ChangeDetectionStrategy.OnPush, template: THING })
export class SpecialOffersWidget extends ThingBase { protected override readonly defaultAction = 'Apply now'; }
/** What is due on the cards. */
@Component({ selector: 'bx-credit-cards-overview', changeDetection: ChangeDetectionStrategy.OnPush, template: TILES })
export class CreditCardsWidget extends TilesBase { protected override readonly defaults = { heading: 'Credit cards' }; }
/** The loans at a glance. */
@Component({ selector: 'bx-loans-overview', changeDetection: ChangeDetectionStrategy.OnPush, template: TILES })
export class LoansWidget extends TilesBase { protected override readonly defaults = { heading: 'Loans' }; }
/** An overdue payment, announced at once, with Pay now. */
@Component({ selector: 'bx-delinquency-notice', changeDetection: ChangeDetectionStrategy.OnPush, template: ALERT })
export class DelinquencyNotice extends AlertBase {
  protected override readonly defaultSeverity: Severity = 'error';
  protected override readonly defaults = { heading: 'Payment overdue', actionLabel: 'Pay now' };
}

/** Group 6's components, for a screen's imports. */
export const G6_COMPONENTS = [FinancialOverviewWidget, CurrencyPositionWidget, CreditLineWidget, TradeBillsWidget, TradeInstrumentsWidget, ReportsWidget, AccountsWidget,
  CorporateLimitsWidget, TransactionsWidget, LastPaymentsWidget, BulkUploadWidget, QuickLinksWidget, WorkSnapshotWidget, NotificationsWidget, PendingActionWidget, MyLimitsWidget,
  PendingApprovalsWidget, OverviewWidget, QuickInsightsWidget, RecentTransactionsWidget, BillsWidget, SpendAnalysisWidget, GoalsWidget, BudgetsWidget, CalculatorsWidget,
  CreditScoreWidget, RewardsWidget, FinancialAdvisorWidget, SpecialOffersWidget, CreditCardsWidget, LoansWidget, DelinquencyNotice] as const;
