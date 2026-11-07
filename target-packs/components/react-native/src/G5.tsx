/*
 * Group 5: service requests, documents, onboarding, calculators and help. The calculators show estimates from the
 * rates the screen passes in (the bank's rates come from its services); the map in the locator is the app's own.
 */
import { ReactNode, useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { Button } from './Button';
import { CheckboxGroup } from './Choices';
import { Dropdown } from './Dropdown';
import { DateRange, DateRangePicker, NumberInput, TextArea } from './Forms';
import { Accordion, AccordionProps } from './G1';
import { Account, AccountSelector } from './G2';
import { instalment } from './G3';
import { AmountInput, TextField, decimalsOf, formatAmount } from './TextField';
import { FieldProps, Option, styles } from './field';
import { TimelineItem, FormProps, InfoCard, InfoCardProps, Item, ItemList, Segment, SegmentProps, SliderControl, SliderControlProps, Steps, StepsProps, TimelineList,
  Touch, panel } from './parts';
import { Enter, Roll } from './motion';
import { useTheme } from './theme';
import { FACES, RatingVariant } from './variants';

const money = (n: number, currency?: string) => `${formatAmount(n, currency)}${currency ? ` ${currency}` : ''}`;

/* ---------- RaiseRequest ---------- */

export interface RequestValue {
  type: string;
  account: string;
  details: string;
}

export interface RaiseRequestProps extends FormProps<RequestValue> {
  /** The requests the bank offers: cheque book, address change … */
  types: ReadonlyArray<string | Option>;
  accounts: ReadonlyArray<Account>;
  onSubmit: (value: RequestValue) => void;
  busy?: boolean;
}

/** Cheque book, address change and other requests: what, for which account, and any details. */
export function RaiseRequest({ testID, label = 'Raise a request', value, onChange, types, accounts, onSubmit, busy, disabled }: RaiseRequestProps) {
  const t = useTheme();
  const [tried, setTried] = useState(false);
  const v = value ?? { type: '', account: '', details: '' };
  const set = (patch: Partial<RequestValue>) => onChange?.({ ...v, ...patch });
  const problems = { type: v.type ? '' : 'Choose a request.', account: v.account ? '' : 'Choose the account.' };
  return (
    <Enter testID={testID} style={panel(t)}>
      <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{label}</Text>
      <Dropdown testID={`${testID}-type`} label="Request" options={types} value={v.type} onChange={(x) => set({ type: x })} required disabled={disabled}
                error={tried ? problems.type : undefined} />
      <AccountSelector testID={`${testID}-account`} label="Account" accounts={accounts} showBalance={false} value={v.account} onChange={(x) => set({ account: x })}
                       required disabled={disabled} error={tried ? problems.account : undefined} />
      <TextArea testID={`${testID}-details`} label="Details" value={v.details} onChange={(x) => set({ details: x })} maxLength={500} disabled={disabled} />
      <Button testID={`${testID}-submit`} label="Raise request" busy={busy} disabled={disabled}
              onAction={() => { setTried(true); if (!problems.type && !problems.account) { onSubmit(v); } }} />
    </Enter>
  );
}

/* ---------- TrackRequests and ApplicationTracker ---------- */

export interface TrackerProps {
  testID: string;
  label?: string;
  items: ReadonlyArray<TimelineItem>;
}

/** Where each request is. */
export function TrackRequests({ label = 'Your requests', ...props }: TrackerProps) {
  return <TimelineList {...props} label={label} />;
}

/** Where an application is. */
export function ApplicationTracker({ label = 'Your application', ...props }: TrackerProps) {
  return <TimelineList {...props} label={label} />;
}

/* ---------- Mailbox, EReceipts, Certificates, Nominations ---------- */

export interface MailboxProps {
  testID: string;
  label?: string;
  /** Unread ones are bold and read as "Unread". */
  messages: ReadonlyArray<Item>;
  onOpen: (message: Item) => void;
}

/** Mails, alerts and notices from the bank. */
export function Mailbox({ testID, label = 'Mailbox', messages, onOpen }: MailboxProps) {
  const unread = messages.filter((m) => m.unread).length;
  return <ItemList testID={testID} heading={unread ? `${label}, ${unread} unread` : label} items={messages} onSelect={onOpen} emptyText="No messages." />;
}

export interface DocumentsProps {
  testID: string;
  label?: string;
  documents: ReadonlyArray<Item>;
  onDownload: (document: Item) => void;
}

/** Receipts for past transactions. */
export function EReceipts({ testID, label = 'E-receipts', documents, onDownload }: DocumentsProps) {
  return <ItemList testID={testID} heading={label} items={documents} actionLabel="Download" onAction={onDownload} emptyText="No receipts yet." />;
}

/** Interest, balance and tax certificates. */
export function Certificates({ testID, label = 'Certificates', documents, onDownload }: DocumentsProps) {
  return <ItemList testID={testID} heading={label} items={documents} actionLabel="Download" onAction={onDownload} emptyText="No certificates yet." />;
}

export interface NominationsProps {
  testID: string;
  label?: string;
  /** Each nominee with the account and their share in side ("50%"). */
  nominees: ReadonlyArray<Item>;
  onEdit?: (nominee: Item) => void;
}

/** Who receives the account, and their share. */
export function Nominations({ testID, label = 'Nominations', nominees, onEdit }: NominationsProps) {
  return <ItemList testID={testID} heading={label} items={nominees} actionLabel={onEdit ? 'Edit' : undefined} onAction={onEdit} emptyText="No nominees yet." />;
}

/* ---------- ComposeMessage ---------- */

export interface MessageValue {
  subject: string;
  body: string;
}

export interface ComposeMessageProps extends FormProps<MessageValue> {
  subjects: ReadonlyArray<string | Option>;
  onSend: (value: MessageValue) => void;
  busy?: boolean;
}

/** Write to the bank securely: a subject and the message. */
export function ComposeMessage({ testID, label = 'Message to the bank', value, onChange, subjects, onSend, busy, disabled }: ComposeMessageProps) {
  const t = useTheme();
  const [tried, setTried] = useState(false);
  const v = value ?? { subject: '', body: '' };
  const problems = { subject: v.subject ? '' : 'Choose a subject.', body: v.body.trim() ? '' : 'Write your message.' };
  return (
    <Enter testID={testID} style={panel(t)}>
      <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{label}</Text>
      <Dropdown testID={`${testID}-subject`} label="Subject" options={subjects} value={v.subject} onChange={(x) => onChange?.({ ...v, subject: x })} required
                disabled={disabled} error={tried ? problems.subject : undefined} />
      <TextArea testID={`${testID}-body`} label="Message" value={v.body} onChange={(x) => onChange?.({ ...v, body: x })} rows={5} maxLength={2000} required
                disabled={disabled} error={tried ? problems.body : undefined} />
      <Button testID={`${testID}-send`} label="Send" busy={busy} disabled={disabled}
              onAction={() => { setTried(true); if (!problems.subject && !problems.body) { onSend(v); } }} />
    </Enter>
  );
}

/* ---------- StatementRequest and StatementFormat ---------- */

export interface StatementRequestProps extends FieldProps<DateRange> {
  /** The longest period, in days. */
  maxDays?: number;
  min?: string;
  max?: string;
  onSubmit: (range: DateRange) => void;
  busy?: boolean;
}

/** Any period, sent to the mailbox. */
export function StatementRequest({ maxDays = 366, onSubmit, busy, ...props }: StatementRequestProps) {
  const [tried, setTried] = useState(false);
  const r = props.value ?? { from: '', to: '' };
  const ok = r.from && r.to && r.to >= r.from && (Date.parse(r.to) - Date.parse(r.from)) / 86400000 <= maxDays;
  return (
    <View>
      <DateRangePicker {...props} maxDays={maxDays} required error={props.error || (tried && (!r.from || !r.to) ? 'Choose both dates.' : undefined)} />
      <Button testID={`${props.testID}-submit`} label="Request statement" busy={busy} disabled={props.disabled}
              onAction={() => { setTried(true); if (ok) { onSubmit(r); } }} />
    </View>
  );
}

/** PDF, spreadsheet or both. */
export function StatementFormat({ options = [{ value: 'pdf', label: 'PDF' }, { value: 'csv', label: 'CSV' }, { value: 'both', label: 'Both' }], ...props }:
  Omit<SegmentProps, 'options'> & { options?: SegmentProps['options'] }) {
  return <Segment {...props} options={options} />;
}

/* ---------- SelfRegister and TaxSelfCertification ---------- */

/** Sign up for digital banking, step by step. */
export function SelfRegister({ label = 'Register', ...props }: StepsProps) {
  return <Steps {...props} label={label} />;
}

/** FATCA and CRS tax residency questions, step by step. */
export function TaxSelfCertification({ label = 'Tax self-certification', ...props }: StepsProps) {
  return <Steps {...props} label={label} />;
}

/* ---------- ProductCard ---------- */

/** A product to apply for. */
export function ProductCard({ actionLabel = 'Apply now', ...props }: InfoCardProps) {
  return <InfoCard {...props} actionLabel={actionLabel} />;
}

/* ---------- TermsConsent ---------- */

export interface TermsConsentProps extends FieldProps<string[]> {
  options: ReadonlyArray<Option>;
  /** The options that must be ticked to go on (the terms); the rest are a choice (offers by email). */
  mustAccept: ReadonlyArray<string>;
  onContinue: () => void;
  continueLabel?: string;
}

/** What the customer agrees to; Continue says which of the required ones is missing. */
export function TermsConsent({ mustAccept, onContinue, continueLabel = 'Continue', ...props }: TermsConsentProps) {
  const [tried, setTried] = useState(false);
  const ticked = props.value ?? [];
  const missing = mustAccept.filter((m) => !ticked.includes(m));
  const names = props.options.filter((o) => missing.includes(o.value)).map((o) => o.label);
  return (
    <View>
      <CheckboxGroup {...props} error={props.error || (tried && names.length ? `To go on, tick: ${names.join('; ')}.` : undefined)} />
      <Button testID={`${props.testID}-continue`} label={continueLabel} disabled={props.disabled}
              onAction={() => { setTried(true); if (!missing.length) { onContinue(); } }} />
    </View>
  );
}

/* ---------- Calculators ---------- */

/** What a deposit is worth at maturity, compounded compoundsPerYear times (quarterly by default); annualRate is a percentage. */
export function maturityValue(amount: number, annualRate: number, months: number, compoundsPerYear = 4): number {
  return amount * (1 + annualRate / 100 / compoundsPerYear) ** ((compoundsPerYear * months) / 12);
}

/** The loan an instalment pays off over months at annualRate (the instalment formula, solved for the amount). */
export function loanFor(monthly: number, annualRate: number, months: number): number {
  const r = annualRate / 1200;
  return r === 0 ? monthly * months : (monthly * (1 - (1 + r) ** -months)) / r;
}

function Result({ testID, label, value, note }: { testID: string; label: string; value: string; note?: string }) {
  const t = useTheme();
  return (
    <View testID={testID} accessible accessibilityLabel={`${label}: ${value}${note ? `. ${note}` : ''}`} accessibilityLiveRegion="polite"
          style={{ padding: 14, borderRadius: t.radius.control, backgroundColor: t.color.primarySoft, gap: 2 }}>
      <Text style={{ fontSize: 13, color: t.color.textBody }}>{label}</Text>
      <Roll on={value}><Text style={{ fontSize: 22, fontWeight: '700', color: t.color.primaryText, fontVariant: ['tabular-nums'] }}>{value}</Text></Roll>
      {note ? <Text style={{ fontSize: 12.5, color: t.color.textMuted }}>{note}</Text> : null}
    </View>
  );
}

export interface LoanInputs {
  amount: number | null;
  /** A yearly percentage. */
  rate: number | null;
  months: number | null;
}

export interface CalculatorProps<T> {
  testID: string;
  label?: string;
  value: T;
  onChange?: (value: T) => void;
  currency?: string;
}

const NOTE = 'An estimate; the bank confirms the figures when you apply.';

/** The monthly payment for a loan amount, with the interest over the whole loan. */
export function LoanCalculator({ testID, label = 'Loan instalment calculator', value, onChange, currency }: CalculatorProps<LoanInputs>) {
  const t = useTheme();
  const v = value;
  const each = v.amount && v.rate !== null && v.months ? instalment(v.amount, v.rate, v.months) : null;
  return (
    <Enter testID={testID} style={panel(t)}>
      <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{label}</Text>
      <AmountInput testID={`${testID}-amount`} label="Loan amount" currency={currency} value={v.amount} onChange={(x) => onChange?.({ ...v, amount: x })} min={0} />
      <NumberInput testID={`${testID}-rate`} label="Interest rate (% a year)" value={v.rate} decimals={2} min={0} max={60} step={0.25}
                   onChange={(x) => onChange?.({ ...v, rate: x })} />
      <NumberInput testID={`${testID}-months`} label="Months" value={v.months} min={1} max={480} step={12} onChange={(x) => onChange?.({ ...v, months: x })} />
      {each !== null ? <Result testID={`${testID}-result`} label="Each month" value={money(each, currency)}
                               note={`Interest over the loan ${money(each * v.months! - v.amount!, currency)}. ${NOTE}`} /> : null}
    </Enter>
  );
}

/** What a term deposit is worth at maturity. */
export function DepositCalculator({ testID, label = 'Term deposit calculator', value, onChange, currency }: CalculatorProps<LoanInputs>) {
  const t = useTheme();
  const v = value;
  const end = v.amount && v.rate !== null && v.months ? maturityValue(v.amount, v.rate, v.months) : null;
  return (
    <Enter testID={testID} style={panel(t)}>
      <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{label}</Text>
      <AmountInput testID={`${testID}-amount`} label="Deposit amount" currency={currency} value={v.amount} onChange={(x) => onChange?.({ ...v, amount: x })} min={0} />
      <NumberInput testID={`${testID}-rate`} label="Interest rate (% a year)" value={v.rate} decimals={2} min={0} max={30} step={0.25}
                   onChange={(x) => onChange?.({ ...v, rate: x })} />
      <NumberInput testID={`${testID}-months`} label="Months" value={v.months} min={1} max={120} step={3} onChange={(x) => onChange?.({ ...v, months: x })} />
      {end !== null ? <Result testID={`${testID}-result`} label="At maturity" value={money(end, currency)}
                              note={`Interest ${money(end - v.amount!, currency)}, compounded quarterly. ${NOTE}`} /> : null}
    </Enter>
  );
}

export interface ForexCalculatorProps extends CalculatorProps<number | null> {
  /** The currency paid from. */
  currency: string;
  /** The currency the payee gets. */
  to: string;
  /** One unit of currency in to, at the bank's rate today. */
  rate: number;
}

/** What the payee gets at the rate today (value is the amount sent). */
export function ForexCalculator({ testID, label = 'Forex calculator', value, onChange, currency, to, rate }: ForexCalculatorProps) {
  const t = useTheme();
  return (
    <Enter testID={testID} style={panel(t)}>
      <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{label}</Text>
      <AmountInput testID={`${testID}-amount`} label="You send" currency={currency} value={value} onChange={(x) => onChange?.(x)} min={0} />
      {value ? <Result testID={`${testID}-result`} label="The payee gets" value={money(value * rate, to)} note={`1 ${currency} = ${rate} ${to}. ${NOTE}`} /> : null}
    </Enter>
  );
}

export interface EligibilityCalculatorProps extends Omit<SliderControlProps, 'note' | 'format' | 'prefix' | 'decimals'> {
  /** The income's currency: shown before the amounts, with its decimals. */
  currency?: string;
  /** The share of income the bank lets go to instalments, a percentage. */
  share?: number;
  annualRate: number;
  months: number;
}

/** How much the customer could borrow on their monthly income (the slider). */
export function EligibilityCalculator({ share = 40, annualRate, months, currency, ...props }: EligibilityCalculatorProps) {
  const income = props.value ?? 0;
  const could = loanFor((income * share) / 100, annualRate, months);
  return <SliderControl {...props} prefix={currency} decimals={decimalsOf(currency)} note={`You could borrow about ${money(Math.floor(could), currency)} over ${months} months.`} />;
}

export interface GoalCalculatorProps extends Omit<SliderControlProps, 'note' | 'format' | 'prefix' | 'decimals'> {
  /** The goal's currency: shown before the amounts, with its decimals. */
  currency?: string;
  /** The goal's amount. */
  target: number;
}

/** What to save each month (the slider) and when the goal is reached. */
export function GoalCalculator({ target, currency, ...props }: GoalCalculatorProps) {
  const each = props.value ?? 0;
  const months = each > 0 ? Math.ceil(target / each) : 0;
  return <SliderControl {...props} prefix={currency} decimals={decimalsOf(currency)} note={each > 0 ? `You reach ${money(target, currency)} in ${months} month${months === 1 ? '' : 's'}.`
    : 'Choose an amount to save each month.'} />;
}

/* ---------- Locator ---------- */

export interface Place {
  id: string;
  name: string;
  kind: 'atm' | 'branch';
  address: string;
  /** As the screen shows it: "0.4 km". */
  distance?: string;
  /** Opening hours or "Open now". */
  hours?: string;
}

export interface LocatorProps {
  testID: string;
  label?: string;
  places: ReadonlyArray<Place>;
  onDirections: (place: Place) => void;
  /** The app's map (react-native-maps, for example), shown above the list. */
  map?: ReactNode;
}

/** Nearby ATMs and branches: the app's map, a filter and the list with Directions. */
export function Locator({ testID, label = 'ATMs and branches', places, onDirections, map }: LocatorProps) {
  const [kind, setKind] = useState('all');
  const shown = places.filter((p) => kind === 'all' || p.kind === kind);
  return (
    <View testID={testID} style={{ gap: 10 }}>
      {map}
      <Segment testID={`${testID}-kind`} label="Show" value={kind} onChange={setKind}
               options={[{ value: 'all', label: 'All' }, { value: 'atm', label: 'ATMs' }, { value: 'branch', label: 'Branches' }]} />
      <ItemList testID={`${testID}-list`} heading={label} actionLabel="Directions" emptyText="Nothing near here."
                items={shown.map((p) => ({ id: p.id, title: p.name, meta: [p.kind === 'atm' ? 'ATM' : 'Branch', p.address, p.hours].filter(Boolean).join(' · '),
                  value: p.distance }))}
                onAction={(i) => onDirections(places.find((p) => p.id === i.id)!)} />
    </View>
  );
}

/* ---------- LiveChat ---------- */

export interface ChatMessage {
  id: string;
  from: 'customer' | 'bank';
  text: string;
  time?: string;
}

export interface LiveChatProps {
  testID: string;
  label?: string;
  messages: ReadonlyArray<ChatMessage>;
  /** Questions to start with, shown until the customer writes. */
  suggestions?: ReadonlyArray<string>;
  onSend: (text: string) => void;
  /** The bank is typing. */
  typing?: boolean;
}

/** Chat with the bank: the messages, suggested questions and a box to write; new bank messages are announced. */
export function LiveChat({ testID, label = 'Chat with us', messages, suggestions = [], onSend, typing }: LiveChatProps) {
  const t = useTheme();
  const [draft, setDraft] = useState('');
  const send = (text: string) => { const x = text.trim(); if (x) { onSend(x); setDraft(''); } };
  const started = messages.some((m) => m.from === 'customer');
  return (
    <Enter testID={testID} style={[panel(t), { gap: 8 }]}>
      <Text accessibilityRole="header" style={{ fontSize: 16, fontWeight: '700', color: t.color.text }}>{label}</Text>
      <FlatList data={messages} keyExtractor={(m) => m.id} scrollEnabled={false} contentContainerStyle={{ gap: 6 }} renderItem={({ item: m }) => {
        const mine = m.from === 'customer';
        return (
          <View accessible accessibilityLabel={`${mine ? 'You' : 'Bank'}${m.time ? ` at ${m.time}` : ''}: ${m.text}`}
                accessibilityLiveRegion={mine ? 'none' : 'polite'}
                style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', padding: 10, borderRadius: 14,
                  backgroundColor: mine ? t.color.primary : t.color.surface2 }}>
            <Text style={{ fontSize: 14.5, color: mine ? t.color.onPrimary : t.color.text }}>{m.text}</Text>
            {m.time ? <Text style={{ fontSize: 11, color: mine ? t.color.onPrimary : t.color.textMuted, marginTop: 2 }}>{m.time}</Text> : null}
          </View>
        );
      }} />
      {typing ? <Text style={{ fontSize: 13, color: t.color.textMuted }} accessibilityLiveRegion="polite">The bank is typing…</Text> : null}
      {!started && suggestions.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {suggestions.map((s) => (
            <Touch key={s} testID={`${testID}-suggest-${s}`} label={s} onPress={() => send(s)}
                   style={{ paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: t.color.primary }}>
              <Text style={{ fontSize: 13.5, color: t.color.primaryText }}>{s}</Text>
            </Touch>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}><TextField testID={`${testID}-draft`} label="Your message" value={draft} onChange={setDraft} maxLength={1000} /></View>
        <View style={{ marginTop: 22 }}><Button testID={`${testID}-send`} label="Send" disabled={!draft.trim()} onAction={() => send(draft)} /></View>
      </View>
    </Enter>
  );
}

/* ---------- FeedbackRating ---------- */

export interface FeedbackRatingProps extends FieldProps<number | null> {
  /** The style: standard (stars), emoji (faces) or numbers. */
  variant?: RatingVariant;
  /** A comment box under the stars. */
  comment?: string;
  onCommentChange?: (comment: string) => void;
  onSubmit?: (rating: number, comment: string) => void;
}

const WORDS = ['Very poor', 'Poor', 'All right', 'Good', 'Very good'];

/** Rate the experience from one to five stars, each a radio that says its meaning. */
export function FeedbackRating({ testID, label, value, onChange, comment, onCommentChange, onSubmit, disabled, readOnly, variant = 'standard' }: FeedbackRatingProps) {
  const t = useTheme();
  const s = styles(t);
  return (
    <View testID={testID} style={s.field}>
      <Text style={s.label} importantForAccessibility="no">{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', gap: 4 }}>
        {WORDS.map((w, i) => {
          const n = i + 1;
          return (
            <Touch key={w} testID={`${testID}-${n}`} role="radio" label={`${n} star${n > 1 ? 's' : ''}, ${w}`} selected={value === n} disabled={disabled || readOnly}
                   onPress={() => onChange?.(n)} style={{ width: t.minTouch, alignItems: 'center' }}>
              {variant === 'numbers' ? (
                <View style={{ width: 40, height: 40, borderRadius: t.radius.control, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
                  borderColor: value === n ? t.color.primary : t.color.borderStrong, backgroundColor: value === n ? t.color.primary : t.color.surface }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: value === n ? t.color.onPrimary : t.color.text }}>{n}</Text>
                </View>
              ) : variant === 'emoji' ? <Text style={{ fontSize: 28, opacity: value === n ? 1 : 0.45 }}>{FACES[i]}</Text>
                : <Text style={{ fontSize: 28, color: value && n <= value ? t.color.warning : t.color.borderStrong }}>★</Text>}
            </Touch>
          );
        })}
      </View>
      {value ? <Text style={s.help}>{WORDS[value - 1]}</Text> : null}
      {onCommentChange ? <TextArea testID={`${testID}-comment`} label="Anything to add?" value={comment ?? ''} onChange={onCommentChange} maxLength={500} /> : null}
      {onSubmit ? <Button testID={`${testID}-submit`} label="Send feedback" disabled={!value || disabled} onAction={() => onSubmit(value!, comment ?? '')} /> : null}
    </View>
  );
}

/* ---------- Faq ---------- */

/** Answers that open in place, one at a time. */
export function Faq({ label = 'Frequently asked questions', ...props }: AccordionProps) {
  return <Accordion {...props} label={label} />;
}
