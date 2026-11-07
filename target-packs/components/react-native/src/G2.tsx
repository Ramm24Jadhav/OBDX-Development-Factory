/*
 * Group 2: accounts, payments and deposits. Numbers are masked to the last four digits, amounts use the currency's
 * decimals, and nothing here calls a service or keeps a secret: the screen passes the data in and acts on the events.
 */
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Button } from './Button';
import { RadioGroup } from './Choices';
import { Dropdown } from './Dropdown';
import { AmountInput, TextField, formatAmount } from './TextField';
import { FieldProps, FieldShell, Option, controlStyle, styles, useField } from './field';
import { Chips, FormProps, ChipsProps, Item, ItemList, KeyValues, KeyValuesProps, Segment, SegmentProps, Steps, Tiles, TilesProps, Touch, maskNumber, panel,
  toneColors } from './parts';
import { Enter, Roll } from './motion';
import { useTheme } from './theme';

export interface Account {
  id: string;
  /** Savings, Current, Salary. */
  name: string;
  /** The full number; only the last four digits are shown. */
  number: string;
  balance?: number;
  available?: number;
  currency?: string;
}

export interface Payee {
  id: string;
  name: string;
  bank?: string;
  /** The account number or IBAN; shown masked. */
  number: string;
}

export const accountLabel = (a: Account) => `${a.name} ${maskNumber(a.number)}`;
const money = (n: number | undefined, currency?: string) => (n === undefined ? '' : `${formatAmount(n, currency)}${currency ? ` ${currency}` : ''}`);

/* ---------- AccountSelector ---------- */

export interface AccountSelectorProps extends FieldProps<string> {
  accounts: ReadonlyArray<Account>;
  /** Shows each account's available balance beside it. */
  showBalance?: boolean;
}

/** Pick an account, its number masked (value is the account id). */
export function AccountSelector({ accounts, showBalance = true, ...props }: AccountSelectorProps) {
  const list: Option[] = accounts.map((a) => ({ value: a.id,
    label: showBalance && a.available !== undefined ? `${accountLabel(a)} · ${money(a.available, a.currency)}` : accountLabel(a) }));
  return <Dropdown {...props} options={list} placeholder={props.placeholder ?? 'Choose an account'} />;
}

/* ---------- AccountSummary ---------- */

export type AccountSummaryProps = TilesProps;

/** Each account type with its total; pick one for detail. */
export function AccountSummary(props: AccountSummaryProps) {
  return <Tiles {...props} />;
}

/* ---------- AccountBalance ---------- */

export interface AccountBalanceProps {
  testID: string;
  /** The account, for example "Savings ·· 4821". */
  label: string;
  balance: number;
  available?: number;
  currency?: string;
  /** Hidden balances show dots; without it the card keeps its own. */
  hidden?: boolean;
  onHiddenChange?: (hidden: boolean) => void;
}

/** The balance and available funds, hidden or shown with one tap. */
export function AccountBalance({ testID, label, balance, available, currency, hidden, onHiddenChange }: AccountBalanceProps) {
  const t = useTheme();
  const [own, setOwn] = useState(false);
  const off = hidden ?? own;
  const flip = () => { setOwn(!off); onHiddenChange?.(!off); };
  return (
    <Enter testID={testID} style={panel(t)}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 14, color: t.color.textMuted }}>{label}</Text>
        <Touch testID={`${testID}-hide`} label={off ? 'Show balance' : 'Hide balance'} selected={off} onPress={flip} style={{ paddingHorizontal: 8 }}>
          <Text style={{ fontSize: 13.5, fontWeight: '600', color: t.color.primaryText }}>{off ? 'Show' : 'Hide'}</Text>
        </Touch>
      </View>
      <Roll on={off ? 'hidden' : balance}>
      <Text testID={`${testID}-amount`} accessibilityLabel={off ? 'Balance hidden' : `Balance ${money(balance, currency)}`}
            style={{ fontSize: 30, fontWeight: '700', color: t.color.text, fontVariant: ['tabular-nums'] }}>
        {off ? '••••••' : formatAmount(balance, currency)}{off || !currency ? '' : <Text style={{ fontSize: 15, color: t.color.textMuted }}> {currency}</Text>}
      </Text>
      </Roll>
      {available !== undefined ? (
        <Text style={{ fontSize: 13.5, color: t.color.textMuted }}>Available {off ? '••••' : money(available, currency)}</Text>
      ) : null}
    </Enter>
  );
}

