/*
 * Group 3: loans, cards and security. Card numbers show only their last four digits, codes and PINs are never kept by
 * a component, and the biometric check is the app's own (expo-local-authentication, for example), passed in.
 */
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from './Button';
import { DataTable } from './DataTable';
import { DatePicker } from './DatePicker';
import { Dialog } from './Dialog';
import { Dropdown } from './Dropdown';
import { TextArea, Toggle } from './Forms';
import { Account, AccountSelector } from './G2';
import { AmountInput, TextField, formatAmount } from './TextField';
import { FieldProps, Option, styles } from './field';
import { Banner, FormProps, BannerProps, CodeBoxes, CodeBoxesProps, Event, Item, ItemList, KeyValues, KeyValuesProps, Segment, SliderControl, SliderControlProps, Steps,
  StepsProps, Tiles, TilesProps, TimelineList, Touch, maskNumber, panel } from './parts';
import { Enter } from './motion';
import { useTheme } from './theme';

const money = (n: number, currency?: string) => `${formatAmount(n, currency)}${currency ? ` ${currency}` : ''}`;

/** The monthly instalment of a loan (the standard reducing-balance formula); annualRate is a percentage. */
export function instalment(amount: number, annualRate: number, months: number): number {
  if (months <= 0) { return 0; }
  const r = annualRate / 1200;
  if (r === 0) { return amount / months; }
  const k = (1 + r) ** months;
  return (amount * r * k) / (k - 1);
}

/* ---------- LoansSummary and CardList ---------- */

/** Loans, outstanding and the next instalment; an overdue tile takes tone "danger". */
export function LoansSummary(props: TilesProps) {
  return <Tiles {...props} />;
}

/** Each card with its dues and limit; pick one for detail. */
export function CardList(props: TilesProps) {
  return <Tiles {...props} />;
}

/* ---------- LoanRepayment, RaiseDispute and AddOnCard (forms) ---------- */

export interface RepaymentValue {
  loan: string;
  amount: number | null;
  from: string;
}

export interface LoanRepaymentProps extends FormProps<RepaymentValue> {
  loans: ReadonlyArray<Option>;
  accounts: ReadonlyArray<Account>;
  currency?: string;
  /** The amount due; a Pay the instalment shortcut fills it. */
  due?: number;
  onReview: (value: RepaymentValue) => void;
}

/** Pay an instalment or a part of the loan. */
export function LoanRepayment(props: LoanRepaymentProps) {
  const { testID, label, value, onChange, loans, accounts, currency, due, onReview, disabled } = props;
  const t = useTheme();
  const [tried, setTried] = useState(false);
  const v = value ?? { loan: '', amount: null, from: '' };
  const set = (patch: Partial<RepaymentValue>) => onChange?.({ ...v, ...patch });
  const from = accounts.find((a) => a.id === v.from);
  const problems = {
    loan: v.loan ? '' : 'Choose the loan.',
    amount: !v.amount || v.amount <= 0 ? 'Enter the amount.'
      : from?.available !== undefined && v.amount > from.available ? `The amount is more than the available ${money(from.available, currency)}.` : '',
    from: v.from ? '' : 'Choose the account to pay from.',
  };
  return (
    <Enter testID={testID} style={panel(t)}>
      {label ? <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{label}</Text> : null}
      <Dropdown testID={`${testID}-loan`} label="Loan" options={loans} value={v.loan} onChange={(x) => set({ loan: x })} required disabled={disabled}
                error={tried ? problems.loan : undefined} />
      <AmountInput testID={`${testID}-amount`} label="Amount" currency={currency} value={v.amount} onChange={(x) => set({ amount: x })} required disabled={disabled}
                   error={tried ? problems.amount : undefined} helpText={due !== undefined ? `The instalment due is ${money(due, currency)}.` : undefined} />
      {due !== undefined ? <Button testID={`${testID}-due`} label="Pay the instalment due" chroming="borderless" disabled={disabled}
                                   onAction={() => set({ amount: due })} /> : null}
      <AccountSelector testID={`${testID}-from`} label="Pay from" accounts={accounts} value={v.from} onChange={(x) => set({ from: x })} required disabled={disabled}
                       error={tried ? problems.from : undefined} />
      <Button testID={`${testID}-review`} label="Review repayment" disabled={disabled}
              onAction={() => { setTried(true); if (!problems.loan && !problems.amount && !problems.from) { onReview(v); } }} />
    </Enter>
  );
}

