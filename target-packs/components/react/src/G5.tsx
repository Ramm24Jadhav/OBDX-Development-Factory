/*
 * Group 5 (service, documents, onboarding, calculators, help), the same markup and bx- classes as bx-g5.js in the
 * premium JET pack. The calculators are estimates with the standard formulas (an instalment, compound interest, an
 * amount at a rate); the rates come from the screen, and the bank's own figures come from its services.
 */
import { KeyboardEvent, useId, useState } from 'react';

import { Accordion, AccordionProps, Rows, RowsProps, SegmentsProps, Skeleton, Slider, SliderProps, StepperProps, Stepper, Timeline, TimelineProps, ToggleGroup } from './G1';
import { StepForm, StepFormProps, ThingCard, ThingCardProps, money } from './G2';
import { Checks, ChecksProps } from './G3';
import { CalcVariant, ChatVariant, LocatorVariant, withVariant } from './variant';

type Opt<P, K extends keyof P> = Omit<P, K> & Partial<Pick<P, K>>;

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

export interface ComposeProps { testID?: string; label?: string; value: string; onChange?: (value: string) => void; maxLength?: number; sendLabel?: string; busy?: boolean; helpText?: string; onSend?: (text: string) => void }

/** A message to the bank, with a counter and Send. */
export function ComposeMessage({ testID, label = 'Message to the bank', value, onChange, maxLength = 500, sendLabel = 'Send', busy, helpText, onSend }: ComposeProps) {
  const id = useId();
  const off = !value.trim() || busy;
  return (
    <div className="bx-field bx-compose" data-testid={testID}>
      <label className="bx-label" htmlFor={id}>{label}</label>
      <div className="bx-control is-multiline">
        <textarea className="bx-input bx-textarea" rows={5} id={id} value={value} maxLength={maxLength} aria-describedby={`${id}-count`} onChange={(e) => onChange?.(e.target.value)} />
        <span className="bx-counter" id={`${id}-count`}>{value.length} / {maxLength}</span>
      </div>
      {helpText ? <span className="bx-help">{helpText}</span> : null}
      <div className="bx-kv-actions"><button type="button" className="bx-btn bx-btn--callToAction" disabled={off} aria-busy={busy || undefined} onClick={() => onSend?.(value)}>{sendLabel}</button></div>
    </div>
  );
}

/* ---------- StatementRequest ---------- */

export interface Period { from: string; to: string }
export interface PeriodProps { testID?: string; label?: string; value: Period; onChange?: (value: Period) => void; min?: string; max?: string; maxDays?: number; actionLabel?: string; onRequest?: (value: Period) => void }

/** The first and last day, checked when the customer asks (both, in order, within maxDays), then onRequest. */
export function StatementRequest({ testID, label = 'Statement period', value, onChange, min, max, maxDays, actionLabel = 'Request', onRequest }: PeriodProps) {
  const id = useId();
  const [problem, setProblem] = useState('');
  const set = (p: Period) => { setProblem(''); onChange?.(p); };
  const request = () => {
    const days = value.from && value.to ? (Date.parse(value.to) - Date.parse(value.from)) / 86400000 : NaN;
    const msg = !value.from || !value.to ? 'Choose the first and the last day.' : days < 0 ? 'The last day is before the first. Swap them.'
      : maxDays && days + 1 > maxDays ? `Choose up to ${maxDays} days.` : '';
    setProblem(msg);
    if (!msg) { onRequest?.(value); }
  };
  return (
    <fieldset className={'bx-field bx-period' + (problem ? ' is-error' : '')} aria-describedby={problem ? `${id}-err` : undefined} data-testid={testID}>
      <legend className="bx-label">{label}</legend>
      <div className="bx-range">
        <div className="bx-field"><label className="bx-label" htmlFor={`${id}-f`}>From</label><div className="bx-control">
          <input type="date" className="bx-input" id={`${id}-f`} value={value.from} min={min} max={max} onChange={(e) => set({ ...value, from: e.target.value })} /></div></div>
        <div className="bx-field"><label className="bx-label" htmlFor={`${id}-t`}>To</label><div className="bx-control">
          <input type="date" className="bx-input" id={`${id}-t`} value={value.to} min={min} max={max} onChange={(e) => set({ ...value, to: e.target.value })} /></div></div>
      </div>
      {problem ? <span className="bx-error" role="alert" id={`${id}-err`}><span className="bx-error-icon" aria-hidden="true">!</span>{problem}</span> : null}
      <div className="bx-kv-actions"><button type="button" className="bx-btn bx-btn--callToAction" onClick={request}>{actionLabel}</button></div>
    </fieldset>
  );
}

