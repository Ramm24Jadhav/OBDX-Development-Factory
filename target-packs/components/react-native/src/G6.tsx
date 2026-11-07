/*
 * Group 6: the dashboard widgets (retail and corporate; those without a React Native name are left out). Each is a
 * card a dashboard lays out, built from the same parts as the screens, so a widget and its screen read alike.
 */
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from './Button';
import { NotificationPanel, NotificationPanelProps } from './G1';
import { QuickActions, QuickActionsProps, TransactionHistory, TransactionHistoryProps, UpcomingBills, UpcomingBillsProps } from './G2';
import { ApprovalQueue, ApprovalQueueProps } from './G4';
import { CalculatorProps, DepositCalculator, ForexCalculator, LoanCalculator, LoanInputs } from './G5';
import { Tabs } from './Tabs';
import { TabsVariant } from './variants-v2';
import { Banner, BannerProps, Bars, BarsProps, InfoCard, InfoCardProps, Item, ItemList, Meter, ProgressList, Tiles, TilesProps, panel } from './parts';
import { Enter } from './motion';
import { useTheme } from './theme';

/* ---------- Tile widgets ---------- */

/** Holdings by type (current and savings, deposits, loans, cards, funds); pick one for its summary. */
export function OverviewWidget({ label = 'Overview', ...props }: TilesProps) {
  return <Tiles {...props} label={label} />;
}

/** Points, vouchers and cashback to redeem. */
export function RewardsWidget({ label = 'Rewards', ...props }: TilesProps) {
  return <Tiles {...props} label={label} />;
}

/** Total and minimum due, and the available limit. */
export function CreditCardsWidget({ label = 'Credit cards', ...props }: TilesProps) {
  return <Tiles {...props} label={label} />;
}

/** Loan count, outstanding and the next instalment. */
export function LoansWidget({ label = 'Loans and finances', ...props }: TilesProps) {
  return <Tiles {...props} label={label} />;
}

/** Processed, in progress and rejected today. */
export function WorkSnapshotWidget({ label = 'Work snapshot for today', ...props }: TilesProps) {
  return <Tiles {...props} label={label} />;
}

/* ---------- List widgets ---------- */

export interface QuickInsightsWidgetProps {
  testID: string;
  label?: string;
  /** Events that need attention: a deposit maturing, a card due, a low balance. */
  insights: ReadonlyArray<Item>;
  actionLabel?: string;
  onAction: (insight: Item) => void;
}

/** Events that need attention, each with an action. */
export function QuickInsightsWidget({ testID, label = 'Quick insights', insights, actionLabel = 'View', onAction }: QuickInsightsWidgetProps) {
  return <ItemList testID={testID} heading={label} items={insights} actionLabel={actionLabel} onAction={onAction} emptyText="Nothing needs you today." />;
}

/** The latest activity, five rows, with View all. */
export function RecentTransactionsWidget({ label = 'Recent transactions', limit = 5, ...props }: TransactionHistoryProps) {
  return <TransactionHistory {...props} label={label} limit={limit} />;
}

/** Bills due, with Pay now. */
export function BillsWidget({ label = 'Bills', actionLabel = 'Pay now', ...props }: UpcomingBillsProps) {
  return <UpcomingBills {...props} label={label} actionLabel={actionLabel} />;
}

/** The last bank notifications. */
export function NotificationsWidget(props: NotificationPanelProps) {
  return <NotificationPanel {...props} />;
}

/** Items waiting for this approver, prioritized first. */
export function PendingApprovalsWidget(props: ApprovalQueueProps) {
  return <ApprovalQueue {...props} />;
}

/** Own account transfer, funds transfer, ad-hoc payment, file upload. */
export function QuickLinksWidget({ label = 'Quick links', ...props }: QuickActionsProps) {
  return <QuickActions {...props} label={label} />;
}

/* ---------- Chart widgets ---------- */

/** Total spend over the past months. */
export function SpendAnalysisWidget({ label = 'Spend analysis', ...props }: Omit<BarsProps, 'label'> & { label?: string }) {
  return <Bars {...props} label={label} />;
}

/** Financial and non-financial items by module, as bars across. */
export function PendingActionWidget({ label = 'Pending for action', ...props }: Omit<BarsProps, 'label' | 'horizontal'> & { label?: string }) {
  return <Bars {...props} label={label} horizontal />;
}

/* ---------- Progress widgets ---------- */

export interface ProgressWidgetProps {
  testID: string;
  label?: string;
  items: ReadonlyArray<Meter>;
  currency?: string;
}

/** Active goals and their progress, with Add goal. */
export function GoalsWidget({ testID, label = 'Goals', items, currency, onAdd }: ProgressWidgetProps & { onAdd?: () => void }) {
  return (
    <View testID={testID} style={{ gap: 8 }}>
      <ProgressList testID={`${testID}-list`} label={label} items={items} currency={currency} measure="saved" />
      {onAdd ? <Button testID={`${testID}-add`} label="Add goal" chroming="outlined" onAction={onAdd} /> : null}
    </View>
  );
}

/** Budgets and what is used. */
export function BudgetsWidget({ testID, label = 'Budgets', items, currency }: ProgressWidgetProps) {
  return <ProgressList testID={testID} label={label} items={items} currency={currency} measure="used" />;
}