/* ---------- AccountCard ---------- */

export interface AccountCardProps {
  testID: string;
  account: Account;
  /** A tag on the card: "Primary". */
  badge?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** One account with its balance and a way in. */
export function AccountCard({ testID, account, badge, actionLabel = 'View details', onAction }: AccountCardProps) {
  const t = useTheme();
  const c = toneColors(t, 'info');
  return (
    <Enter testID={testID} style={panel(t)}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{accountLabel(account)}</Text>
        {badge ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.fg, backgroundColor: c.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
          {badge}</Text> : null}
      </View>
      <Text style={{ fontSize: 14, color: t.color.textBody }}>
        Balance {money(account.balance, account.currency)}{account.available !== undefined ? ` · Available ${money(account.available, account.currency)}` : ''}
      </Text>
      {onAction ? (
        <Touch testID={`${testID}-action`} label={`${actionLabel}, ${accountLabel(account)}`} onPress={onAction} role="link">
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.color.primaryText }}>{actionLabel} →</Text>
        </Touch>
      ) : null}
    </Enter>
  );
}

/* ---------- AccountDetails, TransferSummary, TransactionDetails, DepositTopUp, DepositRedemption ---------- */

export type DetailsProps = KeyValuesProps;

/** Number, branch, IBAN and holder, with one action (download a statement). */
export function AccountDetails(props: DetailsProps) {
  return <KeyValues {...props} />;
}

/** Everything about the transfer before it is sent; busy stops a second confirm. */
export function TransferSummary({ actionLabel = 'Confirm transfer', ...props }: DetailsProps) {
  return <KeyValues {...props} actionLabel={actionLabel} />;
}

/** One transaction with all its facts. */
export function TransactionDetails(props: DetailsProps) {
  return <KeyValues {...props} />;
}

/** Add money to a running deposit: the deposit, the top-up and the new maturity value. */
export function DepositTopUp({ actionLabel = 'Top up', ...props }: DetailsProps) {
  return <KeyValues {...props} actionLabel={actionLabel} />;
}

/** Close a deposit early: the penalty is shown before the button (mark it emphasis "negative", the total "total"). */
export function DepositRedemption({ actionLabel = 'Redeem', ...props }: DetailsProps) {
  return <KeyValues {...props} actionLabel={actionLabel} />;
}

/* ---------- AccountNumber ---------- */

/** Checks an IBAN with its mod-97 check digits (ISO 13616). */
export function ibanValid(iban: string): boolean {
  const s = iban.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) { return false; }
  const moved = s.slice(4) + s.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const n = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of n) { rest = (rest * 10 + Number(d)) % 97; }
  }
  return rest === 1;
}

/** Groups an IBAN in fours. */
export const groupIban = (iban: string) => iban.replace(/\s/g, '').toUpperCase().replace(/(.{4})(?=.)/g, '$1 ');

/** Masks all but the first four and the last four characters. */
export const maskIban = (iban: string) => {
  const s = iban.replace(/\s/g, '').toUpperCase();
  return s.length <= 8 ? groupIban(s) : `${s.slice(0, 4)} •••• ${s.slice(-4)}`;
};

export interface AccountNumberProps extends FieldProps<string> {
  /** iban checks the check digits; account takes digits only. */
  format?: 'iban' | 'account';
}