/* ---------- calculators ---------- */

export interface CalculatorProps {
  testID?: string;
  heading?: string;
  mode?: 'loan' | 'td' | 'fx';
  amount?: number;
  /** Yearly rate in % (loan, deposit), or the exchange rate (fx). */
  rate?: number;
  months?: number;
  currency?: string;
  toCurrency?: string;
  /** Times a year a deposit's interest is added. */
  compounding?: number;
  note?: string;
  actionLabel?: string;
  onAction?: (figures: { amount: number; rate: number; months: number; result: number }) => void;
  variant?: CalcVariant;
}

/** A loan, a deposit or an exchange, worked out as the customer types. */
export function Calculator({ testID, heading = 'Loan calculator', mode = 'loan', amount = 10000, rate = 9.5, months = 36, currency = '', toCurrency = '', compounding = 4,
  note = 'An estimate. The bank confirms the figures when you apply.', actionLabel, onAction, variant }: CalculatorProps) {
  const id = useId();
  const [a, setA] = useState(String(amount));
  const [r, setR] = useState(String(rate));
  const [m, setM] = useState(String(months));
  const n = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  let main: string;
  let line: string;
  let value: number;
  if (mode === 'fx') {
    value = round2(n(a) * rate);
    main = money(value, toCurrency || undefined);
    line = `1 ${currency} = ${rate} ${toCurrency}`;
  } else if (mode === 'td') {
    value = round2(maturity(n(a), n(r), n(m), compounding));
    main = money(value, currency || undefined);
    line = `Interest ${money(round2(value - n(a)), currency || undefined)}`;
  } else {
    value = round2(instalment(n(a), n(r), n(m)));
    main = money(value, currency || undefined);
    line = `Total interest ${money(round2(value * n(m) - n(a)), currency || undefined)}`;
  }
  const title = mode === 'fx' ? 'You get' : mode === 'td' ? 'At maturity' : 'Monthly instalment';
  const amountLabel = (mode === 'fx' ? 'You send' : mode === 'td' ? 'Deposit' : 'Loan amount') + (currency ? ` (${currency})` : '');
  const field = (key: string, label: string, v: string, set: (x: string) => void, extra: { min?: number; step?: number }) => (
    <div className="bx-field"><label className="bx-label" htmlFor={`${id}-${key}`}>{label}</label><div className="bx-control">
      <input type="number" className="bx-input bx-num" inputMode="decimal" id={`${id}-${key}`} value={v} min={extra.min} step={extra.step} onChange={(e) => set(e.target.value)} /></div></div>
  );
  return (
    <section className={withVariant('bx-card bx-calc', 'calc', variant)} aria-labelledby={id} data-testid={testID}>
      <h3 className="bx-card-title" id={id}>{heading}</h3>
      <div className="bx-calc-fields">
        {field('a', amountLabel, a, setA, { min: 0 })}
        {mode !== 'fx' ? <>{field('r', 'Rate (% a year)', r, setR, { min: 0, step: 0.05 })}{field('m', 'Months', m, setM, { min: 1, step: 1 })}</> : null}
      </div>
      <div className="bx-calc-result" aria-live="polite"><span className="bx-calc-title">{title}</span><strong className="bx-calc-main">{main}</strong><span className="bx-calc-line">{line}</span></div>
      <p className="bx-help">{note}</p>
      {actionLabel ? <div className="bx-kv-actions"><button type="button" className="bx-btn bx-btn--callToAction" onClick={() => onAction?.({ amount: n(a), rate: n(r), months: n(m), result: value })}>{actionLabel}</button></div> : null}
    </section>
  );
}

/* ---------- Locator ---------- */

export interface Place { id: string; name: string; type: 'branch' | 'atm'; address?: string; distance?: string; hours?: string }
export interface LocatorProps { testID?: string; heading?: string; items: ReadonlyArray<Place>; emptyText?: string; onAction?: (place: Place) => void; variant?: LocatorVariant;
  loading?: boolean }