export interface DisputeValue {
  reason: string;
  details: string;
}

export interface RaiseDisputeProps extends FormProps<DisputeValue> {
  /** The transaction being questioned: "Coffee House · 4.50". */
  transaction: string;
  reasons?: ReadonlyArray<string | Option>;
  onSubmit: (value: DisputeValue) => void;
  busy?: boolean;
}

/** Question a card transaction: the reason, then what happened. */
export function RaiseDispute(props: RaiseDisputeProps) {
  const { testID, label = 'Raise a dispute', value, onChange, transaction, onSubmit, busy, disabled,
    reasons = ['Charged twice', 'I did not make this payment', 'The amount is wrong', 'I did not get the goods', 'Other'] } = props;
  const t = useTheme();
  const [tried, setTried] = useState(false);
  const v = value ?? { reason: '', details: '' };
  const set = (patch: Partial<DisputeValue>) => onChange?.({ ...v, ...patch });
  const problems = { reason: v.reason ? '' : 'Choose a reason.', details: v.reason === 'Other' && !v.details.trim() ? 'Say what happened.' : '' };
  return (
    <Enter testID={testID} style={panel(t)}>
      <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{label}</Text>
      <Text style={{ fontSize: 14, color: t.color.textBody }}>Transaction: {transaction}</Text>
      <Dropdown testID={`${testID}-reason`} label="Reason" options={reasons} value={v.reason} onChange={(x) => set({ reason: x })} required disabled={disabled}
                error={tried ? problems.reason : undefined} />
      <TextArea testID={`${testID}-details`} label="What happened" value={v.details} onChange={(x) => set({ details: x })} maxLength={500} disabled={disabled}
                error={tried ? problems.details : undefined} />
      <Button testID={`${testID}-submit`} label="Raise dispute" busy={busy} disabled={disabled}
              onAction={() => { setTried(true); if (!problems.reason && !problems.details) { onSubmit(v); } }} />
    </Enter>
  );
}

export interface AddOnValue {
  name: string;
  relationship: string;
  limit: number | null;
}

export interface AddOnCardProps extends FormProps<AddOnValue> {
  currency?: string;
  /** The most the add-on card can be given: the main card's limit. */
  maxLimit?: number;
  relationships?: ReadonlyArray<string | Option>;
  onSubmit: (value: AddOnValue) => void;
  busy?: boolean;
}

/** Apply for a card for a family member on this account. */
export function AddOnCard(props: AddOnCardProps) {
  const { testID, label = 'Apply for an add-on card', value, onChange, currency, maxLimit, onSubmit, busy, disabled,
    relationships = ['Spouse', 'Parent', 'Child', 'Sibling'] } = props;
  const t = useTheme();
  const [tried, setTried] = useState(false);
  const v = value ?? { name: '', relationship: '', limit: null };
  const set = (patch: Partial<AddOnValue>) => onChange?.({ ...v, ...patch });
  const problems = {
    name: v.name.trim() ? '' : 'Enter the name on the card.',
    relationship: v.relationship ? '' : 'Choose the relationship.',
    limit: !v.limit ? 'Enter the limit.' : maxLimit !== undefined && v.limit > maxLimit ? `The limit can be at most ${money(maxLimit, currency)}.` : '',
  };
  return (
    <Enter testID={testID} style={panel(t)}>
      <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{label}</Text>
      <TextField testID={`${testID}-name`} label="Name on the card" value={v.name} onChange={(x) => set({ name: x })} maxLength={26} required disabled={disabled}
                 error={tried ? problems.name : undefined} />
      <Dropdown testID={`${testID}-relationship`} label="Relationship" options={relationships} value={v.relationship} onChange={(x) => set({ relationship: x })}
                required disabled={disabled} error={tried ? problems.relationship : undefined} />
      <AmountInput testID={`${testID}-limit`} label="Limit" currency={currency} value={v.limit} onChange={(x) => set({ limit: x })} required disabled={disabled}
                   max={maxLimit} error={tried ? problems.limit : undefined} />
      <Button testID={`${testID}-submit`} label="Apply" busy={busy} disabled={disabled}
              onAction={() => { setTried(true); if (!problems.name && !problems.relationship && !problems.limit) { onSubmit(v); } }} />
    </Enter>
  );
}

