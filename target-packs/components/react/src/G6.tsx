/*
 * Group 6 (dashboard widgets), the same markup and bx- classes as bx-g6.js in the premium JET pack. A widget shows what
 * the screen gives it and says what was pressed; the dashboard fetches and arranges them.
 */
import { KeyboardEvent, useId, useRef, useState } from 'react';

import { Alert, AlertProps, Rows, RowsProps, arrow } from './G1';
import { QuickActions, QuickActionsProps, ThingCard, ThingCardProps, Tiles, TilesProps, Transactions, TransactionsProps } from './G2';
import { BarChart, BarChartProps, Meters, MetersProps } from './G4';
import { Calculator, CalculatorProps } from './G5';
import { FileUpload } from './Forms';

type Opt<P, K extends keyof P> = Omit<P, K> & Partial<Pick<P, K>>;

/* ---------- tab summary ---------- */

export interface SummaryTab { id: string; label: string; summary: string }
export interface TabSummaryProps { testID?: string; heading: string; items: ReadonlyArray<SummaryTab>; selection?: string; onSelectionChange?: (id: string) => void; actionLabel?: string; onAction?: (id: string) => void }

/** A figure per tab, and View all; arrow keys move between the tabs. */
export function TabSummary({ testID, heading, items, selection, onSelectionChange, actionLabel = 'View all', onAction }: TabSummaryProps) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [own, setOwn] = useState<string | undefined>(undefined);
  const chosen = items.find((o) => o.id === (selection ?? own)) ?? items[0];
  const choose = (v: string) => { setOwn(v); onSelectionChange?.(v); };
  const key = (e: KeyboardEvent) => {
    const next = arrow(e.key, Math.max(0, items.indexOf(chosen)), items.length);
    if (next < 0) { return; }
    e.preventDefault();
    choose(items[next].id);
    setTimeout(() => box.current?.querySelector<HTMLElement>('.bx-tab.is-on')?.focus(), 0);
  };
  return (
    <section className="bx-panel bx-tabsum" aria-labelledby={id} data-testid={testID}>
      <h3 className="bx-panel-title" id={id}>{heading}</h3>
      <div className="bx-tabs" role="tablist" aria-labelledby={id} ref={box} onKeyDown={key}>
        {items.map((o) => {
          const on = o === chosen;
          return <button key={o.id} type="button" role="tab" id={`${id}-t-${o.id}`} className={'bx-tab' + (on ? ' is-on' : '')} aria-selected={on} tabIndex={on ? 0 : -1}
                         aria-controls={`${id}-panel`} onClick={() => choose(o.id)}>{o.label}</button>;
        })}
      </div>
      <div className="bx-tabsum-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={chosen ? `${id}-t-${chosen.id}` : undefined}>
        <p className="bx-tabsum-figure">{chosen?.summary}</p>
        {actionLabel ? <button type="button" className="bx-thing-action" onClick={() => onAction?.(chosen?.id ?? '')}>{actionLabel}</button> : null}
      </div>
    </section>
  );
}

/* ---------- BulkUploadWidget ---------- */

export interface BulkUploadProps { testID?: string; heading?: string; label?: string; accept?: string; value: File[]; onChange?: (files: File[]) => void; templateLabel?: string; actionLabel?: string;
  onUpload?: (files: File[]) => void; onTemplate?: () => void }

/** A file for bulk payments (the FileUpload field), its template, and Upload. */
export function BulkUploadWidget({ testID, heading = 'Bulk file upload', label = 'Payments file', accept = '.csv,.xlsx', value, onChange, templateLabel = 'Download the template',
  actionLabel = 'Upload', onUpload, onTemplate }: BulkUploadProps) {
  const id = useId();
  return (
    <section className="bx-panel" aria-labelledby={id} data-testid={testID}>
      <h3 className="bx-panel-title" id={id}>{heading}</h3>
      <FileUpload testID={`${testID ?? 'bulk'}-file`} label={label} accept={accept} value={value} onChange={onChange} />
      <div className="bx-kv-actions">
        <button type="button" className="bx-btn bx-btn--borderless" onClick={onTemplate}>{templateLabel}</button>
        <button type="button" className="bx-btn bx-btn--callToAction" disabled={!value.length} onClick={() => onUpload?.(value)}>{actionLabel}</button>
      </div>
    </section>
  );
}

/* ---------- group 6 ---------- */

