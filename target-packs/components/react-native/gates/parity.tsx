/*
 * Parity of the React Native pack with the Oracle JET elements its components replace: each of the 47 element
 * components in a <section data-component="id">, controlled by this screen's state and given the same data as the bx-
 * side of gates/jet-parity.html. window.parityState() reports what the screen sees, with the bx side's keys, so
 * specs/parity.spec.ts can compare it with what a JET screen's view model sees after the same action.
 */
import { ReactNode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Text } from 'react-native';

import {
  AccountNumber, AccountSelector, Accordion, ActionMenu, Alert, AmountInput, Autocomplete, BarChart, BeneficiarySelector, BottomSheet, Button, CheckboxGroup,
  CurrencySelector, DataTable, DatePicker, DateRangePicker, DestructiveButton, Dialog, Drawer, Dropdown, ErrorMessage, FileUpload, IconButton, KycSteps,
  MultiSelect, NumberInput, OtpInput, Pagination, PasswordField, PaymentSchedule, PaymentStatus, ProgressBar, RadioGroup, SearchField, SecondaryButton,
  SensitiveField, SessionExpiryWarning, Stepper, SuccessMessage, Tabs, TextArea, TextField, ThemeProvider, Toast, Toggle, ToggleGroup, Tooltip,
  TransactionHistory, type DateRange, type PickedFile,
} from '../src';

const accounts = [{ value: 'S', label: 'Savings •••• 4521' }, { value: 'C', label: 'Current •••• 0187' }];
const channels = [{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }];
const speeds = [{ value: 'N', label: 'NEFT' }, { value: 'I', label: 'IMPS' }];
const payees = [{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }, { value: 'P3', label: 'Asha Patel' }];
const tabs = [{ id: 'c', label: 'Current' }, { id: 's', label: 'Savings' }, { id: 'd', label: 'Deposits' }];
const messages = [{ id: '1', severity: 'error' as const, summary: 'Payment failed', detail: 'The account is blocked.', autoTimeout: 0 },
  { id: '2', severity: 'confirmation' as const, summary: 'Beneficiary added', autoTimeout: 0 }];
const rows = [{ id: 't1', date: '12 Nov', text: 'Electricity bill', amount: '-1,240.00' }, { id: 't2', date: '11 Nov', text: 'Salary', amount: '85,000.00' },
  { id: 't3', date: '09 Nov', text: 'Card payment', amount: '-3,499.00' }];
const columns = [{ headerText: 'Date', field: 'date' as const }, { headerText: 'Description', field: 'text' as const }, { headerText: 'Amount', field: 'amount' as const }];
const menuItems = [{ value: 'download', label: 'Download statement' }, { value: 'nickname', label: 'Set a nickname' }];
const faq = [{ id: 'a', title: 'How long does a transfer take?', body: 'Same day inside the bank; up to 2 working days to other banks.' }];
const fromAccounts = [{ id: 'S', name: 'Savings', number: '00004521' }, { id: 'C', name: 'Current', number: '00000187' }];
const payeeRows = [{ id: 'p1', name: 'A. Rao', bank: 'HSBC', number: '9268' }, { id: 'p2', name: 'J. Mehta', bank: 'Barclays', number: '1180' }];
const txns = [{ id: 't1', description: 'Coffee House', date: 'Today 08:14', amount: -4.5, currency: 'USD' }, { id: 't2', description: 'Salary', date: '31 Dec', amount: 3200, currency: 'USD' },
  { id: 't3', description: 'Electricity', date: '28 Dec', amount: -86.2, currency: 'USD' }];
const spend = [{ label: 'Aug', value: 1240 }, { label: 'Sep', value: 980 }, { label: 'Oct', value: 1410 }, { label: 'Nov', value: 1640 }, { label: 'Dec', value: 2120 }];

/** The app's document picker, as a browser gives it: a file input (Playwright answers its file chooser). */
const pick = () => new Promise<PickedFile[]>((resolve) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.onchange = () => resolve(Array.from(input.files ?? []).map((f) => ({ name: f.name, size: f.size, type: f.type })));
  input.click();
});

function Section({ id, children }: { id: string; children: ReactNode }) {
  return <section data-component={id} style={{ padding: 12, marginBottom: 12, border: '1px solid #ddd', borderRadius: 8 }}><h2 style={{ margin: '0 0 8px', fontSize: 14 }}>{id}</h2>{children}</section>;
}