/* ---------- RepaymentSchedule ---------- */

export interface Instalment {
  due: string;
  principal: number;
  interest: number;
}

export interface RepaymentScheduleProps {
  testID: string;
  label?: string;
  instalments: ReadonlyArray<Instalment>;
  currency?: string;
}

/** Each instalment with its principal and interest, as cards of "header: value" on a phone. */
export function RepaymentSchedule({ testID, label = 'Repayment schedule', instalments, currency }: RepaymentScheduleProps) {
  const rows = instalments.map((x, i) => ({ key: String(i), due: x.due, principal: formatAmount(x.principal, currency), interest: formatAmount(x.interest, currency),
    total: formatAmount(x.principal + x.interest, currency) }));
  return (
    <DataTable testID={testID} caption={label} rows={rows} keyField="key" noData="No instalments."
               columns={[{ field: 'due', headerText: 'Due date' }, { field: 'principal', headerText: 'Principal', align: 'end' },
                 { field: 'interest', headerText: 'Interest', align: 'end' }, { field: 'total', headerText: 'Instalment', align: 'end' }]} />
  );
}

/* ---------- PromiseToPay ---------- */

export interface PromiseToPayProps extends FieldProps<string> {
  /** The overdue amount and the account, as rows. */
  rows: KeyValuesProps['rows'];
  /** The latest date the bank accepts, ISO yyyy-mm-dd. */
  max?: string;
  min?: string;
  onSubmit: (date: string) => void;
  busy?: boolean;
}

/** Commit to a date for an overdue amount (value is the ISO date). */
export function PromiseToPay({ testID, label, value, onChange, rows, min, max, onSubmit, busy, disabled }: PromiseToPayProps) {
  const [tried, setTried] = useState(false);
  return (
    <KeyValues testID={testID} label={label} rows={rows} actionLabel="Make the promise" busy={busy}
               onAction={() => { setTried(true); if (value) { onSubmit(value); } }}>
      <DatePicker testID={`${testID}-date`} label="Promise date" value={value} onChange={onChange} min={min} max={max} required disabled={disabled}
                  error={tried && !value ? 'Choose the date you will pay.' : undefined} />
    </KeyValues>
  );
}

/* ---------- DisbursementTimeline ---------- */

export interface DisbursementTimelineProps {
  testID: string;
  label?: string;
  events: ReadonlyArray<Event>;
}

/** Each disbursement of the loan, in order; future ones take state "todo". */
export function DisbursementTimeline({ label = 'Disbursements', ...props }: DisbursementTimelineProps) {
  return <TimelineList {...props} label={label} />;
}

/* ---------- CardTile ---------- */

export interface PaymentCard {
  id: string;
  name: string;
  /** The full number; only the last four show. */
  number: string;
  network?: string;
  /** mm/yy */
  expiry?: string;
  holder?: string;
}

export interface CardTileProps {
  testID: string;
  card: PaymentCard;
  /** The card is frozen (temporarily blocked). */
  frozen: boolean;
  onFrozenChange?: (frozen: boolean) => void;
  disabled?: boolean;
}