/** An account number or IBAN: grouped while typed, checked when the customer leaves, and masked when not in focus. */
export function AccountNumber(props: AccountNumberProps) {
  const { testID, label, value, onChange, required, readOnly, disabled, helpText, placeholder, format = 'iban' } = props;
  const t = useTheme();
  const s = styles(t);
  // What is typed but fails the check stays here, not in the value (as a JET field with a validator)
  const [typed, setTyped] = useState<string | null>(null);
  const v = typed ?? value ?? '';
  const valid = (x: string) => (format === 'iban' ? ibanValid(x) : /^\d{6,18}$/.test(x));
  const ok = valid(v);
  const own = v && !ok ? (format === 'iban' ? 'Check the IBAN: the check digits do not match.' : 'Enter 6 to 18 digits.') : '';
  const [left, setLeft] = useState(false);
  const f = useField(props, value, left ? own : '');
  const shown = f.focused ? (format === 'iban' ? groupIban(v) : v) : ok ? (format === 'iban' ? maskIban(v) : maskNumber(v)) : v;
  return (
    <FieldShell testID={testID} label={label} required={required} error={f.error} helpText={helpText}>
      <View style={controlStyle(t, { focused: f.focused, error: f.error, disabled, readOnly })}>
        <TextInput testID={`${testID}-input`} style={[s.input, { fontVariant: ['tabular-nums'], letterSpacing: 0.5 }]} value={shown} placeholder={placeholder}
                   placeholderTextColor={t.color.textMuted} autoCapitalize="characters" autoCorrect={false} spellCheck={false}
                   keyboardType={format === 'account' ? 'number-pad' : 'default'} editable={!readOnly && !disabled}
                   accessibilityLabel={label} accessibilityHint={f.error || helpText} aria-required={required} aria-invalid={!!f.error}
                   onFocus={f.onFocus} onBlur={() => { f.onBlur(); setLeft(true); }}
                   onChangeText={(x) => {
                     const next = format === 'iban' ? x.replace(/\s/g, '').toUpperCase() : x.replace(/\D/g, '');
                     if (next === '' || valid(next)) { setTyped(null); onChange?.(next); } else { setTyped(next); }
                   }} />
        {ok ? <Text style={[s.side, { color: t.color.successText }]} accessibilityLabel="Checked">✓</Text> : null}
      </View>
    </FieldShell>
  );
}

/* ---------- QuickActions ---------- */

export interface QuickAction {
  id: string;
  label: string;
  /** A short symbol or emoji; it is not read. */
  icon?: string;
}

export interface QuickActionsProps {
  testID: string;
  label?: string;
  actions: ReadonlyArray<QuickAction>;
  onAction: (id: string) => void;
}

/** The everyday tasks, one tap away, four to a row. */
export function QuickActions({ testID, label, actions, onAction }: QuickActionsProps) {
  const t = useTheme();
  return (
    <View testID={testID} style={{ gap: 10 }}>
      {label ? <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{label}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {actions.map((a) => (
          <Touch key={a.id} testID={`${testID}-${a.id}`} label={a.label} onPress={() => onAction(a.id)} style={{ width: '25%', alignItems: 'center', gap: 6, paddingVertical: 6 }}>
            <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: t.color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20, color: t.color.primaryText }}>{a.icon ?? a.label[0]}</Text>
            </View>
            <Text style={{ fontSize: 12.5, textAlign: 'center', color: t.color.textBody }} numberOfLines={2}>{a.label}</Text>
          </Touch>
        ))}
      </View>
    </View>
  );
}

/* ---------- BeneficiarySelector and BeneficiaryCard ---------- */

export interface BeneficiarySelectorProps extends FieldProps<string> {
  payees: ReadonlyArray<Payee>;
  /** Shows "Add a new payee" under the list. */
  onAdd?: () => void;
}

