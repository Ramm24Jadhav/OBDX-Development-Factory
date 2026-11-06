/*
 * Group 2 (accounts, payments, deposits), the same markup and bx- classes as bx-g2.js in the premium JET pack.
 * No business logic and nothing kept: amounts, balances and masked numbers come from the screen; an amount shows the
 * decimals of its currency; the IBAN check is the ISO 13616 checksum only.
 */
import { ReactNode, useId, useState } from 'react';

import { Dropdown, DropdownProps } from './Dropdown';
import { FieldProps, FieldShell, useField } from './field';
import { ChipsProps, FilterChips, Rows, RowsProps, SegmentsProps, StepperProps, Stepper, ToggleGroup, initials } from './G1';
import { decimalsOf } from './TextField';

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
export const ibanGroups = (text: string) => (text || '').replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();

export interface Detail { label: string; value: string; total?: boolean }

/* ---------- AccountSelector ---------- */

export interface AccountOption { value: string; label: string; meta?: string; disabled?: boolean }
export interface AccountSelectorProps extends Omit<DropdownProps, 'options' | 'label'> { label?: string; options: ReadonlyArray<AccountOption> }

/** Choose an account (oj-select-single); the chosen one's detail, such as its available balance, is the help line. */
export function AccountSelector({ label = 'From account', options, helpText, ...rest }: AccountSelectorProps) {
  const chosen = options.find((o) => o.value === rest.value);
  return <Dropdown {...rest} label={label} options={options} helpText={helpText || chosen?.meta} />;
}

/* ---------- tiles ---------- */

export interface Tile { id?: string; label: string; value: string; meta?: string; tone?: 'danger' | 'success' }
export interface TilesProps { testID?: string; heading?: string; items: ReadonlyArray<Tile>; onAction?: (item: Tile) => void }

/** A figure each (accounts, deposits, loans); with onAction each is a button that opens it. */
export function Tiles({ testID, heading, items, onAction }: TilesProps) {
  return (
    <section className="bx-tiles-wrap" aria-label={heading || undefined} data-testid={testID}>
      {heading ? <h3 className="bx-panel-title">{heading}</h3> : null}
      <ul className="bx-tiles">
        {items.map((o, i) => {
          const body = <><span className="bx-tile-label">{o.label}</span><span className="bx-tile-value">{o.value}</span>{o.meta ? <span className="bx-tile-meta">{o.meta}</span> : null}</>;
          const css = 'bx-tile' + (o.tone ? ` is-${o.tone}` : '');
          return <li key={o.id ?? i}>{onAction ? <button type="button" className={`${css} is-interactive`} onClick={() => onAction(o)}>{body}</button> : <div className={css}>{body}</div>}</li>;
        })}
      </ul>
    </section>
  );
}

/* ---------- AccountBalance ---------- */

export interface BalanceProps { testID?: string; label: string; amount: number | string; currency?: string; meta?: string; hideable?: boolean; hidden?: boolean; onHiddenChange?: (hidden: boolean) => void }

/** An account's balance in its currency, hidden on request. */
export function AccountBalance({ testID, label, amount, currency, meta, hideable = true, hidden, onHiddenChange }: BalanceProps) {
  const id = useId();
  const [own, setOwn] = useState(false);
  const off = hidden ?? own;
  const toggle = () => { setOwn(!off); onHiddenChange?.(!off); };
  return (
    <section className="bx-balance" aria-labelledby={id} data-testid={testID}>
      <div className="bx-balance-head">
        <h3 className="bx-balance-label" id={id}>{label}</h3>
        {hideable ? <button type="button" className="bx-reveal" aria-pressed={!off} onClick={toggle}>{off ? 'Show balance' : 'Hide balance'}</button> : null}
      </div>
      <p className="bx-balance-amount">{off ? '••••••' : money(amount, currency)}</p>
      {meta && !off ? <p className="bx-balance-meta">{meta}</p> : null}
    </section>
  );
}

/* ---------- cards ---------- */

export interface ThingCardProps { testID?: string; heading: string; text?: string; badge?: string; actionLabel?: string; onAction?: () => void; children?: ReactNode }

/** A thing to act on (an account, a payee, a product), with a badge and an action. */
export function ThingCard({ testID, heading, text, badge, actionLabel, onAction, children }: ThingCardProps) {
  const id = useId();
  return (
    <article className="bx-card bx-thing" aria-labelledby={id} data-testid={testID}>
      <div className="bx-thing-head"><h3 className="bx-card-title" id={id}>{heading}</h3>{badge ? <span className="bx-badge is-info">{badge}</span> : null}</div>
      {text ? <p className="bx-thing-text">{text}</p> : null}
      {children}
      {actionLabel ? <button type="button" className="bx-thing-action" aria-label={`${actionLabel.replace(/\s*→$/, '')}: ${heading}`} onClick={onAction}>{actionLabel}</button> : null}
    </article>
  );
}