/** Branches and ATMs near the customer, filtered by kind and name; Directions is the screen's (a map app). */
export function Locator({ testID, heading = 'Find a branch or ATM', items, emptyText = 'Nothing matches. Try another name or area.', onAction, variant, loading }: LocatorProps) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'branch' | 'atm'>('all');
  const q = query.trim().toLowerCase();
  const rows = items.filter((o) => (kind === 'all' || o.type === kind) && (!q || `${o.name} ${o.address ?? ''}`.toLowerCase().includes(q)));
  return (
    <section className={withVariant('bx-panel bx-locator', 'locator', variant)} aria-labelledby={id} data-testid={testID}>
      <h3 className="bx-panel-title" id={id}>{heading}</h3>
      <div className="bx-control bx-payee-search"><span className="bx-search-icon" aria-hidden="true" />
        <input type="search" className="bx-input bx-search" aria-label="Search by name or area" placeholder="Name or area" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <div className="bx-chip-row" role="group" aria-label="Show">
        {([['all', 'All'], ['branch', 'Branches'], ['atm', 'ATMs']] as const).map(([k, label]) => (
          <button key={k} type="button" className={'bx-filter-chip' + (kind === k ? ' is-on' : '')} aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</button>
        ))}
      </div>
      {loading ? <Skeleton /> : rows.length === 0 ? <p className="bx-panel-empty" role="status">{emptyText}</p> : null}
      {loading ? null : <ul className="bx-rows">
        {rows.map((o) => (
          <li key={o.id} className="bx-row">
            <span className="bx-row-main"><strong>{o.name}</strong><span className="bx-row-meta">{[o.type === 'atm' ? 'ATM' : 'Branch', o.address, o.distance].filter(Boolean).join(' · ')}</span>
              {o.hours ? <span className="bx-row-meta">{o.hours}</span> : null}</span>
            <button type="button" className="bx-btn bx-btn--borderless bx-btn--sm" aria-label={`Directions to ${o.name}`} onClick={() => onAction?.(o)}>Directions</button>
          </li>
        ))}
      </ul>}
    </section>
  );
}

/* ---------- LiveChat ---------- */

export interface ChatMessage { id: string; from: 'customer' | 'agent'; text: string; name?: string; time?: string }
export interface LiveChatProps { testID?: string; heading?: string; messages: ReadonlyArray<ChatMessage>; typing?: boolean; disabled?: boolean; placeholder?: string; onSend?: (text: string) => void;
  variant?: ChatVariant; loading?: boolean }

/** A conversation with the bank: new messages are announced (a log), Enter sends. */
export function LiveChat({ testID, heading = 'Chat with us', messages, typing, disabled, placeholder = 'Write a message', onSend, variant, loading }: LiveChatProps) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const off = !draft.trim() || disabled;
  const send = () => { if (off) { return; } const t = draft.trim(); setDraft(''); onSend?.(t); };
  const key = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  return (
    <section className={withVariant('bx-panel bx-chat', 'chat', variant)} aria-labelledby={id} data-testid={testID}>
      <h3 className="bx-panel-title" id={id}>{heading}</h3>
      {loading ? <Skeleton /> : null}
      <div className="bx-chat-log" role="log" aria-live="polite" aria-labelledby={id}>
        {messages.map((m) => (
          <div key={m.id} className={'bx-msg' + (m.from === 'customer' ? ' is-mine' : '')}>
            <span className="bx-msg-who">{m.from === 'customer' ? 'You' : m.name ?? 'The bank'}{m.time ? ` · ${m.time}` : ''}</span><span className="bx-msg-text">{m.text}</span>
          </div>
        ))}
      </div>
      {typing ? <p className="bx-chat-typing" role="status">The bank is writing…</p> : null}
      <div className="bx-chat-compose">
        <div className="bx-control"><input className="bx-input" aria-label={placeholder} placeholder={placeholder} value={draft} disabled={disabled} onChange={(e) => setDraft(e.target.value)} onKeyDown={key} /></div>
        <button type="button" className="bx-btn bx-btn--callToAction" disabled={off} onClick={send}>Send</button>
      </div>
    </section>
  );
}

/* ---------- FeedbackRating ---------- */

const WORDS = ['', 'Very poor', 'Poor', 'Fine', 'Good', 'Very good'];
export interface RatingProps { testID?: string; label?: string; value: number; onChange?: (value: number) => void }