/** The card, with freeze and unfreeze; a frozen card is greyed and says so. */
export function CardTile({ testID, card, frozen, onFrozenChange, disabled }: CardTileProps) {
  const t = useTheme();
  return (
    <View testID={testID} style={{ gap: 10 }}>
      <View accessible accessibilityLabel={`${card.name} card ${maskNumber(card.number)}${card.expiry ? `, expires ${card.expiry}` : ''}${frozen ? ', frozen' : ''}`}
            style={{ aspectRatio: 1.586, borderRadius: t.radius.card + 4, padding: 18, justifyContent: 'space-between',
              backgroundColor: frozen ? t.color.surface3 : t.color.primary }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: frozen ? t.color.textMuted : t.color.onPrimary }}>{card.name}</Text>
          {frozen ? <Text style={{ fontSize: 12.5, fontWeight: '700', color: t.color.textBody }}>Frozen</Text> : null}
        </View>
        <Text style={{ fontSize: 19, letterSpacing: 2, color: frozen ? t.color.textMuted : t.color.onPrimary, fontVariant: ['tabular-nums'] }}>
          •••• •••• •••• {card.number.replace(/\s/g, '').slice(-4)}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 13, color: frozen ? t.color.textMuted : t.color.onPrimary }}>{card.holder ?? ''}{card.expiry ? `  ${card.expiry}` : ''}</Text>
          {card.network ? <Text style={{ fontSize: 13, fontWeight: '700', color: frozen ? t.color.textMuted : t.color.onPrimary }}>{card.network}</Text> : null}
        </View>
      </View>
      <Toggle testID={`${testID}-freeze`} label="Freeze the card" value={frozen} onChange={onFrozenChange} disabled={disabled}
              helpText={frozen ? 'Payments and withdrawals are stopped until you unfreeze it.' : undefined} />
    </View>
  );
}

/* ---------- ActivateCard, ResetPin and OtpInput (codes) ---------- */

export type CodeProps = CodeBoxesProps;

/** The code from the letter that came with the card. */
export function ActivateCard({ length = 6, ...props }: CodeProps) {
  return <CodeBoxes {...props} length={length} />;
}

export interface ResetPinProps extends Omit<FieldProps<string>, 'label'> {
  label?: string;
  length?: number;
  /** Called with the PIN once both entries match. */
  onComplete?: (pin: string) => void;
}

/** A new PIN, typed twice; it is hidden, never kept, and the second entry must match. Too simple PINs (1111, 1234) are refused. */
export function ResetPin({ testID, label = 'Choose a new PIN', value, onChange, length = 4, onComplete, disabled }: ResetPinProps) {
  const [again, setAgain] = useState('');
  const pin = value ?? '';
  const simple = pin.length === length && (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin));
  const mismatch = again.length === length && again !== pin;
  return (
    <View testID={testID}>
      <CodeBoxes testID={`${testID}-new`} label={label} length={length} secure value={pin} disabled={disabled} required
                 onChange={(x) => { onChange?.(x); setAgain(''); }} error={simple ? 'Choose a PIN that is harder to guess.' : undefined} />
      <CodeBoxes testID={`${testID}-again`} label="Type the PIN again" length={length} secure value={again} disabled={disabled || pin.length < length || simple}
                 onChange={setAgain} onComplete={(x) => { if (x === pin) { onComplete?.(x); } }}
                 error={mismatch ? 'The PINs do not match. Type it again.' : undefined} />
    </View>
  );
}

export interface OtpInputProps extends CodeBoxesProps {
  /** Seconds before Send a new code can be pressed. */
  resendAfter?: number;
  onResend?: () => void;
}

