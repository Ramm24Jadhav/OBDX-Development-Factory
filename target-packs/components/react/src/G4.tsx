/*
 * Group 4 (insights, approvals, liquidity, settings), the same markup and bx- classes as bx-g4.js in the premium JET
 * pack. Charts and meters show the figures the screen gives; bars are widths in steps of 5% (classes, no inline
 * style), and every figure is also text, so a screen reader hears the numbers.
 */
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import { useId } from 'react';

import { Accordion, AccordionProps, Alert, AlertProps, ChipsProps, FilterChips, Rows, RowsProps, SegmentsProps, Timeline, TimelineProps, ToggleGroup } from './G1';
import { AccountSelector, AccountSelectorProps, Details, DetailsProps } from './G2';
import { Checks, ChecksProps, Setting, SettingProps } from './G3';
import { ChartVariant, ProgressVariant, vx } from './variants';

type Opt<P, K extends keyof P> = Omit<P, K> & Partial<Pick<P, K>>;

/** A share in steps of 5% (0 to 100), for the bx-w-* and bx-h-* classes. */
export function step(part: number, whole: number): number {
  const p = whole > 0 ? Math.max(0, Math.min(1, part / whole)) : 0;
  return Math.round(p * 20) * 5;
}
const figure = (n: number, unit?: string) => n.toLocaleString() + (unit ? ` ${unit}` : '');

/* ---------- BarChart ---------- */

export interface Bar { label: string; value: number; display?: string; tone?: 'danger' | 'success' }
export interface BarChartProps { testID?: string; heading: string; items: ReadonlyArray<Bar>; max?: number; unit?: string; orientation?: 'bars' | 'columns'; note?: string; /** The style: default, rounded, lollipop or meter (one bar split into the figures). */ variant?: ChartVariant }

/** Bars of figures, each with its label and value as text. */
export function BarChart({ testID, heading, items, max, unit, orientation = 'bars', note, variant = 'default' }: BarChartProps) {
  const id = useId();
  const top = max || Math.max(0, ...items.map((o) => o.value || 0));
  const dir = orientation === 'columns' ? 'h' : 'w';
  return (
    <figure className={`bx-chart is-${orientation}${vx(variant)}`} aria-labelledby={id} data-testid={testID}>
      <figcaption className="bx-panel-title" id={id}>{heading}</figcaption>
      {variant === 'meter' ? <MeterBar items={items} /> : null}
      <ul className="bx-bars">
        {items.map((o, i) => (
          <li key={i} className="bx-bar">
            <span className="bx-bar-label">{o.label}</span>
            <span className="bx-bar-track" aria-hidden="true"><span className={`bx-bar-fill bx-${dir}-${step(o.value || 0, top)}` + (o.tone ? ` is-${o.tone}` : '')} /></span>
            <span className="bx-bar-value">{o.display ?? figure(o.value || 0, unit)}</span>
          </li>
        ))}
      </ul>
      {note ? <p className="bx-help">{note}</p> : null}
    </figure>
  );
}

/** The meter chart's one bar: each figure's share of the total, in steps of 5%; the figures are the list below it. */
function MeterBar({ items }: { items: ReadonlyArray<Bar> }) {
  const total = items.reduce((s, o) => s + Math.max(0, o.value || 0), 0);
  return <span className="bx-meter-bar" aria-hidden="true">{items.map((o, i) => <span key={i} className={`bx-meter-seg bx-w-${step(Math.max(0, o.value || 0), total)} bx-seg-${i % 6}`} />)}</span>;
}

/* ---------- meters ---------- */

export interface Meter { id?: string; label: string; value: number; max: number }
export interface MetersProps { testID?: string; heading?: string; items: ReadonlyArray<Meter>; unit?: string; /** From this share (%) the bar turns amber. */ warnAt?: number; /** The style: default, linear (Material, on MUI), ring (Material, on MUI) or segmented. */ variant?: ProgressVariant }

