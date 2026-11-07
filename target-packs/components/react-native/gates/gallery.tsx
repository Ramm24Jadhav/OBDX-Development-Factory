/*
 * The React Native pack's gallery for the browser gates: each component in its main state, one <section
 * data-component="id"> each (the catalogue ids), in the theme the URL asks for (?mode=light|dark). Fixed data so the
 * screenshots are stable; values are held in state so the controls work.
 */
import { ReactElement, ReactNode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Text } from 'react-native';

import { SAMPLES } from './samples';

import {
  AccountBalance, Accordion, AlertSubscriptions, AmountInput, ApprovalQueue, Autocomplete, BarChart, Button, Card, CardTile, CheckboxGroup, CurrencySelector,
  DataTable, DatePicker, DateRangePicker, DestructiveButton, Dialog, Dropdown, ErrorMessage, Faq, FileUpload, FilterChips, IconButton, LoanCalculator,
  MultiSelect, NumberInput, OtpInput, OverviewWidget, PasswordField, ProgressBar, RadioGroup, RollingDigits, SearchField, SecondaryButton, SlideToConfirm,
  StatusBadge, Stepper, SuccessCheck, Tabs, TextArea, TextField, ThemeProvider, Timeline, Toast, Toggle, ToggleGroup, TransactionHistory, useTheme, type ComponentStyle,
} from '../src';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'dark' ? 'dark' : 'light';
// The factory's Component factory shows one section (?only=id) in the design, motion and brand its card has chosen
const only = params.get('only');
const look = (params.get('look') || 'elevated') as NonNullable<ComponentStyle['look']>;
const click = (params.get('click') || 'press') as NonNullable<NonNullable<ComponentStyle['motion']>['click']>;
const scroll = (params.get('scroll') || 'fadeup') as NonNullable<NonNullable<ComponentStyle['motion']>['scroll']>;
const brand = /^#[0-9a-f]{6}$/i.test(params.get('brand') ?? '') ? params.get('brand')! : undefined;
const accounts = [{ value: 'S', label: 'Savings •••• 4521' }, { value: 'C', label: 'Current •••• 0187' }];
const rows = [
  { id: 't1', date: '12 Nov 2026', text: 'Electricity bill', amount: '-1,240.00' },
  { id: 't2', date: '11 Nov 2026', text: 'Salary', amount: '85,000.00' },
];
// ?variant=<id> draws the containers and navigation in one of their style variants (variants/v2.json); a component without it ignores it
const variant = (new URLSearchParams(location.search).get('variant') || undefined) as never;
const noop = () => undefined;