/** The one-time code the server asks for, with the platforms' code autofill and Send a new code after a wait. */
export function OtpInput({ resendAfter = 30, onResend, length = 6, ...props }: OtpInputProps) {
  const t = useTheme();
  const [left, setLeft] = useState(resendAfter);
  useEffect(() => {
    if (left <= 0) { return undefined; }
    const timer = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);
  return (
    <View>
      <CodeBoxes {...props} length={length} />
      {onResend ? (
        <Touch testID={`${props.testID}-resend`} label={left > 0 ? `Send a new code in ${left} seconds` : 'Send a new code'} disabled={left > 0}
               onPress={() => { setLeft(resendAfter); onResend(); }} style={{ alignSelf: 'flex-start', paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: left > 0 ? t.color.textMuted : t.color.primaryText }}>
            {left > 0 ? `Send a new code in ${left} s` : 'Send a new code'}
          </Text>
        </Touch>
      ) : null}
    </View>
  );
}

/* ---------- ConvertToEmi ---------- */

export interface ConvertToEmiProps extends FieldProps<string> {
  /** The purchase to spread. */
  amount: number;
  currency?: string;
  /** The bank's yearly rate for the plan, a percentage. */
  annualRate: number;
  /** The plans offered, in months. */
  plans?: ReadonlyArray<number>;
}

/** Spread a purchase over monthly instalments; each plan shows its monthly amount (value is the months, as text). */
export function ConvertToEmi({ amount, currency, annualRate, plans = [3, 6, 12], ...props }: ConvertToEmiProps) {
  const t = useTheme();
  const chosen = Number(props.value);
  const each = chosen ? instalment(amount, annualRate, chosen) : 0;
  return (
    <View>
      <Segment {...props} options={plans.map((m) => ({ value: String(m), label: `${m} months` }))} />
      {chosen ? (
        <Text testID={`${props.testID}-each`} accessibilityLiveRegion="polite" style={{ fontSize: 14, color: t.color.textBody, marginTop: -6 }}>
          {money(Math.round(each * 100) / 100, currency)} a month for {chosen} months, {money(Math.round(each * chosen * 100) / 100, currency)} in all at {annualRate}% a year.
        </Text>
      ) : null}
    </View>
  );
}

/* ---------- RedeemPoints ---------- */

export interface RedeemPointsProps extends Omit<SliderControlProps, 'format' | 'note'> {
  /** What one point is worth in the currency. */
  pointValue: number;
  currency?: string;
}

/** Choose how many points to use; the value in money shows under the slider. */
export function RedeemPoints({ pointValue, currency, step = 100, ...props }: RedeemPointsProps) {
  const pts = props.value ?? 0;
  return <SliderControl {...props} step={step} format={(n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} points`}
                        note={`Worth ${money(pts * pointValue, currency)}`} />;
}

/* ---------- CardLimits ---------- */

export interface CardLimitsProps extends FieldProps<number | null> {
  currency?: string;
  /** The most the bank allows. */
  max: number;
  /** What is already spent today. */
  used?: number;
}

/** Set the daily card limit, within what the bank allows. */
export function CardLimits({ max, used, currency, helpText, ...props }: CardLimitsProps) {
  return <AmountInput {...props} currency={currency} min={0} max={max}
                      helpText={helpText ?? `Up to ${money(max, currency)} a day${used !== undefined ? `; ${money(used, currency)} used today` : ''}.`} />;
}

/* ---------- CardControls and BlockCard ---------- */

export interface CardControlsProps extends FieldProps<string[]> {
  options?: ReadonlyArray<Option>;
}

/** Where the card can be used, one switch each (value lists the ones allowed). */
export function CardControls({ testID, label, value, onChange, disabled, readOnly, options = [
  { value: 'online', label: 'Online payments' }, { value: 'atm', label: 'ATM withdrawals' }, { value: 'abroad', label: 'Use abroad' },
  { value: 'contactless', label: 'Contactless' }] }: CardControlsProps) {
  const t = useTheme();
  const on = value ?? [];
  return (
    <Enter testID={testID} style={panel(t)}>
      <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{label}</Text>
      {options.map((o) => (
        <Toggle key={o.value} testID={`${testID}-${o.value}`} label={o.label} value={on.includes(o.value)} disabled={disabled || o.disabled} readOnly={readOnly}
                onChange={(x) => onChange?.(x ? [...on, o.value] : on.filter((v) => v !== o.value))} />
      ))}
    </Enter>
  );
}

export interface BlockCardProps extends FieldProps<boolean> {
  /** Asks before blocking: blocking a lost card stops it for good on most banks. */
  confirm?: string;
}

/** Stop the card at once if it is lost; asks first when confirm is set. */
export function BlockCard({ confirm = 'Block the card? Payments and withdrawals stop at once.', onChange, ...props }: BlockCardProps) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Toggle {...props} onChange={(x) => (x && confirm ? setAsking(true) : onChange?.(x))} />
      <Dialog open={asking} onOpenChange={setAsking} title={confirm} testID={`${props.testID}-confirm`}
              footer={<>
                <Button label="Keep it" chroming="outlined" onAction={() => setAsking(false)} />
                <Button testID={`${props.testID}-yes`} label="Block" chroming="danger" onAction={() => { setAsking(false); onChange?.(true); }} />
              </>} />
    </>
  );
}

/* ---------- CardStatements ---------- */

export interface CardStatementsProps {
  testID: string;
  label?: string;
  statements: ReadonlyArray<Item>;
  onDownload: (statement: Item) => void;
}

/** Past statements, ready to download. */
export function CardStatements({ testID, label = 'Statements', statements, onDownload }: CardStatementsProps) {
  return <ItemList testID={testID} label={label} items={statements} actionLabel="Download" onAction={onDownload} emptyText="No statements yet." />;
}

/* ---------- AuthChallenge ---------- */

export interface AuthChallengeProps {
  testID: string;
  /** What is being approved: "Approve the payment of 1,250.00 USD". */
  label: string;
  /** The app's biometric check (expo-local-authentication, for example); resolves true when it passed. */
  authenticate: () => Promise<boolean>;
  onSuccess: () => void;
  /** Use a code instead. */
  onFallback?: () => void;
}

/** Approve with a fingerprint or face; a failed check says so and offers to try again or use a code. */
export function AuthChallenge({ testID, label, authenticate, onSuccess, onFallback }: AuthChallengeProps) {
  const t = useTheme();
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const run = async () => {
    setState('busy');
    const ok = await authenticate().catch(() => false);
    if (ok) { setState('idle'); onSuccess(); } else { setState('failed'); }
  };
  return (
    <Enter testID={testID} style={[panel(t), { alignItems: 'center' }]}>
      <View importantForAccessibility="no" style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.color.primarySoft, alignItems: 'center',
        justifyContent: 'center' }}>
        <Text style={{ fontSize: 28, color: t.color.primaryText }}>◉</Text>
      </View>
      <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text, textAlign: 'center' }}>{label}</Text>
      {state === 'failed' ? <Text testID={`${testID}-failed`} style={styles(t).error} accessibilityRole="alert">That did not work. Try again or use a code.</Text> : null}
      <Button testID={`${testID}-start`} label={state === 'failed' ? 'Try again' : 'Use fingerprint or face'} busy={state === 'busy'} onAction={run} />
      {onFallback ? <Button testID={`${testID}-code`} label="Use a code instead" chroming="borderless" onAction={onFallback} /> : null}
    </Enter>
  );
}

/* ---------- SessionExpiryWarning ---------- */

export interface SessionExpiryWarningProps {
  testID: string;
  open: boolean;
  /** Seconds left when it opens. */
  seconds?: number;
  onStay: () => void;
  /** Called when the customer signs out, or when the time runs out. */
  onSignOut: () => void;
}

/** Warns before the session ends, counting down; it stays until the customer chooses, and signs out at zero. */
export function SessionExpiryWarning({ testID, open, seconds = 60, onStay, onSignOut }: SessionExpiryWarningProps) {
  const [left, setLeft] = useState(seconds);
  const out = useRef(onSignOut);
  out.current = onSignOut;
  useEffect(() => { if (open) { setLeft(seconds); } }, [open, seconds]);
  useEffect(() => {
    if (!open) { return undefined; }
    if (left <= 0) { out.current(); return undefined; }
    const timer = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(timer);
  }, [open, left]);
  return (
    <Dialog testID={testID} open={open} onOpenChange={() => undefined} cancelBehavior="none" title="Your session is about to end"
            description={`For your security you will be signed out in ${left} seconds.`}
            footer={<>
              <Button testID={`${testID}-out`} label="Sign out" chroming="outlined" onAction={onSignOut} />
              <Button testID={`${testID}-stay`} label="Stay signed in" onAction={onStay} />
            </>} />
  );
}

/* ---------- SecureConfirmation ---------- */

export interface SecureConfirmationProps extends Omit<KeyValuesProps, 'onAction' | 'children'> {
  /** The code typed so far; the component does not keep it. */
  code: string;
  onCodeChange: (code: string) => void;
  codeLength?: number;
  onConfirm: (code: string) => void;
  error?: string;
}

/** The details and the code step together; Confirm is enabled once the code is complete. */
export function SecureConfirmation({ testID, code, onCodeChange, codeLength = 6, onConfirm, actionLabel = 'Confirm with the code', busy, error, ...props }:
  SecureConfirmationProps) {
  const complete = code.length === codeLength;
  return (
    <KeyValues {...props} testID={testID}>
      <CodeBoxes testID={`${testID}-code`} label="The code we sent" length={codeLength} value={code} onChange={onCodeChange} error={error} />
      <Button testID={`${testID}-confirm`} label={actionLabel} busy={busy} disabled={!complete} onAction={() => onConfirm(code)} />
    </KeyValues>
  );
}

/* ---------- SensitiveField ---------- */

export interface SensitiveFieldProps {
  testID: string;
  label: string;
  /** The number to protect; only the last four show until Show is pressed. */
  value: string;
  /** Seconds the full number stays shown. */
  revealFor?: number;
}

/** A card or account number hidden until shown, and hidden again after a few seconds. */
export function SensitiveField({ testID, label, value, revealFor = 10 }: SensitiveFieldProps) {
  const t = useTheme();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!shown) { return undefined; }
    const timer = setTimeout(() => setShown(false), revealFor * 1000);
    return () => clearTimeout(timer);
  }, [shown, revealFor]);
  const digits = value.replace(/\s/g, '');
  const masked = `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`.replace(/(.{4})(?=.)/g, '$1 ');
  return (
    <View testID={testID} style={styles(t).field}>
      <Text style={styles(t).label} importantForAccessibility="no">{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text testID={`${testID}-value`} accessibilityLabel={shown ? `${label}: ${value}` : `${label}, ending ${digits.slice(-4)}, hidden`}
              style={{ flex: 1, fontSize: 17, letterSpacing: 1, color: t.color.text, fontVariant: ['tabular-nums'] }}>{shown ? value : masked}</Text>
        <Touch testID={`${testID}-reveal`} label={shown ? `Hide ${label}` : `Show ${label}`} selected={shown} onPress={() => setShown(!shown)}
               style={{ paddingHorizontal: 10 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.color.primaryText }}>{shown ? 'Hide' : 'Show'}</Text>
        </Touch>
      </View>
    </View>
  );
}

/* ---------- KycSteps and FraudAlert ---------- */

/** The steps to open an account (ID, selfie, address). */
export function KycSteps({ label = 'Identity check', ...props }: StepsProps) {
  return <Steps {...props} label={label} />;
}

export interface FraudAlertProps extends Omit<BannerProps, 'tone' | 'actionLabel' | 'onAction'> {
  /** It was the customer: let it through. */
  onAllow?: () => void;
  /** It was not: block the card. */
  onBlock?: () => void;
}

/** A payment we stopped, and the two things the customer can do about it. */
export function FraudAlert({ onAllow, onBlock, ...props }: FraudAlertProps) {
  return (
    <View style={{ gap: 8 }}>
      <Banner {...props} tone="danger" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {onAllow ? <View style={{ flex: 1 }}><Button testID={`${props.testID}-allow`} label="It was me" chroming="outlined" onAction={onAllow} /></View> : null}
        {onBlock ? <View style={{ flex: 1 }}><Button testID={`${props.testID}-block`} label="Block the card" chroming="danger" onAction={onBlock} /></View> : null}
      </View>
    </View>
  );
}