/** Saved payees to pick from, searchable when there are many, with Add a new payee (value is the payee id). */
export function BeneficiarySelector(props: BeneficiarySelectorProps) {
  const { testID, label, value, onChange, payees, onAdd, disabled, readOnly, required, helpText, error } = props;
  const t = useTheme();
  const s = styles(t);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q ? payees.filter((p) => `${p.name} ${p.bank ?? ''}`.toLowerCase().includes(q)) : payees;
  return (
    <View testID={testID} style={s.field} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={s.label} importantForAccessibility="no">{label}{required ? <Text style={s.req}> *</Text> : null}</Text>
      {payees.length > 5 ? <TextField testID={`${testID}-search`} label={`Search ${label}`} value={query} onChange={setQuery} clearable /> : null}
      <Enter style={[panel(t), { gap: 0, paddingVertical: 4 }]}>
        {shown.length === 0 ? <Text style={{ padding: 12, color: t.color.textMuted }}>{q ? `No payee matches "${query}".` : 'No saved payees yet.'}</Text> : null}
        {shown.map((p) => {
          const on = p.id === value;
          return (
            <Touch key={p.id} testID={`${testID}-${p.id}`} role="radio" label={`${p.name}, ${p.bank ? `${p.bank}, ` : ''}${maskNumber(p.number)}`} selected={on}
                   disabled={disabled || readOnly} onPress={() => onChange?.(p.id)} style={{ paddingHorizontal: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: on ? '700' : '500', color: t.color.text }}>{p.name}</Text>
                  <Text style={{ fontSize: 13, color: t.color.textMuted }}>{[p.bank, maskNumber(p.number)].filter(Boolean).join(' · ')}</Text>
                </View>
                {on ? <Text style={{ color: t.color.primary, fontSize: 16 }}>✓</Text> : null}
              </View>
            </Touch>
          );
        })}
      </Enter>
      {onAdd ? <Button testID={`${testID}-add`} label="Add a new payee" chroming="borderless" onAction={onAdd} /> : null}
      {error ? <Text style={s.error} accessibilityRole="alert">{error}</Text> : helpText ? <Text style={s.help}>{helpText}</Text> : null}
    </View>
  );
}

export interface BeneficiaryCardProps {
  testID: string;
  payee: Payee;
  /** When the payee was added: "added 12 Mar". */
  note?: string;
  onPay?: () => void;
}

/** One payee with their bank and a quick pay. */
export function BeneficiaryCard({ testID, payee, note, onPay }: BeneficiaryCardProps) {
  const t = useTheme();
  return (
    <Enter testID={testID} style={panel(t)}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{payee.name}</Text>
        {payee.bank ? <Text style={{ fontSize: 13, color: t.color.textMuted }}>{payee.bank}</Text> : null}
      </View>
      <Text style={{ fontSize: 14, color: t.color.textBody }}>{[maskIban(payee.number), note].filter(Boolean).join(' · ')}</Text>
      {onPay ? (
        <Touch testID={`${testID}-pay`} label={`Pay now, ${payee.name}`} onPress={onPay} role="link">
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.color.primaryText }}>Pay now →</Text>
        </Touch>
      ) : null}
    </Enter>
  );
}

/* ---------- PaymentForm ---------- */

export interface PaymentValue {
  from: string;
  to: string;
  amount: number | null;
  note: string;
}

export interface PaymentFormProps extends FormProps<PaymentValue> {
  accounts: ReadonlyArray<Account>;
  payees: ReadonlyArray<Payee>;
  currency?: string;
  /** Called with the value once every field is filled and the amount is within the account's available balance. */
  onReview: (value: PaymentValue) => void;
  reviewLabel?: string;
}