/** How much of each limit, budget or goal is used; over the limit says by how much. */
export function Meters({ testID, heading, items, unit, warnAt = 90, variant = 'default' }: MetersProps) {
  const id = useId();
  return (
    <section className={`bx-panel bx-meters${vx(variant)}`} aria-label={heading || undefined} data-testid={testID}>
      {heading ? <h3 className="bx-panel-title">{heading}</h3> : null}
      {items.map((o, i) => {
        const over = o.max > 0 && o.value > o.max;
        const share = step(o.value, o.max);
        const text = `${figure(o.value, unit)} of ${figure(o.max, unit)}` + (over ? `, over by ${figure(Math.round((o.value - o.max) * 100) / 100, unit)}` : '');
        return (
          <div key={o.id ?? i} className="bx-meter">
            <div className="bx-meter-head"><span id={`${id}-${i}`}>{o.label}</span><span className={'bx-meter-text' + (over ? ' is-over' : '')}>{text}</span></div>
            <div className="bx-meter-track" role="progressbar" aria-valuemin={0} aria-valuemax={o.max} aria-valuenow={Math.min(o.value, o.max)} aria-valuetext={text} aria-labelledby={`${id}-${i}`}>
              <MeterMark variant={variant} share={share} pct={o.max > 0 ? Math.round(Math.min(1, Math.max(0, o.value / o.max)) * 100) : 0}
                         state={over ? ' is-over' : share >= warnAt ? ' is-near' : ''} />
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** The filled part of one meter, drawn for its variant; the track around it carries the figures for screen readers. */
function MeterMark({ variant, share, pct, state }: { variant: ProgressVariant; share: number; pct: number; state: string }) {
  if (variant === 'linear') { return <LinearProgress variant="determinate" value={pct} aria-hidden="true" className={'bx-meter-mui' + state} />; }
  if (variant === 'ring') {
    return <span className={'bx-meter-ring' + state} aria-hidden="true"><CircularProgress variant="determinate" value={pct} size={44} thickness={5} /><span className="bx-meter-pct">{pct}%</span></span>;
  }
  if (variant === 'segmented') {
    return <span className={'bx-meter-segs' + state} aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <span key={i} className={i < Math.round(share / 10) ? 'is-on' : ''} />)}</span>;
  }
  return <span className={`bx-meter-fill bx-w-${share}` + state} />;
}

/* ---------- group 4 ---------- */

/** Spending by month as columns. */
export function SpendingChart(p: Opt<BarChartProps, 'heading'>) { return <BarChart heading="Spending by month" orientation="columns" {...p} />; }
/** Budgets used this month (oj-progress-bar). */
export function ProgressBar(p: MetersProps) { return <Meters heading="Budgets" {...p} />; }
/** A savings goal and how far along it is. */
export function SavingsGoal(p: MetersProps) { return <Meters heading="Savings goal" {...p} />; }
/** Choose a transaction's category. */
export function SpendCategories(p: Opt<ChipsProps, 'label'>) { return <FilterChips label="Category" multiple={false} {...p} />; }
/** Payments and requests waiting for this approver. */
export function ApprovalQueue(p: RowsProps) { return <Rows heading="Waiting for your approval" actionLabel="Review" emptyText="Nothing is waiting for you." {...p} />; }
/** One item to approve, in full. */
export function ApprovalDetail(p: DetailsProps) { return <Details heading="Approval" actionLabel="Approve" {...p} />; }
/** Who has approved, and who is next. */
export function ApprovalJourney(p: TimelineProps) { return <Timeline label="Approval journey" {...p} />; }
/** Send an approval to someone else. */
export function Reroute(p: AccountSelectorProps) { return <AccountSelector label="Re-route to" {...p} />; }
/** An item sent back for changes. */
export function ModificationNotice(p: Omit<AlertProps, 'severity'>) { return <Alert heading="Sent back for changes" actionLabel="Modify it" {...p} severity="warning" />; }
/** Approved items waiting for release. */
export function PendingRelease(p: RowsProps) { return <Rows heading="Approved, waiting for release" actionLabel="Release" emptyText="Nothing is waiting for release." {...p} />; }
/** The kind of liquidity structure. */
export function StructureType(p: Opt<SegmentsProps, 'label' | 'options'>) { return <ToggleGroup label="Structure" options={['Sweep', 'Pool', 'Hybrid']} {...p} />; }
/** The header and child accounts of a structure, each with its rule. */
export function AccountStructure(p: AccordionProps) { return <Accordion multiple {...p} />; }
/** What a structure would do. */
export function StructureSimulation(p: DetailsProps) { return <Details heading="Simulation" actionLabel="Run the simulation" {...p} />; }
/** How much of each intercompany limit is used. */
export function LendLimits(p: MetersProps) { return <Meters heading="Intercompany limits" {...p} />; }
/** Today's sweep, step by step. */
export function SweepMonitor(p: TimelineProps) { return <Timeline label="Today's sweep" {...p} />; }
/** The customer's details and Edit. */
export function Profile(p: DetailsProps) { return <Details heading="Your profile" actionLabel="Edit profile" {...p} />; }
/** Ways to sign in, each on or off. */
export function SignInOptions(p: Opt<ChecksProps, 'label'>) { return <Checks label="Sign in with" {...p} />; }
/** Where one-time codes go. */
export function CodeDelivery(p: Opt<SegmentsProps, 'label' | 'options'>) { return <ToggleGroup label="Send codes by" options={['SMS', 'Email', 'App']} {...p} />; }
/** The registered devices, each with Remove. */
export function Devices(p: RowsProps) { return <Rows heading="Your devices" actionLabel="Remove" emptyText="No devices registered." {...p} />; }
/** Light, dark or the system's. */
export function Appearance(p: Opt<SegmentsProps, 'label' | 'options'>) { return <ToggleGroup label="Theme" options={['Light', 'Dark', 'System']} {...p} />; }
/** The language of the app. */
export function LanguagePicker(p: AccountSelectorProps) { return <AccountSelector label="Language" {...p} />; }
/** Which alerts to get. */
export function AlertSubscriptions(p: Opt<ChecksProps, 'label'>) { return <Checks label="Tell me about" {...p} />; }
/** Quiet hours for alerts. */
export function DoNotDisturb(p: Opt<SettingProps, 'label'>) {
  return <Setting label="Quiet hours, 22:00 to 07:00" onText="Alerts wait until the quiet hours end; security alerts still come at once." {...p} />;
}
/** Apps given access (open banking), each with Revoke. */
export function Consents(p: RowsProps) { return <Rows heading="Apps you have allowed" actionLabel="Revoke" emptyText="You have not allowed any apps." {...p} />; }
/** How much of each limit is used today. */
export function TransactionLimits(p: MetersProps) { return <Meters heading="Your limits today" {...p} />; }
/** Recent sign-ins, where and on what. */
export function SessionSummary(p: TimelineProps) { return <Timeline label="Recent sign-ins" {...p} />; }