/** Each kind of holding with its total. */
export function OverviewWidget(p: TilesProps) { return <Tiles heading="Overview" {...p} />; }
/** Things worth a look today, each with an action. */
export function QuickInsightsWidget(p: RowsProps) { return <Rows heading="Worth a look" actionLabel="Act" emptyText="Nothing needs you today." {...p} />; }
/** The latest transactions. */
export function RecentTransactionsWidget(p: TransactionsProps) { return <Transactions heading="Recent transactions" {...p} />; }
/** Bills due, each with Pay now. */
export function BillsWidget(p: RowsProps) { return <Rows heading="Bills" actionLabel="Pay now" emptyText="No bills due." {...p} />; }
/** Where the money went, by category. */
export function SpendAnalysisWidget(p: Opt<BarChartProps, 'heading'>) { return <BarChart heading="Where your money went" {...p} />; }
/** Savings goals and how far along each is. */
export function GoalsWidget(p: MetersProps) { return <Meters heading="Goals" {...p} />; }
/** Budgets used this month. */
export function BudgetsWidget(p: MetersProps) { return <Meters heading="Budgets" {...p} />; }
/** A loan calculator on the dashboard. */
export function CalculatorsWidget(p: CalculatorProps) { return <Calculator heading="Calculators" mode="loan" {...p} />; }
/** The credit score on its scale. */
export function CreditScoreWidget(p: MetersProps) { return <Meters heading="Credit score" warnAt={101} {...p} />; }
/** Points, vouchers and cashback. */
export function RewardsWidget(p: TilesProps) { return <Tiles heading="Rewards" {...p} />; }
/** The relationship manager and a way to write to them. */
export function FinancialAdvisorWidget(p: ThingCardProps) { return <ThingCard actionLabel="Send a message" {...p} />; }
/** An offer for the customer. */
export function SpecialOffersWidget(p: ThingCardProps) { return <ThingCard actionLabel="Apply now" {...p} />; }
/** What is due on the cards. */
export function CreditCardsWidget(p: TilesProps) { return <Tiles heading="Credit cards" {...p} />; }
/** The loans at a glance. */
export function LoansWidget(p: TilesProps) { return <Tiles heading="Loans" {...p} />; }
/** An overdue payment, announced, with Pay now. */
export function DelinquencyNotice(p: Omit<AlertProps, 'severity'>) { return <Alert heading="Payment overdue" actionLabel="Pay now" {...p} severity="error" />; }
/** Assets, liabilities and net worth. */
export function FinancialOverviewWidget(p: TilesProps) { return <Tiles heading="Financial position" {...p} />; }
/** The position in each currency. */
export function CurrencyPositionWidget(p: Opt<BarChartProps, 'heading'>) { return <BarChart heading="Position by currency" {...p} />; }
/** How much of each credit line is used. */
export function CreditLineWidget(p: MetersProps) { return <Meters heading="Credit lines" {...p} />; }
/** Bills receivable and payable. */
export function TradeBillsWidget(p: TilesProps) { return <Tiles heading="Trade bills" {...p} />; }
/** Letters of credit and guarantees expiring soon. */
export function TradeInstrumentsWidget(p: RowsProps) { return <Rows heading="Expiring soon" actionLabel="View" emptyText="Nothing expires soon." {...p} />; }
/** Reports to download. */
export function ReportsWidget(p: RowsProps) { return <Rows heading="Reports" actionLabel="Download" emptyText="No reports yet." {...p} />; }
/** The accounts by type, a tab each. */
export function AccountsWidget(p: Opt<TabSummaryProps, 'heading'>) { return <TabSummary heading="Accounts" {...p} />; }
/** The company's limits used. */
export function CorporateLimitsWidget(p: MetersProps) { return <Meters heading="Limits" {...p} />; }
/** Transactions by state, a tab each. */
export function TransactionsWidget(p: Opt<TabSummaryProps, 'heading'>) { return <TabSummary heading="Transactions" {...p} />; }
/** The last five payments, each to repeat. */
export function LastPaymentsWidget(p: RowsProps) { return <Rows heading="Last 5 payments" actionLabel="Repeat" emptyText="No payments yet." {...p} />; }
/** Shortcuts for the corporate user. */
export function QuickLinksWidget(p: QuickActionsProps) { return <QuickActions label="Quick links" {...p} />; }
/** Today's processed, in progress and rejected items. */
export function WorkSnapshotWidget(p: TilesProps) { return <Tiles heading="Today's work" {...p} />; }
/** Notices from the bank, each with Read. */
export function NotificationsWidget(p: RowsProps) { return <Rows heading="Notifications" actionLabel="Read" emptyText="No notifications." {...p} />; }
/** What is waiting, by area. */
export function PendingActionWidget(p: Opt<BarChartProps, 'heading'>) { return <BarChart heading="Pending for action" {...p} />; }
/** This user's own limits used. */
export function MyLimitsWidget(p: MetersProps) { return <Meters heading="My limits" {...p} />; }
/** Items waiting for this approver, each with Approve. */
export function PendingApprovalsWidget(p: RowsProps) { return <Rows heading="Pending approvals" actionLabel="Approve" emptyText="Nothing is waiting for you." {...p} />; }