/** Payee and amount, ready to review: the fields are checked when Review is pressed, each with what to fix. */
export function PaymentForm(props: PaymentFormProps) {
  const { testID, label, value, onChange, accounts, payees, currency, onReview, reviewLabel = 'Review payment', disabled, error } = props;
  const t = useTheme();
  const [tried, setTried] = useState(false);
  const v = value ?? { from: '', to: '', amount: null, note: '' };
  const set = (patch: Partial<PaymentValue>) => onChange?.({ ...v, ...patch });
  const from = accounts.find((a) => a.id === v.from);
  const problems = {
    from: v.from ? '' : 'Choose the account to pay from.',
    to: v.to ? '' : 'Choose who to pay.',
    amount: v.amount === null || v.amount <= 0 ? 'Enter the amount.'
      : from?.available !== undefined && v.amount > from.available ? `The amount is more than the available ${money(from.available, from.currency ?? currency)}.` : '',
  };
  const ok = !problems.from && !problems.to && !problems.amount;
  return (
    <Enter testID={testID} style={panel(t)}>
      {label ? <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{label}</Text> : null}
      <AccountSelector testID={`${testID}-from`} label="From account" accounts={accounts} value={v.from} onChange={(x) => set({ from: x })} required
                       disabled={disabled} error={tried ? problems.from : undefined} />
      <Dropdown testID={`${testID}-to`} label="To" value={v.to} onChange={(x) => set({ to: x })} required disabled={disabled}
                options={payees.map((p) => ({ value: p.id, label: `${p.name} ${maskNumber(p.number)}` }))} placeholder="Choose a payee"
                error={tried ? problems.to : undefined} />
      <AmountInput testID={`${testID}-amount`} label="Amount" currency={currency ?? from?.currency} value={v.amount} onChange={(x) => set({ amount: x })} required
                   disabled={disabled} error={tried ? problems.amount : undefined} />
      <TextField testID={`${testID}-note`} label="Note to the payee" value={v.note} onChange={(x) => set({ note: x })} maxLength={140} disabled={disabled} />
      {error ? <Text style={styles(t).error} accessibilityRole="alert">{error}</Text> : null}
      <Button testID={`${testID}-review`} label={reviewLabel} disabled={disabled} onAction={() => { setTried(true); if (ok) { onReview(v); } }} />
    </Enter>
  );
}

/* ---------- PaymentStatus ---------- */

export interface PaymentStatusProps {
  testID: string;
  label?: string;
  steps?: ReadonlyArray<string>;
  /** The index of the step the payment is at; steps.length when it is complete. */
  value: number;
}

/** Where the payment is now. */
export function PaymentStatus({ testID, steps = ['Initiated', 'Approved', 'Sent', 'Completed'], label = 'Payment status', value }: PaymentStatusProps) {
  // Past the last step the payment is complete: every step done
  const list = value >= steps.length ? steps.map((s) => ({ label: s, state: 'done' as const })) : steps;
  return <Steps testID={testID} label={label} steps={list} selectedStep={steps[value]} />;
}

/* ---------- TransactionHistory ---------- */

export interface Transaction {
  id: string;
  description: string;
  /** As the screen shows it: "Today 08:14". */
  date: string;
  /** Money in is positive, money out negative. */
  amount: number;
  currency?: string;
}

export interface TransactionHistoryProps {
  testID: string;
  label?: string;
  transactions: ReadonlyArray<Transaction>;
  /** all, in or out; without it the list keeps its own. */
  filter?: 'all' | 'in' | 'out';
  onFilterChange?: (filter: 'all' | 'in' | 'out') => void;
  onSelect?: (transaction: Transaction) => void;
  /** Shows only the first rows and a View all button (the dashboard widget). */
  limit?: number;
  onViewAll?: () => void;
}

