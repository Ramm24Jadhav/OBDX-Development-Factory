/*
 * Group 3 (loans, cards, security), the same markup and bx- classes as bx-g3.js in the premium JET pack.
 * Nothing secret is kept: a code or PIN lives only in the field until the screen takes it, a card number is shown
 * masked (the last four digits), and the biometric prompt only asks; the screen talks to the device and the bank.
 */
import { useEffect, useId, useRef, useState } from 'react';

import { Dialog } from './Dialog';
import { FieldMessage, fieldClass, useField } from './field';
import { Alert, AlertProps, Rows, RowsProps, SegmentsProps, Slider, SliderProps, StepperProps, Stepper, Timeline, TimelineProps, ToggleGroup } from './G1';
import { Details, DetailsProps, StepForm, StepFormProps, Tiles, TilesProps } from './G2';
import { tableParts } from './Material';
import { TableVariant, vc } from './variants-v2';

type Opt<P, K extends keyof P> = Omit<P, K> & Partial<Pick<P, K>>;

/** The last four digits behind dots, as banks show a card or account number. */
export function masked(number: string): string {
  const d = (number || '').replace(/\D/g, '');
  return d ? `•••• ${d.slice(-4)}` : '';
}

/* ---------- RepaymentSchedule ---------- */

export interface ScheduleColumn { field: string; headerText: string; align?: 'start' | 'end' }
export interface ScheduleProps { testID?: string; caption?: string; columns?: ReadonlyArray<ScheduleColumn>; rows: ReadonlyArray<Record<string, string | number | undefined>>;
  /** The style variant (variants/v2.json). */ variant?: TableVariant }

const INSTALMENTS: ScheduleColumn[] = [{ field: 'date', headerText: 'Due date' }, { field: 'amount', headerText: 'Instalment', align: 'end' }];

/** A table of dates and amounts; a row's status (due, overdue, paid) marks it. */
export function RepaymentSchedule({ testID, caption = 'Repayment schedule', columns = INSTALMENTS, rows, variant }: ScheduleProps) {
  const { Table, Head, Body, Row, Cell } = tableParts(variant);
  return (
    <div className={'bx-grid-wrap' + vc('table', variant)} data-testid={testID}>
      <Table className="bx-grid">
        <caption>{caption}</caption>
        <Head><Row>{columns.map((c) => <Cell component="th" key={c.field} scope="col" className={'bx-th' + (c.align === 'end' ? ' is-end' : '')}>{c.headerText}</Cell>)}</Row></Head>
        <Body>
          {rows.map((r, i) => (
            <Row key={i} className={'bx-tr' + (r.status ? ` is-${r.status}` : '')}>
              {columns.map((c) => <Cell key={c.field} className={'bx-td' + (c.align === 'end' ? ' is-end' : '')} data-label={variant === 'cards' ? c.headerText : undefined}>{r[c.field] ?? ''}</Cell>)}
            </Row>
          ))}
        </Body>
      </Table>
    </div>
  );
}

/* ---------- CardTile ---------- */

export interface CardTileProps { testID?: string; label: string; number: string; holder?: string; expiry?: string; network?: string; frozen?: boolean }

/** The card's picture with the number masked; grey when blocked. A screen reader hears one line about it. */
export function CardTile({ testID, label, number, holder, expiry, network, frozen }: CardTileProps) {
  const last = (number || '').replace(/\D/g, '').slice(-4);
  const name = [label, network, `ending ${last}`, frozen ? 'blocked' : ''].filter(Boolean).join(', ');
  return (
    <div className={'bx-card-face' + (frozen ? ' is-frozen' : '')} role="img" aria-label={name} data-testid={testID}>
      <span className="bx-card-face-label" aria-hidden="true">{label}</span>
      <span className="bx-card-face-number bx-mono" aria-hidden="true">{masked(number)}</span>
      <span className="bx-card-face-foot" aria-hidden="true"><span>{holder}</span><span>{expiry}</span><strong>{network}</strong></span>
      {frozen ? <span className="bx-card-face-lock" aria-hidden="true">Blocked</span> : null}
    </div>
  );
}

/* ---------- codes ---------- */