/* ---------- details ---------- */

export interface DetailsProps { testID?: string; heading?: string; items: ReadonlyArray<Detail>; actionLabel?: string; onAction?: () => void; busy?: boolean }

/** Details as label and value, with the main action; a total row stands out. */
export function Details({ testID, heading, items, actionLabel, onAction, busy }: DetailsProps) {
  return (
    <section className="bx-panel bx-kv" aria-label={heading || undefined} data-testid={testID}>
      {heading ? <h3 className="bx-panel-title">{heading}</h3> : null}
      <DetailList items={items} />
      {actionLabel ? <div className="bx-kv-actions"><button type="button" className="bx-btn bx-btn--callToAction" disabled={busy} aria-busy={busy || undefined} onClick={onAction}>{actionLabel}</button></div> : null}
    </section>
  );
}

export function DetailList({ items }: { items: ReadonlyArray<Detail> }) {
  return <dl className="bx-kv-list">{items.map((o, i) => <div key={i} className={'bx-kv-row' + (o.total ? ' is-total' : '')}><dt>{o.label}</dt><dd>{o.value}</dd></div>)}</dl>;
}

/* ---------- AccountNumber (IBAN) ---------- */

/** An account number in groups of four, checked with the ISO checksum when the customer leaves it; the value has no spaces. */
export function AccountNumber(props: Omit<FieldProps<string>, 'label'> & { label?: string }) {
  const { testID, label = 'Account number (IBAN)', value, onChange, required, readOnly, disabled, helpText, placeholder } = props;
  const [typed, setTyped] = useState<string | null>(null);
  const [own, setOwn] = useState('');
  const f = useField({ ...props, label }, value, own);
  const leave = () => {
    f.onBlur();
    if (typed === null) { return; }
    const t = typed.replace(/\s+/g, '').toUpperCase();
    setTyped(null);
    if (t && !ibanValid(t)) { setOwn('Check the IBAN: it starts with the country code, for example GB29 NWBK 6016 1331 9268 19.'); return; }
    setOwn('');
    onChange?.(t);
  };
  return (
    <FieldShell testID={testID} id={f.id} label={label} required={required} error={f.error} focused={f.focused} disabled={disabled} readOnly={readOnly} helpText={helpText}>
      <input className="bx-input bx-mono" id={f.id} data-testid={`${testID}-input`} value={typed ?? ibanGroups(value ?? '')} placeholder={placeholder} disabled={disabled} readOnly={readOnly}
             autoComplete="off" spellCheck={false} autoCapitalize="characters" aria-required={required || undefined} aria-invalid={f.error ? true : undefined}
             aria-describedby={f.describedBy} onFocus={f.onFocus} onBlur={leave} onChange={(e) => setTyped(e.target.value)} />
      {value && ibanValid(value) && !f.error ? <span className="bx-check-mark" aria-hidden="true">✓</span> : null}
    </FieldShell>
  );
}

/* ---------- QuickActions ---------- */

export interface QuickItem { id: string; label: string; icon?: string }
export interface QuickActionsProps { testID?: string; label?: string; items: ReadonlyArray<QuickItem>; onAction?: (id: string) => void }

/** Shortcuts as tiles of an icon and a word. */
export function QuickActions({ testID, label = 'Quick actions', items, onAction }: QuickActionsProps) {
  return (
    <nav className="bx-quick" aria-label={label} data-testid={testID}>
      <ul>{items.map((o) => <li key={o.id}><button type="button" className="bx-quick-item" onClick={() => onAction?.(o.id)}><span className="bx-quick-icon" aria-hidden="true">{o.icon ?? '•'}</span><span>{o.label}</span></button></li>)}</ul>
    </nav>
  );
}

/* ---------- BeneficiarySelector (payee list) ---------- */

export interface Payee { id: string; name: string; meta?: string }
export interface PayeesProps { testID?: string; heading?: string; items: ReadonlyArray<Payee>; searchable?: boolean; emptyText?: string; onAction?: (payee: Payee) => void }