// What the screen holds, with the bx side's keys and starting values
const START = {
  text: '', amount: null as number | null, account: '', alerts: [] as string[], speed: '', day: '', tab: 'c', presses: 0, iconPresses: 0, closes: 0,
  dialogOpen: false, remarks: '', secret: '', copies: null as number | null, currency: '', picked: [] as string[], paperless: false,
  period: { from: '', to: '' } as DateRange, query: '', payee: '', files: [] as PickedFile[], refusals: 0, secondaryPresses: 0, dangerPresses: 0, show: 'Day',
  menuPicked: null as string | null, faq: [] as string[], nav: 'Accounts', navOpen: false, sheetOpen: false, sheetCloses: 0, page: 1, fromAccount: '', iban: '',
  payeePicked: null as string | null, txPicked: null as string | null, repeat: 'Once', otp: '', timeoutOpen: false, timeoutActions: [] as string[],
};
type State = typeof START;
let latest: State = START;

declare global { interface Window { parityState: () => Record<string, unknown> } }
window.parityState = () => {
  const { files, alerts, picked, account, speed, day, currency, payee, fromAccount, ...rest } = latest;
  const orNull = (v: string) => v || null;
  return { ...rest, files: files.map((f) => f.name), alerts: [...alerts].sort(), picked: [...picked].sort(), account: orNull(account), speed: orNull(speed),
    day: orNull(day), currency: orNull(currency), payee: orNull(payee), fromAccount: orNull(fromAccount) };
};