export interface CodeProps {
  testID?: string;
  label: string;
  value: string;
  onChange?: (value: string) => void;
  /** All the digits are in. */
  onComplete?: (value: string) => void;
  length?: number;
  /** Dots instead of digits (a PIN). */
  masked?: boolean;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  error?: string;
  /** A button under it, such as Send a new code. */
  actionLabel?: string;
  onAction?: () => void;
}

/** A one-time code, activation code or PIN in slots: one input (so pasting and the phone's code suggestion work), digits only. */
export function CodeInput({ testID, label, value, onChange, onComplete, length = 6, masked: dots, required, disabled, helpText, error, actionLabel, onAction }: CodeProps) {
  const f = useField({ label, required, error, helpText }, value);
  const v = value ?? '';
  return (
    <div className={fieldClass(f.error, f.focused, disabled) + ' bx-code'} data-testid={testID}>
      <label className="bx-label" htmlFor={f.id}>{label}</label>
      <div className="bx-slots">
        <input className="bx-code-input" id={f.id} type={dots ? 'password' : 'text'} value={v} maxLength={length} inputMode="numeric" autoComplete={dots ? 'off' : 'one-time-code'}
               disabled={disabled} spellCheck={false} aria-required={required || undefined} aria-invalid={f.error ? true : undefined} aria-describedby={f.describedBy}
               onFocus={f.onFocus} onBlur={f.onBlur}
               onChange={(e) => { const n = e.target.value.replace(/\D/g, '').slice(0, length); onChange?.(n); if (n.length === length) { onComplete?.(n); } }} />
        {Array.from({ length }, (_, i) => (
          <span key={i} className={'bx-slot' + (v[i] ? ' is-filled' : '') + (i === v.length && f.focused ? ' is-next' : '')} aria-hidden="true">{v[i] ? (dots ? '•' : v[i]) : ''}</span>
        ))}
      </div>
      <FieldMessage id={f.id} error={f.error} helpText={helpText} />
      {actionLabel ? <button type="button" className="bx-alert-action bx-code-action" onClick={onAction}>{actionLabel}</button> : null}
    </div>
  );
}

/* ---------- switches ---------- */

export interface SwitchOption { value: string; label: string; meta?: string; disabled?: boolean }
export interface ChecksProps {
  testID?: string;
  label: string;
  options: ReadonlyArray<string | SwitchOption>;
  value: string[];
  onChange?: (value: string[]) => void;
  /** A switch for each (settings) or a checkbox (consents). */
  control?: 'switch' | 'checkbox';
  disabled?: boolean;
}