/** The saved payees, found by name, picked to pay. */
export function BeneficiarySelector({ testID, heading = 'Payees', items, searchable = true, emptyText = 'No payees match.', onAction }: PayeesProps) {
  const id = useId();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const rows = items.filter((o) => !q || o.name.toLowerCase().includes(q));
  return (
    <section className="bx-panel" aria-labelledby={id} data-testid={testID}>
      <h3 className="bx-panel-title" id={id}>{heading}</h3>
      {searchable ? (
        <div className="bx-control bx-payee-search"><span className="bx-search-icon" aria-hidden="true" />
          <input type="search" className="bx-input bx-search" aria-label={`Search ${heading}`} placeholder="Name" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      ) : null}
      {rows.length === 0 ? <p className="bx-panel-empty" role="status">{emptyText}</p> : null}
      <ul className="bx-rows">
        {rows.map((o) => (
          <li key={o.id} className="bx-row">
            <button type="button" className="bx-payee" onClick={() => onAction?.(o)}>
              <span className="bx-avatar is-sm" aria-hidden="true">{initials(o.name)}</span>
              <span className="bx-row-main"><strong>{o.name}</strong>{o.meta ? <span className="bx-row-meta">{o.meta}</span> : null}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- forms ---------- */

export interface StepFormProps {
  testID?: string;
  heading: string;
  /** A summary under the fields. */
  items?: ReadonlyArray<Detail>;
  submitLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onSubmit?: () => void;
  onCancel?: () => void;
  /** The screen's fields. */
  children?: ReactNode;
}

/** The screen's fields in a titled step, a summary, and Submit and Cancel. Checks and the service call are the screen's. */
export function StepForm({ testID, heading, items = [], submitLabel = 'Continue', cancelLabel, busy, onSubmit, onCancel, children }: StepFormProps) {
  const id = useId();
  return (
    <section className="bx-card bx-form" aria-labelledby={id} data-testid={testID}>
      <h3 className="bx-card-title" id={id}>{heading}</h3>
      <div className="bx-form-body">{children}</div>
      {items.length ? <DetailList items={items} /> : null}
      <div className="bx-kv-actions">
        {cancelLabel ? <button type="button" className="bx-btn bx-btn--borderless" onClick={onCancel}>{cancelLabel}</button> : null}
        <button type="button" className="bx-btn bx-btn--callToAction" disabled={busy} aria-busy={busy || undefined} onClick={onSubmit}>{submitLabel}</button>
      </div>
    </section>
  );
}

/* ---------- TransactionHistory ---------- */

export interface Transaction { id: string; description: string; date?: string; meta?: string; amount: number | string; currency?: string }
export interface TransactionsProps { testID?: string; heading?: string; items: ReadonlyArray<Transaction>; currency?: string; emptyText?: string; onAction?: (item: Transaction) => void }

/** What came in and went out; money in is green with a plus, and a screen reader says which. */
export function Transactions({ testID, heading = 'Transactions', items, currency, emptyText = 'No transactions in this period.', onAction }: TransactionsProps) {
  const id = useId();
  return (
    <section className="bx-panel" aria-labelledby={id} data-testid={testID}>
      <h3 className="bx-panel-title" id={id}>{heading}</h3>
      {items.length === 0 ? <p className="bx-panel-empty">{emptyText}</p> : null}
      <ul className="bx-rows">
        {items.map((o) => {
          const n = typeof o.amount === 'number' ? o.amount : Number(String(o.amount).replace(/[^\d.-]/g, ''));
          const shown = typeof o.amount === 'number' ? (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n), o.currency ?? currency) : o.amount;
          const meta = [o.date, o.meta].filter(Boolean).join(' · ');
          const body = (
            <>
              <span className="bx-avatar is-sm" aria-hidden="true">{initials(o.description)}</span>
              <span className="bx-row-main"><strong>{o.description}</strong>{meta ? <span className="bx-row-meta">{meta}</span> : null}</span>
              <span className={'bx-tx-amount' + (n > 0 ? ' is-in' : '')}><span className="bx-visually-hidden">{n > 0 ? 'Money in' : n < 0 ? 'Money out' : ''}</span>{shown}</span>
            </>
          );
          return <li key={o.id} className="bx-row">{onAction ? <button type="button" className="bx-payee bx-tx" onClick={() => onAction(o)}>{body}</button> : <div className="bx-payee bx-tx">{body}</div>}</li>;
        })}
      </ul>
    </section>
  );
}

/* ---------- TransactionReceipt ---------- */

export interface ReceiptProps { testID?: string; heading?: string; amount?: number | string; currency?: string; items?: ReadonlyArray<Detail>; reference?: string; children?: ReactNode }

/** Done: the amount, the reference, the details and what to do with it (the actions go in children). */
export function TransactionReceipt({ testID, heading = 'Payment sent', amount, currency, items = [], reference, children }: ReceiptProps) {
  const id = useId();
  const shown = money(amount, currency);
  return (
    <section className="bx-card bx-receipt" aria-labelledby={id} data-testid={testID}>
      <span className="bx-receipt-mark" aria-hidden="true">✓</span>
      <h3 className="bx-receipt-title" id={id}>{heading}</h3>
      {shown ? <p className="bx-receipt-amount">{shown}</p> : null}
      {reference ? <p className="bx-receipt-ref">Reference <span className="bx-mono">{reference}</span></p> : null}
      {items.length ? <DetailList items={items} /> : null}
      <div className="bx-kv-actions">{children}</div>
    </section>
  );
}

/* ---------- choice cards ---------- */

export interface ChoiceOption { value: string; label: string; meta?: string; disabled?: boolean }
export interface ChoiceCardsProps { testID?: string; label: string; options: ReadonlyArray<string | ChoiceOption>; value: string; onChange?: (value: string) => void; required?: boolean }

/** One option as a card, with a line under each. */
export function ChoiceCards({ testID, label, options, value, onChange, required }: ChoiceCardsProps) {
  const id = useId();
  return (
    <fieldset className="bx-field" data-testid={testID}>
      <legend className="bx-label">{label}{required ? <span className="bx-req" aria-hidden="true"> *</span> : null}</legend>
      <div className="bx-choices">
        {options.map((x, i) => {
          const o = typeof x === 'string' ? { value: x, label: x } as ChoiceOption : x;
          const on = o.value === value;
          return (
            <label key={o.value} className={'bx-choice' + (on ? ' is-on' : '') + (o.disabled ? ' is-disabled' : '')}>
              <input type="radio" className="bx-choice-input" id={`${id}-${i}`} name={id} checked={on} disabled={o.disabled} onChange={() => onChange?.(o.value)} />
              <span className="bx-choice-mark" aria-hidden="true" />
              <span className="bx-choice-text"><span className="bx-choice-label">{o.label}</span>{o.meta ? <span className="bx-choice-meta">{o.meta}</span> : null}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ---------- group 2 ---------- */

type Opt<P, K extends keyof P> = Omit<P, K> & Partial<Pick<P, K>>;

/** Each account type with its total; pick one for detail. */
export function AccountSummary(p: TilesProps) { return <Tiles heading="Your accounts" {...p} />; }
/** An account with its balance and a link to its detail. */
export function AccountCard(p: ThingCardProps) { return <ThingCard actionLabel="View details" {...p} />; }
/** An account's details, such as its branch and IBAN. */
export function AccountDetails(p: DetailsProps) { return <Details heading="Account details" {...p} />; }
/** A payee with their bank and a way to pay them. */
export function BeneficiaryCard(p: ThingCardProps) { return <ThingCard actionLabel="Pay now" {...p} />; }
/** The fields of a payment and Review. */
export function PaymentForm(p: Opt<StepFormProps, 'heading'>) { return <StepForm heading="Payment" submitLabel="Review payment" {...p} />; }
/** A transfer to check before it goes. */
export function TransferSummary(p: DetailsProps) { return <Details heading="Check the transfer" actionLabel="Confirm transfer" {...p} />; }
/** Where a payment is. */
export function PaymentStatus(p: StepperProps) { return <Stepper label="Payment status" {...p} />; }
/** The account's transactions. */
export function TransactionHistory(p: TransactionsProps) { return <Transactions {...p} />; }
/** What kind of transactions to show. */
export function TransactionFilter(p: Opt<ChipsProps, 'label'>) { return <FilterChips label="Show" {...p} />; }
/** One transaction in full. */
export function TransactionDetails(p: DetailsProps) { return <Details heading="Transaction" {...p} />; }
/** How often a payment goes. */
export function PaymentSchedule(p: Opt<SegmentsProps, 'label' | 'options'>) { return <ToggleGroup label="Repeat" options={['Once', 'Weekly', 'Monthly']} {...p} />; }
/** Bills due soon, each with Pay. */
export function UpcomingBills(p: RowsProps) { return <Rows heading="Upcoming bills" actionLabel="Pay" emptyText="No bills due." {...p} />; }
/** The deposits, their interest and the next maturity. */
export function DepositsSummary(p: TilesProps) { return <Tiles heading="Deposits" {...p} />; }
/** The fields of a new deposit and Review. */
export function NewDepositForm(p: Opt<StepFormProps, 'heading'>) { return <StepForm heading="New deposit" submitLabel="Review deposit" {...p} />; }
/** What happens to a deposit when it matures. */
export function MaturityInstructions(p: Opt<ChoiceCardsProps, 'label'>) { return <ChoiceCards label="At maturity" {...p} />; }
/** Adding money to a deposit. */
export function DepositTopUp(p: DetailsProps) { return <Details heading="Top up the deposit" actionLabel="Top up" {...p} />; }
/** Closing a deposit early, with what the customer receives. */
export function DepositRedemption(p: DetailsProps) { return <Details heading="Redeem the deposit" actionLabel="Redeem" {...p} />; }