/** Gallery text in the theme's colour (the platform default is black in the dark theme). */
function Line({ children }: { children: ReactNode }) {
  return <Text style={{ color: useTheme().color.text }}>{children}</Text>;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  if (only && only !== id) { return null; }
  return (
    <section className="gate" data-component={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{title}</h2>
      <div className="gate-body">{children}</div>
    </section>
  );
}

/** A controlled component with its own state, so a section needs one line. */
function Held<T>({ initial, children }: { initial: T; children: (value: T, set: (v: T) => void) => ReactElement }) {
  const [value, setValue] = useState<T>(initial);
  return children(value, setValue);
}

function Gallery() {
  return (
    <ThemeProvider style={{ mode, look, motion: { click, scroll } }} brand={brand}>
      <main className={`gallery ${mode}`} data-gallery-ready>
        {/* A component the sections below do not show, from the unit tests' examples, when the factory asks for it alone */}
        {only && SAMPLES[only] ? <Section id={only} title={SAMPLES[only][0]}>{SAMPLES[only][1]}</Section> : null}
        {/* The foundation and the forms wave (the same ids as the web packs' galleries) */}
        <Section id="button" title="Button"><Button label="Pay now" /><Button label="Paying" busy /></Section>
        <Section id="icon-button" title="Icon button"><IconButton label="More actions" /><IconButton label="Close" icon="close" chroming="outlined" /></Section>
        <Section id="text-field" title="Text field">
          <Held initial="A. Sharma">{(v, set) => <TextField testID="tf1" label="Beneficiary name" value={v} onChange={set} required maxLength={40} clearable />}</Held>
          <TextField testID="tf2" label="Reference" value="INV 2041" error="Use letters and numbers only." />
        </Section>
        <Section id="amount" title="Amount input">
          <Held<number | null> initial={1250}>{(v, set) => <AmountInput testID="am1" label="Amount" currency="INR" value={v} onChange={set} required />}</Held>
        </Section>
        <Section id="select" title="Dropdown">
          <Held initial="S">{(v, set) => <Dropdown testID="dd1" label="From account" options={accounts} value={v} onChange={set} required />}</Held>
        </Section>
        <Section id="checkbox-group" title="Checkbox group">
          <Held initial={['E']}>{(v, set) => <CheckboxGroup testID="cg" label="Send alerts by" options={[{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }]}
                                                            value={v} onChange={set} />}</Held>
        </Section>
        <Section id="choice-group" title="Radio group">
          <Held initial="N">{(v, set) => <RadioGroup testID="rg" label="Transfer speed" horizontal value={v} onChange={set}
                                                     options={[{ value: 'N', label: 'NEFT' }, { value: 'I', label: 'IMPS' }]} />}</Held>
        </Section>
        <Section id="date" title="Date"><Held initial="2026-11-12">{(v, set) => <DatePicker testID="dp" label="Pay on" value={v} onChange={set} />}</Held></Section>
        <Section id="dialog" title="Dialog">
          <Dialog variant={variant} open={false} onOpenChange={noop} title="Delete A. Sharma?" description="You can add them again later." />
          <Line>The dialog opens over the screen (a modal); its look is checked in its open state on devices.</Line>
        </Section>
        <Section id="toast" title="Toast">
          <Toast onClose={noop} messages={[{ id: '1', severity: 'error', summary: 'Payment failed', detail: 'The account is blocked. Call the bank.', autoTimeout: 0 },
            { id: '2', severity: 'confirmation', summary: 'Beneficiary added', autoTimeout: 0 }]} />
        </Section>
        <Section id="card" title="Card"><Card variant={variant} heading="Savings •••• 4521" subheading="Available balance"><Line>₹85,000.00</Line></Card></Section>
        <Section id="tabs" title="Tabs">
          <Held initial="c">{(v, set) => <Tabs variant={variant} label="Accounts" selection={v} onSelectionChange={set} tabs={[{ id: 'c', label: 'Current', content: <Line>2 current accounts</Line> },
            { id: 's', label: 'Savings', content: <Line>1 savings account</Line> }]} />}</Held>
        </Section>
        <Section id="data-grid" title="Data table">
          <DataTable variant={variant} caption="Recent transactions" rows={rows} keyField="id" columns={[{ field: 'date', headerText: 'Date' }, { field: 'text', headerText: 'Description' },
            { field: 'amount', headerText: 'Amount', align: 'end' }]} />
        </Section>
        <Section id="text-area" title="Text area"><Held initial="Rent for November">{(v, set) => <TextArea testID="ta1" label="Remarks" value={v} onChange={set} maxLength={140} />}</Held></Section>
        <Section id="password" title="Password"><Held initial="s3cret-pass">{(v, set) => <PasswordField testID="pw1" label="Password" value={v} onChange={set} />}</Held></Section>
        <Section id="number-input" title="Number">
          <Held<number | null> initial={2}>{(v, set) => <NumberInput testID="ni1" label="Cheque leaves" value={v} onChange={set} min={1} max={5} />}</Held>
        </Section>
        <Section id="currency-picker" title="Currency"><Held initial="INR">{(v, set) => <CurrencySelector testID="cp1" label="Currency" value={v} onChange={set} required />}</Held></Section>
        <Section id="multi-select" title="Multi select">
          <Held initial={['S']}>{(v, set) => <MultiSelect testID="ms1" label="Accounts on the statement" options={accounts} value={v} onChange={set} />}</Held>
        </Section>
        <Section id="switch" title="Switch"><Held<boolean> initial={true}>{(v, set) => <Toggle testID="sw1" label="Paperless statements" value={v} onChange={set} />}</Held></Section>
        <Section id="date-range" title="Date range">
          <Held initial={{ from: '2026-10-01', to: '2026-10-31' }}>{(v, set) => <DateRangePicker testID="dr1" label="Statement period" value={v} onChange={set} maxDays={92} />}</Held>
        </Section>
        <Section id="search" title="Search"><Held initial="rent">{(v, set) => <SearchField testID="se1" label="Search transactions" value={v} onChange={set} />}</Held></Section>
        <Section id="autocomplete" title="Autocomplete">
          <Held initial="P1">{(v, set) => <Autocomplete testID="ac1" label="Payee" value={v} onChange={set}
                                                       options={[{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }]} />}</Held>
        </Section>
        <Section id="document-upload" title="Document upload">
          <FileUpload testID="du1" label="Proof of address" value={[{ name: 'statement-october.pdf', size: 248000, type: 'application/pdf' }]} pick={async () => []}
                      accept=".pdf" />
        </Section>

        {/* One of each kind from the banking groups (the rest are built on the same parts) */}
        <Section id="secondary-button" title="Secondary button"><SecondaryButton label="Save for later" /></Section>
        <Section id="danger-button" title="Destructive button"><DestructiveButton label="Cancel payment" /></Section>
        <Section id="segmented" title="Toggle group"><Held initial="Day">{(v, set) => <ToggleGroup testID="tg" label="Show" value={v} onChange={set} options={['Day', 'Week', 'Month']} />}</Held></Section>
        <Section id="filter-chips" title="Filter chips"><Held initial={['Card']}>{(v, set) => <FilterChips testID="fc" label="Filter" value={v} onChange={set} options={['Card', 'Transfer', 'Bills']} />}</Held></Section>
        <Section id="accordion" title="Accordion"><Accordion variant={variant} testID="acc" items={[{ id: 'a', title: 'How long does a transfer take?', body: 'Same day inside the bank.' }]} expanded={['a']} /></Section>
        <Section id="stepper" title="Stepper"><Stepper testID="st" steps={['Details', 'Review', 'Done']} selectedStep="Review" /></Section>
        <Section id="status-badge" title="Status badge"><StatusBadge label="Completed" tone="success" /><StatusBadge label="Failed" tone="danger" /></Section>
        <Section id="timeline" title="Timeline"><Timeline testID="tl" items={[{ label: 'Initiated', meta: '09:12' }, { label: 'Completed', state: 'current' }]} /></Section>
        <Section id="error-message" title="Error message"><ErrorMessage testID="em" message="The amount is more than your daily limit of 5,000.00." actionLabel="Change the amount" /></Section>
        <Section id="balance-card" title="Account balance"><AccountBalance testID="ab" label="Savings ·· 4821" balance={12400} available={12150} currency="USD" /></Section>
        <Section id="transaction-list" title="Transaction history">
          <TransactionHistory testID="th" transactions={[{ id: '1', description: 'Coffee House', date: 'Today', amount: -4.5, currency: 'USD' },
            { id: '2', description: 'Salary', date: '1 Nov', amount: 4200, currency: 'USD' }]} />
        </Section>
        <Section id="otp" title="OTP input"><Held initial="12">{(v, set) => <OtpInput testID="otp" label="Enter the code" value={v} onChange={set} />}</Held></Section>
        <Section id="card-tile" title="Card tile"><Held initial={false}>{(v, set) => <CardTile testID="ct" card={{ id: 'c', name: 'Platinum', number: '4111111111114821', expiry: '08/29' }}
                                                                                       frozen={v} onFrozenChange={set} />}</Held></Section>
        <Section id="spending-chart" title="Chart"><BarChart testID="bc" label="Spending" currency="USD" bars={[{ label: 'Sep', value: 980 }, { label: 'Oct', value: 1240 }]} /></Section>
        <Section id="budget-progress" title="Progress bar"><ProgressBar testID="pb" currency="USD" items={[{ label: 'Groceries', value: 320, max: 400 }, { label: 'Eating out', value: 210, max: 200 }]} /></Section>
        <Section id="approval-queue" title="Pending for approval"><ApprovalQueue testID="aq" items={[{ id: 'p', title: 'Payroll Feb', meta: '182,400.00', priority: true }]} onApprove={noop} onReject={noop} /></Section>
        <Section id="alerts-subscription" title="Alerts"><Held initial={['Low balance']}>{(v, set) => <AlertSubscriptions testID="as" label="Tell me about" value={v} onChange={set}
                                                                                                                     options={['Low balance', 'Payments over 500.00']} />}</Held></Section>
        <Section id="loan-calculator" title="Loan calculator"><LoanCalculator testID="lc" value={{ amount: 100000, rate: 12, months: 12 }} currency="USD" /></Section>
        <Section id="faq" title="FAQ"><Faq variant={variant} testID="faq" items={[{ id: 'a', title: 'How do I block my card?', body: 'Settings › Cards › Block.' }]} /></Section>
        <Section id="overview" title="Overview widget"><OverviewWidget variant={variant} testID="ov" tiles={[{ id: 'cs', title: 'Current and savings', value: '15,610.50', note: '3 accounts' }]} /></Section>

        {/* The five effect categories: one of each moving kind (under reduced motion they show their end state) */}
        <Section id="rolling-digits" title="Rolling digits"><RollingDigits value="12,400.00" /></Section>
        <Section id="slide-to-confirm" title="Slide to confirm"><SlideToConfirm label="Slide to pay 1,250.00" onConfirm={noop} /></Section>
        <Section id="success-check" title="Success check"><SuccessCheck label="Payment sent" /></Section>
      </main>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(<Gallery />);