export interface CreditScoreWidgetProps {
  testID: string;
  label?: string;
  score: number;
  max: number;
  /** The bureau's word for the score ("Good"); the component does not grade it. */
  band?: string;
  /** When the score was last updated. */
  updated?: string;
}

/** The current credit status. */
export function CreditScoreWidget({ testID, label = 'Credit score', score, max, band, updated }: CreditScoreWidgetProps) {
  const t = useTheme();
  return (
    <View testID={testID} style={{ gap: 6 }}>
      <ProgressList testID={`${testID}-bar`} label={label} items={[{ label: band ?? 'Score', value: score, max }]} measure="score" />
      {updated ? <Text style={{ fontSize: 12.5, color: t.color.textMuted }}>Updated {updated}</Text> : null}
    </View>
  );
}

/* ---------- Card widgets ---------- */

/** The relationship manager or the bank's contact details. */
export function FinancialAdvisorWidget({ actionLabel = 'Send a message', ...props }: InfoCardProps) {
  return <InfoCard {...props} actionLabel={actionLabel} />;
}

/** Offers for this customer. */
export function SpecialOffersWidget({ actionLabel = 'Apply now', ...props }: InfoCardProps) {
  return <InfoCard {...props} actionLabel={actionLabel} />;
}

export interface DelinquencyNoticeProps extends Omit<BannerProps, 'severity'> {
  /** The notice shows only while a loan is overdue. */
  overdue: boolean;
}

/** Shown only when a loan is overdue, with Pay now. */
export function DelinquencyNotice({ overdue, actionLabel = 'Pay now', ...props }: DelinquencyNoticeProps) {
  return overdue ? <Banner {...props} severity="error" actionLabel={actionLabel} /> : null;
}

/* ---------- Tab widgets ---------- */

export interface SummaryTab {
  id: string;
  label: string;
  /** One line for the tab: "12 accounts · 3.4M". */
  summary: string;
}

export interface TabsWidgetProps {
  testID: string;
  label: string;
  tabs: ReadonlyArray<SummaryTab>;
  /** The tab shown; without it the widget keeps its own. */
  value?: string;
  onChange?: (id: string) => void;
  /** Opens the tab's full screen. */
  onOpen?: (id: string) => void;
  /** The style variant (variants/v2.json), on the tab strip. */
  variant?: TabsVariant;
}

function SummaryTabs({ testID, label, tabs, value, onChange, onOpen, variant }: TabsWidgetProps) {
  const t = useTheme();
  const [own, setOwn] = useState(tabs[0]?.id ?? '');
  const current = value ?? own;
  return (
    <Enter testID={testID} style={panel(t)}>
      <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{label}</Text>
      <Tabs testID={`${testID}-tabs`} label={label} variant={variant} selection={current} onSelectionChange={(id) => { setOwn(id); onChange?.(id); }}
            tabs={tabs.map((x) => ({ id: x.id, label: x.label, content: (
              <View style={{ gap: 8 }}>
                <Text testID={`${testID}-${x.id}-summary`} style={{ fontSize: 15, color: t.color.textBody }}>{x.summary}</Text>
                {onOpen ? <Button testID={`${testID}-${x.id}-open`} label={`Open ${x.label}`} chroming="borderless" onAction={() => onOpen(x.id)} /> : null}
              </View>
            ) }))} />
    </Enter>
  );
}

/** Current and savings, deposits and loans, each a tab with its count and total. */
export function AccountsWidget(props: TabsWidgetProps) {
  return <SummaryTabs {...props} />;
}

/** Pending for approval, my initiated, the log and my approved. */
export function TransactionsWidget(props: TabsWidgetProps) {
  return <SummaryTabs {...props} />;
}

/* ---------- CalculatorsWidget ---------- */

export interface CalculatorsWidgetProps {
  testID: string;
  label?: string;
  currency?: string;
  loan: CalculatorProps<LoanInputs>['value'];
  onLoanChange: (value: LoanInputs) => void;
  deposit: LoanInputs;
  onDepositChange: (value: LoanInputs) => void;
  /** The forex calculator: the amount sent, the payee's currency and the rate. */
  forex?: { value: number | null; to: string; rate: number; onChange: (value: number | null) => void };
}

/** Loan, term deposit and forex calculators behind tabs. */
export function CalculatorsWidget({ testID, label = 'Calculators', currency = 'USD', loan, onLoanChange, deposit, onDepositChange, forex }: CalculatorsWidgetProps) {
  const [tab, setTab] = useState('loan');
  const tabs = [
    { id: 'loan', label: 'Loan', content: <LoanCalculator testID={`${testID}-loan`} value={loan} onChange={onLoanChange} currency={currency} /> },
    { id: 'deposit', label: 'Deposit', content: <DepositCalculator testID={`${testID}-deposit`} value={deposit} onChange={onDepositChange} currency={currency} /> },
    ...(forex ? [{ id: 'forex', label: 'Forex', content: <ForexCalculator testID={`${testID}-forex`} value={forex.value} onChange={forex.onChange} currency={currency}
                                                                          to={forex.to} rate={forex.rate} /> }] : []),
  ];
  return <Tabs testID={testID} label={label} tabs={tabs} selection={tab} onSelectionChange={setTab} />;
}