/** Recent activity with money in and money out filters; money in is green with a plus, so colour is never the only sign. */
export function TransactionHistory({ testID, label = 'Transactions', transactions, filter, onFilterChange, onSelect, limit, onViewAll }: TransactionHistoryProps) {
  const [own, setOwn] = useState<'all' | 'in' | 'out'>('all');
  const f = filter ?? own;
  const list = transactions.filter((x) => (f === 'in' ? x.amount > 0 : f === 'out' ? x.amount < 0 : true));
  const rows: Item[] = (limit ? list.slice(0, limit) : list).map((x) => ({ id: x.id, title: x.description, meta: x.date, tone: x.amount > 0 ? 'success' : undefined,
    value: `${x.amount > 0 ? '+' : '−'}${formatAmount(Math.abs(x.amount), x.currency)}${x.currency ? ` ${x.currency}` : ''}` }));
  return (
    <View testID={testID} style={{ gap: 8 }}>
      {limit ? null : (
        <Segment testID={`${testID}-filter`} label="Show" value={f} options={[{ value: 'all', label: 'All' }, { value: 'in', label: 'Money in' },
          { value: 'out', label: 'Money out' }]} onChange={(x) => { const v = x as 'all' | 'in' | 'out'; setOwn(v); onFilterChange?.(v); }} />
      )}
      <ItemList testID={`${testID}-list`} heading={label} items={rows} emptyText="No transactions in this view."
                onSelect={onSelect ? (i) => onSelect(transactions.find((x) => x.id === i.id)!) : undefined} />
      {onViewAll ? <Button testID={`${testID}-all`} label="View all" chroming="borderless" onAction={onViewAll} /> : null}
    </View>
  );
}

/* ---------- TransactionFilter and PaymentSchedule ---------- */

/** Narrow the history by type. */
export function TransactionFilter(props: ChipsProps) {
  return <Chips {...props} />;
}

export type PaymentScheduleProps = Omit<SegmentProps, 'options'> & { options?: SegmentProps['options'] };

/** How often a payment repeats. */
export function PaymentSchedule({ options = ['Once', 'Weekly', 'Monthly'], ...props }: PaymentScheduleProps) {
  return <Segment {...props} options={options} />;
}

/* ---------- TransactionReceipt ---------- */

export interface TransactionReceiptProps {
  testID: string;
  title?: string;
  amount: number;
  currency?: string;
  rows: KeyValuesProps['rows'];
  onShare?: () => void;
  onDownload?: () => void;
}

/** What was paid, with share and download; the outcome is announced when it opens. */
export function TransactionReceipt({ testID, title = 'Payment sent', amount, currency, rows, onShare, onDownload }: TransactionReceiptProps) {
  const t = useTheme();
  return (
    <Enter testID={testID} style={[panel(t), { alignItems: 'stretch' }]}>
      <View style={{ alignItems: 'center', gap: 6 }} accessible accessibilityRole="summary" accessibilityLiveRegion="polite"
            accessibilityLabel={`${title}, ${money(amount, currency)}`}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: t.color.successSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 24, color: t.color.success }}>✓</Text>
        </View>
        <Text style={{ fontSize: 16, fontWeight: '600', color: t.color.text }}>{title}</Text>
        <Text style={{ fontSize: 26, fontWeight: '700', color: t.color.text, fontVariant: ['tabular-nums'] }}>{money(amount, currency)}</Text>
      </View>
      <KeyValues testID={`${testID}-rows`} rows={rows} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {onShare ? <View style={{ flex: 1 }}><Button testID={`${testID}-share`} label="Share" chroming="outlined" onAction={onShare} /></View> : null}
        {onDownload ? <View style={{ flex: 1 }}><Button testID={`${testID}-download`} label="Download" chroming="outlined" onAction={onDownload} /></View> : null}
      </View>
    </Enter>
  );
}

/* ---------- UpcomingBills ---------- */

export interface Bill {
  id: string;
  payee: string;
  /** As the screen shows it: "Due 18 Jan". */
  due: string;
  amount: number;
  currency?: string;
  overdue?: boolean;
}

export interface UpcomingBillsProps {
  testID: string;
  label?: string;
  bills: ReadonlyArray<Bill>;
  onPay?: (bill: Bill) => void;
  actionLabel?: string;
}