/** One to five stars, as radios, and the word for what was chosen. */
export function FeedbackRating({ testID, label = 'How was it?', value, onChange }: RatingProps) {
  const id = useId();
  return (
    <fieldset className="bx-field bx-rating" data-testid={testID}>
      <legend className="bx-label">{label}</legend>
      <div className="bx-stars">
        {[1, 2, 3, 4, 5].map((i) => (
          <label key={i} className={'bx-star' + (i <= value ? ' is-on' : '')}>
            <input type="radio" className="bx-visually-hidden" name={id} checked={i === value} onChange={() => onChange?.(i)} />
            <span aria-hidden="true">★</span><span className="bx-visually-hidden">{`${i} ${i === 1 ? 'star' : 'stars'}, ${WORDS[i]}`}</span>
          </label>
        ))}
        {WORDS[value] ? <span className="bx-rating-word" aria-hidden="true">{WORDS[value]}</span> : null}
      </div>
    </fieldset>
  );
}

/* ---------- group 5 ---------- */

/** The fields of a service request and Raise. */
export function RaiseRequest(p: Opt<StepFormProps, 'heading'>) { return <StepForm heading="Raise a request" submitLabel="Raise request" {...p} />; }
/** Where a service request is. */
export function TrackRequests(p: TimelineProps) { return <Timeline label="Your request" {...p} />; }
/** Messages from the bank, each to open. */
export function Mailbox(p: RowsProps) { return <Rows heading="Messages" actionLabel="Open" emptyText="No messages." {...p} />; }
/** Receipts to download. */
export function EReceipts(p: RowsProps) { return <Rows heading="E-receipts" actionLabel="Download" emptyText="No receipts yet." {...p} />; }
/** Certificates to download. */
export function Certificates(p: RowsProps) { return <Rows heading="Certificates" actionLabel="Download" emptyText="No certificates yet." {...p} />; }
/** The statement's file format. */
export function StatementFormat(p: Opt<SegmentsProps, 'label' | 'options'>) { return <ToggleGroup label="Format" options={['PDF', 'CSV', 'Both']} {...p} />; }
/** The steps of registering online. */
export function SelfRegister(p: Opt<StepperProps, 'steps'>) { return <Stepper label="Register" steps={['Details', 'Verify', 'Password', 'Done']} {...p} />; }
/** The steps of the FATCA and CRS self-certification. */
export function TaxSelfCertification(p: Opt<StepperProps, 'steps'>) { return <Stepper label="Tax self-certification" steps={['Identity', 'Tax residency', 'Declaration', 'Review']} {...p} />; }
/** A product with what it offers and Apply. */
export function ProductCard(p: ThingCardProps) { return <ThingCard actionLabel="Apply now" {...p} />; }
/** Where an application is. */
export function ApplicationTracker(p: TimelineProps) { return <Timeline label="Your application" {...p} />; }
/** The terms and other consents, as checkboxes. */
export function TermsConsent(p: Opt<ChecksProps, 'label'>) { return <Checks label="Before you continue" control="checkbox" {...p} />; }
/** A loan's monthly instalment. */
export function LoanCalculator(p: CalculatorProps) { return <Calculator heading="Loan calculator" mode="loan" {...p} />; }
/** The income the customer earns, for an eligibility check. */
export function EligibilityCalculator(p: Opt<SliderProps, 'label'>) { return <Slider label="Monthly income" max={20000} step={500} {...p} />; }
/** What a deposit is worth at maturity. */
export function DepositCalculator(p: CalculatorProps) { return <Calculator heading="Deposit calculator" mode="td" amount={10000} rate={7} months={12} {...p} />; }
/** An amount in another currency at the screen's rate. */
export function ForexCalculator(p: CalculatorProps) {
  return <Calculator heading="Currency converter" mode="fx" amount={1000} rate={0.92} note="An estimate at today's rate. The rate is fixed when you send." {...p} />;
}
/** How much to save each month for a goal. */
export function GoalCalculator(p: Opt<SliderProps, 'label'>) { return <Slider label="Saving each month" max={5000} step={50} {...p} />; }
/** Nominees on an account, each to edit. */
export function Nominations(p: RowsProps) { return <Rows heading="Nominees" actionLabel="Edit" emptyText="No nominees yet." {...p} />; }
/** Questions and answers. */
export function Faq(p: AccordionProps) { return <Accordion {...p} />; }