/** Several settings in a fieldset, each a switch or a checkbox. */
export function Checks({ testID, label, options, value, onChange, control = 'switch', disabled }: ChecksProps) {
  const id = useId();
  return (
    <fieldset className="bx-field bx-checks" data-testid={testID}>
      <legend className="bx-label">{label}</legend>
      {options.map((x, i) => {
        const o: SwitchOption = typeof x === 'string' ? { value: x, label: x } : x;
        const on = value.includes(o.value);
        const off = o.disabled || disabled;
        const toggle = () => { if (!off) { onChange?.(on ? value.filter((v) => v !== o.value) : [...value, o.value]); } };
        return (
          <div key={o.value} className="bx-switch-row">
            {control === 'switch' ? (
              <>
                <span className="bx-choice-text"><span className="bx-switch-label" id={`${id}-${i}`}>{o.label}</span>{o.meta ? <span className="bx-choice-meta">{o.meta}</span> : null}</span>
                <button type="button" role="switch" className="bx-switch" aria-checked={on} aria-labelledby={`${id}-${i}`} disabled={off} onClick={toggle} />
              </>
            ) : (
              <label className={'bx-choice' + (on ? ' is-on' : '')}>
                <input type="checkbox" className="bx-choice-input" checked={on} disabled={off} onChange={toggle} />
                <span className="bx-choice-mark" aria-hidden="true" /><span className="bx-choice-label">{o.label}</span>
              </label>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}

export interface SettingProps { testID?: string; label: string; value: boolean; onChange?: (value: boolean) => void; onText?: string; offText?: string; disabled?: boolean; tone?: 'danger' }

/** One setting with what it means when on (or off), said when it changes. */
export function Setting({ testID, label, value, onChange, onText, offText, disabled, tone }: SettingProps) {
  const id = useId();
  const note = value ? onText : offText;
  return (
    <div className={'bx-field bx-toggle' + (value && tone ? ` is-${tone}` : '')} data-testid={testID}>
      <div className="bx-switch-row">
        <span className="bx-switch-label" id={id}>{label}</span>
        <button type="button" role="switch" className="bx-switch" aria-checked={value} aria-labelledby={id} aria-describedby={note ? `${id}-note` : undefined} disabled={disabled}
                onClick={() => onChange?.(!value)} />
      </div>
      {note ? <span className="bx-help" role="status" id={`${id}-note`}>{note}</span> : null}
    </div>
  );
}

/* ---------- AuthChallenge ---------- */

export interface ChallengeProps {
  testID?: string;
  heading?: string;
  text?: string;
  method?: 'face' | 'fingerprint' | 'passkey';
  actionLabel?: string;
  otherLabel?: string;
  /** ready, waiting (the device is asking) or failed. */
  state?: 'ready' | 'waiting' | 'failed';
  failedText?: string;
  onVerify?: () => void;
  onOther?: () => void;
}

const METHOD_ICON = { face: '☺', fingerprint: '◉', passkey: '⚿' };

/** Asks for a biometric or a passkey; the screen does the asking (WebAuthn or the app) and sets the state. */
export function AuthChallenge({ testID, heading = 'Confirm it is you', text, method = 'fingerprint', actionLabel = 'Use fingerprint', otherLabel = 'Use a code instead', state = 'ready',
  failedText = 'That did not work. Try again, or use a code.', onVerify, onOther }: ChallengeProps) {
  const id = useId();
  const waiting = state === 'waiting';
  return (
    <section className="bx-card bx-challenge" aria-labelledby={id} data-testid={testID}>
      <span className={'bx-challenge-icon' + (waiting ? ' is-waiting' : '')} aria-hidden="true">{METHOD_ICON[method]}</span>
      <h3 className="bx-card-title" id={id}>{heading}</h3>
      {text ? <p className="bx-thing-text">{text}</p> : null}
      {state === 'failed' ? <p className="bx-error" role="alert"><span className="bx-error-icon" aria-hidden="true">!</span>{failedText}</p> : null}
      <div className="bx-kv-actions">
        <button type="button" className="bx-btn bx-btn--borderless" onClick={onOther}>{otherLabel}</button>
        <button type="button" className="bx-btn bx-btn--callToAction" aria-busy={waiting || undefined} onClick={() => { if (!waiting) { onVerify?.(); } }}>{actionLabel}</button>
      </div>
    </section>
  );
}

/* ---------- SessionExpiryWarning ---------- */

export interface SessionExpiryProps { testID?: string; open: boolean; seconds?: number; heading?: string; onStay?: () => void; onSignOut?: () => void; onExpire?: () => void; container?: HTMLElement | null }

export function expiryText(s: number): string {
  return 'For your security you will be signed out in ' + (s >= 60 ? `${Math.ceil(s / 60)} ${s >= 120 ? 'minutes' : 'minute'}.` : `${s} ${s === 1 ? 'second' : 'seconds'}.`);
}

/** The session is about to end: a countdown, Stay signed in and Sign out. Said when it opens and in the last ten seconds. */
export function SessionExpiryWarning({ testID, open, seconds = 60, heading = 'Are you still there?', onStay, onSignOut, onExpire, container }: SessionExpiryProps) {
  const [left, setLeft] = useState(seconds);
  const expire = useRef(onExpire);
  expire.current = onExpire;
  useEffect(() => {
    if (!open) { return undefined; }
    setLeft(seconds);
    let n = seconds;
    const t = setInterval(() => { n -= 1; setLeft(n); if (n <= 0) { clearInterval(t); expire.current?.(); } }, 1000);
    return () => clearInterval(t);
  }, [open, seconds]);
  const spoken = left === seconds || left === 10 ? expiryText(left) : '';
  return (
    <Dialog open={open} onOpenChange={() => undefined} title={heading} cancelBehavior="none" testID={testID} container={container}
            footer={<><button type="button" className="bx-btn bx-btn--borderless" onClick={onSignOut}>Sign out</button>
              <button type="button" className="bx-btn bx-btn--callToAction" onClick={onStay}>Stay signed in</button></>}>
      <p>{expiryText(left)}</p>
      <span className="bx-visually-hidden" aria-live="assertive">{spoken}</span>
    </Dialog>
  );
}

/* ---------- SensitiveField ---------- */

/** A number shown masked, in full on request. */
export function SensitiveField({ testID, label = 'Card number', value }: { testID?: string; label?: string; value: string }) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <div className="bx-field bx-sensitive" data-testid={testID}>
      <span className="bx-label" id={id}>{label}</span>
      <div className="bx-control is-readonly" role="group" aria-labelledby={id}>
        <span className="bx-input bx-mono bx-sensitive-value">{shown ? value : masked(value)}</span>
        <button type="button" className="bx-reveal" aria-pressed={shown} aria-label={`${shown ? 'Hide' : 'Show'} ${label}`} onClick={() => setShown(!shown)}>{shown ? 'Hide' : 'Show'}</button>
      </div>
    </div>
  );
}

/* ---------- group 3 ---------- */

/** Each loan with what is outstanding and the next instalment. */
export function LoansSummary(p: TilesProps) { return <Tiles heading="Your loans" {...p} />; }
/** The fields of a loan repayment and Review. */
export function LoanRepayment(p: Opt<StepFormProps, 'heading'>) { return <StepForm heading="Repay a loan" submitLabel="Review repayment" {...p} />; }
/** A promise to pay an overdue amount by a date. */
export function PromiseToPay(p: DetailsProps) { return <Details heading="Promise to pay" actionLabel="Make the promise" {...p} />; }
/** A loan's disbursements in order. */
export function DisbursementTimeline(p: TimelineProps) { return <Timeline label="Disbursements" {...p} />; }
/** The cards with what is due and their limits. */
export function CardList(p: TilesProps) { return <Tiles heading="Your cards" {...p} />; }
/** The code that activates a new card. */
export function ActivateCard(p: Opt<CodeProps, 'label'>) { return <CodeInput label="Enter the activation code" {...p} />; }
/** Pay a purchase over months. */
export function ConvertToEmi(p: Opt<SegmentsProps, 'label' | 'options'>) { return <ToggleGroup label="Pay over" options={['3 months', '6 months', '12 months']} {...p} />; }
/** How many points to redeem. */
export function RedeemPoints(p: Opt<SliderProps, 'label'>) { return <Slider label="Points to redeem" max={12400} step={100} {...p} />; }
/** The card's daily limit. */
export function CardLimits(p: Opt<SliderProps, 'label'>) { return <Slider label="Daily card limit" max={10000} step={100} {...p} />; }
/** Where the card can be used. */
export function CardControls(p: Opt<ChecksProps, 'label'>) { return <Checks label="Allow" {...p} />; }
/** Block the card, and what that means. */
export function BlockCard(p: Opt<SettingProps, 'label'>) {
  return <Setting label="Block the card" onText="The card is blocked: payments and withdrawals are refused until you unblock it." tone="danger" {...p} />;
}
/** A new PIN, in dots. */
export function ResetPin(p: Opt<CodeProps, 'label'>) { return <CodeInput label="Choose a new PIN" length={4} masked {...p} />; }
/** The fields of a dispute and Raise. */
export function RaiseDispute(p: Opt<StepFormProps, 'heading'>) { return <StepForm heading="Raise a dispute" submitLabel="Raise dispute" {...p} />; }
/** The fields of an add-on card and Apply. */
export function AddOnCard(p: Opt<StepFormProps, 'heading'>) { return <StepForm heading="Add-on card" submitLabel="Apply" {...p} />; }
/** The card's statements, each to download. */
export function CardStatements(p: RowsProps) { return <Rows heading="Statements" actionLabel="Download" emptyText="No statements yet." {...p} />; }
/** A one-time code with Send a new code. */
export function OtpInput(p: Opt<CodeProps, 'label'>) { return <CodeInput label="Enter the code" actionLabel="Send a new code" {...p} />; }
/** A payment to confirm with a code. */
export function SecureConfirmation(p: DetailsProps) { return <Details heading="Confirm the payment" actionLabel="Confirm with the code" {...p} />; }
/** The steps of proving who the customer is. */
export function KycSteps(p: Opt<StepperProps, 'steps'>) { return <Stepper label="Verify your identity" steps={['ID', 'Selfie', 'Address']} {...p} />; }
/** A payment the bank stopped, and what to do. */
export function FraudAlert(p: Omit<AlertProps, 'severity'>) { return <Alert heading="Was this you?" actionLabel="Review it" {...p} severity="error" />; }