function Parity() {
  const [s, setS] = useState<State>(START);
  latest = s;
  const set = <K extends keyof State>(k: K) => (v: State[K]) => setS((x) => ({ ...x, [k]: v }));
  const bump = (k: 'presses' | 'iconPresses' | 'secondaryPresses' | 'dangerPresses') => () => setS((x) => ({ ...x, [k]: x[k] + 1 }));
  return (
    <ThemeProvider style={{ mode: 'light' }}>
      <main data-parity-ready style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
        <Section id="text-field"><TextField testID="tf1" label="Beneficiary name" value={s.text} onChange={set('text')} required /></Section>
        <Section id="amount"><AmountInput testID="am1" label="Amount" value={s.amount} onChange={set('amount')} min={1} max={50000} /></Section>
        <Section id="select"><Dropdown testID="dd1" label="From account" placeholder="Choose" options={accounts} value={s.account} onChange={set('account')} /></Section>
        <Section id="checkbox-group"><CheckboxGroup testID="cg" label="Send alerts by" options={channels} value={s.alerts} onChange={set('alerts')} /></Section>
        <Section id="choice-group"><RadioGroup testID="rg" label="Transfer speed" options={speeds} value={s.speed} onChange={set('speed')} /></Section>
        <Section id="date"><DatePicker testID="dp" label="Pay on" value={s.day} onChange={set('day')} /></Section>
        <Section id="button"><Button testID="bt" label="Pay now" onAction={bump('presses')} /></Section>
        <Section id="icon-button"><IconButton testID="ib" label="More actions" onAction={bump('iconPresses')} /></Section>
        <Section id="dialog">
          <Button testID="dialog-open" label="Delete A. Sharma" chroming="outlined" onAction={() => set('dialogOpen')(true)} />
          <Dialog testID="dl" open={s.dialogOpen} title="Delete A. Sharma?" onOpenChange={(o) => setS((x) => ({ ...x, dialogOpen: o, closes: x.closes + (o ? 0 : 1) }))}>
            <Text>Payments will stop.</Text>
          </Dialog>
        </Section>
        <Section id="toast"><Toast testID="to" messages={messages} onClose={() => undefined} /></Section>
        <Section id="tabs"><Tabs testID="tb" label="Accounts" tabs={tabs} selection={s.tab} onSelectionChange={set('tab')} /></Section>
        <Section id="data-grid"><DataTable testID="dg" caption="Recent transactions" rows={rows} columns={columns} keyField="id" /></Section>
        <Section id="text-area"><TextArea testID="ta1" label="Remarks" value={s.remarks} onChange={set('remarks')} /></Section>
        <Section id="password"><PasswordField testID="pw1" label="Password" value={s.secret} onChange={set('secret')} required /></Section>
        <Section id="number-input"><NumberInput testID="ni1" label="Cheque leaves" value={s.copies} onChange={set('copies')} min={1} max={5} step={1} /></Section>
        <Section id="currency-picker"><CurrencySelector testID="cp1" label="Currency" value={s.currency} onChange={set('currency')} /></Section>
        <Section id="multi-select"><MultiSelect testID="ms1" label="Accounts" options={accounts} value={s.picked} onChange={set('picked')} /></Section>
        <Section id="switch"><Toggle testID="sw1" label="Paperless statements" value={s.paperless} onChange={set('paperless')} /></Section>
        <Section id="date-range"><DateRangePicker testID="dr1" label="Statement period" value={s.period} onChange={set('period')} /></Section>
        <Section id="search"><SearchField testID="se1" label="Search transactions" value={s.query} onChange={set('query')} /></Section>
        <Section id="autocomplete"><Autocomplete testID="ac1" label="Payee" options={payees} value={s.payee} onChange={set('payee')} /></Section>
        <Section id="document-upload">
          <FileUpload testID="du1" label="Proof of address" accept=".pdf" value={s.files} onChange={set('files')} pick={pick}
                      onRefuse={() => setS((x) => ({ ...x, refusals: x.refusals + 1 }))} />
        </Section>
        <Section id="secondary-button"><SecondaryButton testID="sb" label="Save for later" onAction={bump('secondaryPresses')} /></Section>
        <Section id="danger-button"><DestructiveButton testID="db" label="Cancel payment" onAction={bump('dangerPresses')} /></Section>
        <Section id="segmented"><ToggleGroup testID="sg" label="Show" options={['Day', 'Week', 'Month']} value={s.show} onChange={set('show')} /></Section>
        <Section id="action-menu"><ActionMenu testID="am" items={menuItems} onAction={set('menuPicked')} /></Section>
        <Section id="accordion"><Accordion testID="acc" items={faq} expanded={s.faq} onExpandedChange={set('faq')} /></Section>
        <Section id="stepper"><Stepper testID="st" label="Progress" steps={['Details', 'Review', 'Done']} selectedStep="Review" /></Section>
        <Section id="payment-status"><PaymentStatus testID="ps" value={2} /></Section>
        <Section id="kyc-steps"><KycSteps testID="ks" steps={['ID', 'Selfie', 'Address']} selectedStep="Selfie" /></Section>
        <Section id="side-nav">
          <Button testID="nav-open" label="Menu" chroming="outlined" onAction={() => set('navOpen')(true)} />
          <Drawer testID="sn" label="Main" items={['Accounts', 'Payments', 'Cards']} selection={s.nav} onSelectionChange={set('nav')} open={s.navOpen} onOpenChange={set('navOpen')} />
        </Section>
        <Section id="sheet">
          <Button testID="sheet-open" label="Filter" chroming="outlined" onAction={() => set('sheetOpen')(true)} />
          <BottomSheet testID="sh" heading="Filter transactions" open={s.sheetOpen}
                       onOpenChange={(o) => setS((x) => ({ ...x, sheetOpen: o, sheetCloses: x.sheetCloses + (o ? 0 : 1) }))}>
            <Text>Choose what to show.</Text>
          </BottomSheet>
        </Section>
        <Section id="pagination"><Pagination testID="pg" page={s.page} pageCount={4} onPageChange={set('page')} /></Section>
        <Section id="tooltip"><Tooltip testID="tt" label="Available balance" text="What you can spend now: the balance less holds and pending card payments." /></Section>
        <Section id="alert-banner"><Alert testID="ab" message="Transfers after 6 pm arrive the next working day." /></Section>
        <Section id="error-message"><ErrorMessage testID="em" message="The amount is more than your daily limit of 5,000.00." /></Section>
        <Section id="success-message"><SuccessMessage testID="sm" message="Payment sent. Reference FX-20391." /></Section>
        <Section id="account-picker"><AccountSelector testID="ap1" label="From account" accounts={fromAccounts} value={s.fromAccount} onChange={set('fromAccount')} /></Section>
        <Section id="iban"><AccountNumber testID="ib1" label="Account number (IBAN)" value={s.iban} onChange={set('iban')} /></Section>
        <Section id="payee-list"><BeneficiarySelector testID="pl" label="Payees" payees={payeeRows} value={s.payeePicked ?? ''} onChange={set('payeePicked')} /></Section>
        <Section id="transaction-list"><TransactionHistory testID="tl" transactions={txns} onSelect={(x) => set('txPicked')(x.id)} /></Section>
        <Section id="repeat"><PaymentSchedule testID="rp" label="Repeat" value={s.repeat} onChange={set('repeat')} /></Section>
        <Section id="otp"><OtpInput testID="ot1" label="Enter the code" value={s.otp} onChange={set('otp')} required /></Section>
        <Section id="session-timeout">
          <Button testID="timeout-open" label="Show the warning" chroming="outlined" onAction={() => set('timeoutOpen')(true)} />
          <SessionExpiryWarning testID="se" open={s.timeoutOpen} seconds={60}
                                onStay={() => setS((x) => ({ ...x, timeoutOpen: false, timeoutActions: [...x.timeoutActions, 'stay'] }))}
                                onSignOut={() => setS((x) => ({ ...x, timeoutOpen: false, timeoutActions: [...x.timeoutActions, 'signOut'] }))} />
        </Section>
        <Section id="sensitive"><SensitiveField testID="sf1" label="Card number" value="4111 1111 1111 4821" /></Section>
        <Section id="spending-chart"><BarChart testID="bc" label="Spending" currency="USD" bars={spend} /></Section>
        <Section id="budget-progress"><ProgressBar testID="bp" items={[{ label: 'Groceries', value: 320, max: 400 }]} /></Section>
      </main>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(<Parity />);