/** Bills due soon, pay from the list; overdue ones are marked in words. */
export function UpcomingBills({ testID, label = 'Upcoming bills', bills, onPay, actionLabel = 'Pay' }: UpcomingBillsProps) {
  const items: Item[] = bills.map((b) => ({ id: b.id, title: b.payee, meta: b.overdue ? `Overdue · ${b.due}` : b.due, tone: b.overdue ? 'danger' : undefined,
    value: money(b.amount, b.currency) }));
  return <ItemList testID={testID} heading={label} items={items} actionLabel={onPay ? actionLabel : undefined} emptyText="No bills due."
                   onAction={(i) => onPay?.(bills.find((b) => b.id === i.id)!)} />;
}

/* ---------- DepositsSummary ---------- */

/** All deposits, interest earned and the next maturity. */
export function DepositsSummary(props: TilesProps) {
  return <Tiles {...props} />;
}

/* ---------- NewDepositForm ---------- */

export interface DepositValue {
  from: string;
  amount: number | null;
  /** The tenure in months. */
  months: number | null;
}

export interface NewDepositFormProps extends FormProps<DepositValue> {
  accounts: ReadonlyArray<Account>;
  /** The tenures the bank offers, in months. */
  tenures?: ReadonlyArray<number>;
  currency?: string;
  /** The smallest deposit the bank takes. */
  minAmount?: number;
  onReview: (value: DepositValue) => void;
}

const tenureLabel = (m: number) => (m % 12 === 0 ? `${m / 12} year${m === 12 ? '' : 's'}` : `${m} months`);

/** Amount, tenure and where the money comes from. */
export function NewDepositForm(props: NewDepositFormProps) {
  const { testID, label, value, onChange, accounts, tenures = [3, 6, 12, 24], currency, minAmount, onReview, disabled } = props;
  const t = useTheme();
  const [tried, setTried] = useState(false);
  const v = value ?? { from: '', amount: null, months: null };
  const set = (patch: Partial<DepositValue>) => onChange?.({ ...v, ...patch });
  const from = accounts.find((a) => a.id === v.from);
  const cur = currency ?? from?.currency;
  const problems = {
    from: v.from ? '' : 'Choose the account the money comes from.',
    amount: v.amount === null ? 'Enter the amount.' : minAmount !== undefined && v.amount < minAmount ? `The smallest deposit is ${money(minAmount, cur)}.`
      : from?.available !== undefined && v.amount > from.available ? `The amount is more than the available ${money(from.available, cur)}.` : '',
    months: v.months ? '' : 'Choose the tenure.',
  };
  return (
    <Enter testID={testID} style={panel(t)}>
      {label ? <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{label}</Text> : null}
      <AccountSelector testID={`${testID}-from`} label="From account" accounts={accounts} value={v.from} onChange={(x) => set({ from: x })} required
                       disabled={disabled} error={tried ? problems.from : undefined} />
      <AmountInput testID={`${testID}-amount`} label="Amount" currency={cur} value={v.amount} onChange={(x) => set({ amount: x })} required disabled={disabled}
                   error={tried ? problems.amount : undefined} />
      <Segment testID={`${testID}-tenure`} label="Tenure" value={v.months ? String(v.months) : ''} disabled={disabled}
               options={tenures.map((m) => ({ value: String(m), label: tenureLabel(m) }))} onChange={(x) => set({ months: Number(x) })}
               error={tried ? problems.months : undefined} />
      <Button testID={`${testID}-review`} label="Review deposit" disabled={disabled}
              onAction={() => { setTried(true); if (!problems.from && !problems.amount && !problems.months) { onReview(v); } }} />
    </Enter>
  );
}

/* ---------- MaturityInstructions ---------- */

export interface MaturityInstructionsProps extends FieldProps<string> {
  options?: ReadonlyArray<string | Option>;
}

/** What happens when the deposit matures. */
export function MaturityInstructions({ options = [
  { value: 'renew-all', label: 'Renew principal and interest' }, { value: 'renew-principal', label: 'Renew principal, pay out interest' },
  { value: 'close', label: 'Close and pay out' }], ...props }: MaturityInstructionsProps) {
  return <RadioGroup {...props} options={options} />;
}
