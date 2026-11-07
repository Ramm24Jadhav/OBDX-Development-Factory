/*
 * The React Native pack's gallery for the browser gates: each component in its main state, one <section
 * data-component="id"> each (the catalogue ids), in the theme the URL asks for (?mode=light|dark). Fixed data so the
 * screenshots are stable; values are held in state so the controls work.
 */
import { ReactElement, ReactNode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Text } from 'react-native';

import { SAMPLES, Variant, variantsShown } from './samples';

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
        <Section id="button" title="Button"><Button label="Pay now" /><Button label="Paying" busy />{variantsShown ? <>
          <Variant id="material"><Button variant="material" label="Pay now" /></Variant>
          <Variant id="tonal"><Button variant="tonal" label="Pay now" /></Variant>
          <Variant id="outlined"><Button variant="outlined" label="Pay now" /></Variant>
          <Variant id="text"><Button variant="text" label="Pay now" /></Variant>
          <Variant id="elevated"><Button variant="elevated" label="Pay now" /></Variant>
          <Variant id="gradient"><Button variant="gradient" label="Pay now" /></Variant>
          <Variant id="glass"><Button variant="glass" label="Pay now" /></Variant>
          <Variant id="pill"><Button variant="pill" label="Pay now" /></Variant>
        </> : null}</Section>
        <Section id="icon-button" title="Icon button"><IconButton label="More actions" /><IconButton label="Close" icon="close" chroming="outlined" />{variantsShown ? <>
          <Variant id="material"><IconButton variant="material" label="More actions" /></Variant>
          <Variant id="filled"><IconButton variant="filled" label="More actions" /></Variant>
          <Variant id="tonal"><IconButton variant="tonal" label="More actions" /></Variant>
          <Variant id="outlined"><IconButton variant="outlined" label="More actions" /></Variant>
          <Variant id="circular"><IconButton variant="circular" label="More actions" /></Variant>
          <Variant id="square"><IconButton variant="square" label="More actions" /></Variant>
        </> : null}</Section>
        <Section id="text-field" title="Text field">
          <Held initial="A. Sharma">{(v, set) => <TextField testID="tf1" label="Beneficiary name" value={v} onChange={set} required maxLength={40} clearable />}</Held>
          <TextField testID="tf2" label="Reference" value="INV 2041" error="Use letters and numbers only." />
        {variantsShown ? <>
          <Variant id="material"><TextField variant="material" testID="tf1-material" label="Beneficiary name" value={v} onChange={set} required maxLength={40} clearable /></Variant>
          <Variant id="outlined"><TextField variant="outlined" testID="tf1-outlined" label="Beneficiary name" value={v} onChange={set} required maxLength={40} clearable /></Variant>
          <Variant id="underlined"><TextField variant="underlined" testID="tf1-underlined" label="Beneficiary name" value={v} onChange={set} required maxLength={40} clearable /></Variant>
          <Variant id="floating"><TextField variant="floating" testID="tf1-floating" label="Beneficiary name" value={v} onChange={set} required maxLength={40} clearable /></Variant>
          <Variant id="inline"><TextField variant="inline" testID="tf1-inline" label="Beneficiary name" value={v} onChange={set} required maxLength={40} clearable /></Variant>
          <Variant id="pill"><TextField variant="pill" testID="tf1-pill" label="Beneficiary name" value={v} onChange={set} required maxLength={40} clearable /></Variant>
        </> : null}</Section>
        <Section id="amount" title="Amount input">
          <Held<number | null> initial={1250}>{(v, set) => <AmountInput testID="am1" label="Amount" currency="INR" value={v} onChange={set} required />}</Held>
        {variantsShown ? <>
          <Variant id="material"><AmountInput variant="material" testID="am1-material" label="Amount" currency="INR" value={v} onChange={set} required /></Variant>
          <Variant id="outlined"><AmountInput variant="outlined" testID="am1-outlined" label="Amount" currency="INR" value={v} onChange={set} required /></Variant>
          <Variant id="underlined"><AmountInput variant="underlined" testID="am1-underlined" label="Amount" currency="INR" value={v} onChange={set} required /></Variant>
          <Variant id="floating"><AmountInput variant="floating" testID="am1-floating" label="Amount" currency="INR" value={v} onChange={set} required /></Variant>
          <Variant id="inline"><AmountInput variant="inline" testID="am1-inline" label="Amount" currency="INR" value={v} onChange={set} required /></Variant>
          <Variant id="pill"><AmountInput variant="pill" testID="am1-pill" label="Amount" currency="INR" value={v} onChange={set} required /></Variant>
        </> : null}</Section>
        <Section id="select" title="Dropdown">
          <Held initial="S">{(v, set) => <Dropdown testID="dd1" label="From account" options={accounts} value={v} onChange={set} required />}</Held>
        {variantsShown ? <>
          <Variant id="material"><Dropdown variant="material" testID="dd1-material" label="From account" options={accounts} value={v} onChange={set} required /></Variant>
          <Variant id="outlined"><Dropdown variant="outlined" testID="dd1-outlined" label="From account" options={accounts} value={v} onChange={set} required /></Variant>
          <Variant id="underlined"><Dropdown variant="underlined" testID="dd1-underlined" label="From account" options={accounts} value={v} onChange={set} required /></Variant>
          <Variant id="inline"><Dropdown variant="inline" testID="dd1-inline" label="From account" options={accounts} value={v} onChange={set} required /></Variant>
          <Variant id="pill"><Dropdown variant="pill" testID="dd1-pill" label="From account" options={accounts} value={v} onChange={set} required /></Variant>
        </> : null}</Section>
        <Section id="checkbox-group" title="Checkbox group">
          <Held initial={['E']}>{(v, set) => <CheckboxGroup testID="cg" label="Send alerts by" options={[{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }]}
                                                            value={v} onChange={set} />}</Held>
        {variantsShown ? <>
          <Variant id="material"><CheckboxGroup variant="material" testID="cg-material" label="Send alerts by" options={[{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }]}
                                                            value={v} onChange={set} /></Variant>
          <Variant id="cards"><CheckboxGroup variant="cards" testID="cg-cards" label="Send alerts by" options={[{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }]}
                                                            value={v} onChange={set} /></Variant>
          <Variant id="chips"><CheckboxGroup variant="chips" testID="cg-chips" label="Send alerts by" options={[{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }]}
                                                            value={v} onChange={set} /></Variant>
          <Variant id="rows"><CheckboxGroup variant="rows" testID="cg-rows" label="Send alerts by" options={[{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }]}
                                                            value={v} onChange={set} /></Variant>
          <Variant id="round"><CheckboxGroup variant="round" testID="cg-round" label="Send alerts by" options={[{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }]}
                                                            value={v} onChange={set} /></Variant>
        </> : null}</Section>
        <Section id="choice-group" title="Radio group">
          <Held initial="N">{(v, set) => <RadioGroup testID="rg" label="Transfer speed" horizontal value={v} onChange={set}
                                                     options={[{ value: 'N', label: 'NEFT' }, { value: 'I', label: 'IMPS' }]} />}</Held>
        {variantsShown ? <>
          <Variant id="material"><RadioGroup variant="material" testID="rg-material" label="Transfer speed" horizontal value={v} onChange={set}
                                                     options={[{ value: 'N', label: 'NEFT' }, { value: 'I', label: 'IMPS' }]} /></Variant>
          <Variant id="cards"><RadioGroup variant="cards" testID="rg-cards" label="Transfer speed" horizontal value={v} onChange={set}
                                                     options={[{ value: 'N', label: 'NEFT' }, { value: 'I', label: 'IMPS' }]} /></Variant>
          <Variant id="chips"><RadioGroup variant="chips" testID="rg-chips" label="Transfer speed" horizontal value={v} onChange={set}
                                                     options={[{ value: 'N', label: 'NEFT' }, { value: 'I', label: 'IMPS' }]} /></Variant>
          <Variant id="rows"><RadioGroup variant="rows" testID="rg-rows" label="Transfer speed" horizontal value={v} onChange={set}
                                                     options={[{ value: 'N', label: 'NEFT' }, { value: 'I', label: 'IMPS' }]} /></Variant>
        </> : null}</Section>
        <Section id="date" title="Date"><Held initial="2026-11-12">{(v, set) => <DatePicker testID="dp" label="Pay on" value={v} onChange={set} />}</Held>{variantsShown ? <>
          <Variant id="material"><DatePicker variant="material" testID="dp-material" label="Pay on" value={v} onChange={set} /></Variant>
          <Variant id="outlined"><DatePicker variant="outlined" testID="dp-outlined" label="Pay on" value={v} onChange={set} /></Variant>
          <Variant id="underlined"><DatePicker variant="underlined" testID="dp-underlined" label="Pay on" value={v} onChange={set} /></Variant>
          <Variant id="inline"><DatePicker variant="inline" testID="dp-inline" label="Pay on" value={v} onChange={set} /></Variant>
        </> : null}</Section>
        <Section id="dialog" title="Dialog">
          <Dialog open={false} onOpenChange={noop} title="Delete A. Sharma?" description="You can add them again later." />
          <Line>The dialog opens over the screen (a modal); its look is checked in its open state on devices.</Line>
        </Section>
        <Section id="toast" title="Toast">
          <Toast onClose={noop} messages={[{ id: '1', severity: 'error', summary: 'Payment failed', detail: 'The account is blocked. Call the bank.', autoTimeout: 0 },
            { id: '2', severity: 'confirmation', summary: 'Beneficiary added', autoTimeout: 0 }]} />
        </Section>
        <Section id="card" title="Card"><Card heading="Savings •••• 4521" subheading="Available balance"><Line>₹85,000.00</Line></Card></Section>
        <Section id="tabs" title="Tabs">
          <Held initial="c">{(v, set) => <Tabs label="Accounts" selection={v} onSelectionChange={set} tabs={[{ id: 'c', label: 'Current', content: <Line>2 current accounts</Line> },
            { id: 's', label: 'Savings', content: <Line>1 savings account</Line> }]} />}</Held>
        </Section>
        <Section id="data-grid" title="Data table">
          <DataTable caption="Recent transactions" rows={rows} keyField="id" columns={[{ field: 'date', headerText: 'Date' }, { field: 'text', headerText: 'Description' },
            { field: 'amount', headerText: 'Amount', align: 'end' }]} />
        </Section>
        <Section id="text-area" title="Text area"><Held initial="Rent for November">{(v, set) => <TextArea testID="ta1" label="Remarks" value={v} onChange={set} maxLength={140} />}</Held>{variantsShown ? <>
          <Variant id="material"><TextArea variant="material" testID="ta1-material" label="Remarks" value={v} onChange={set} maxLength={140} /></Variant>
          <Variant id="outlined"><TextArea variant="outlined" testID="ta1-outlined" label="Remarks" value={v} onChange={set} maxLength={140} /></Variant>
          <Variant id="underlined"><TextArea variant="underlined" testID="ta1-underlined" label="Remarks" value={v} onChange={set} maxLength={140} /></Variant>
          <Variant id="floating"><TextArea variant="floating" testID="ta1-floating" label="Remarks" value={v} onChange={set} maxLength={140} /></Variant>
          <Variant id="inline"><TextArea variant="inline" testID="ta1-inline" label="Remarks" value={v} onChange={set} maxLength={140} /></Variant>
        </> : null}</Section>
        <Section id="password" title="Password"><Held initial="s3cret-pass">{(v, set) => <PasswordField testID="pw1" label="Password" value={v} onChange={set} />}</Held>{variantsShown ? <>
          <Variant id="material"><PasswordField variant="material" testID="pw1-material" label="Password" value={v} onChange={set} /></Variant>
          <Variant id="outlined"><PasswordField variant="outlined" testID="pw1-outlined" label="Password" value={v} onChange={set} /></Variant>
          <Variant id="underlined"><PasswordField variant="underlined" testID="pw1-underlined" label="Password" value={v} onChange={set} /></Variant>
          <Variant id="floating"><PasswordField variant="floating" testID="pw1-floating" label="Password" value={v} onChange={set} /></Variant>
          <Variant id="inline"><PasswordField variant="inline" testID="pw1-inline" label="Password" value={v} onChange={set} /></Variant>
        </> : null}</Section>
        <Section id="number-input" title="Number">
          <Held<number | null> initial={2}>{(v, set) => <NumberInput testID="ni1" label="Cheque leaves" value={v} onChange={set} min={1} max={5} />}</Held>
        {variantsShown ? <>
          <Variant id="material"><NumberInput variant="material" testID="ni1-material" label="Cheque leaves" value={v} onChange={set} min={1} max={5} /></Variant>
          <Variant id="outlined"><NumberInput variant="outlined" testID="ni1-outlined" label="Cheque leaves" value={v} onChange={set} min={1} max={5} /></Variant>
          <Variant id="underlined"><NumberInput variant="underlined" testID="ni1-underlined" label="Cheque leaves" value={v} onChange={set} min={1} max={5} /></Variant>
          <Variant id="floating"><NumberInput variant="floating" testID="ni1-floating" label="Cheque leaves" value={v} onChange={set} min={1} max={5} /></Variant>
          <Variant id="inline"><NumberInput variant="inline" testID="ni1-inline" label="Cheque leaves" value={v} onChange={set} min={1} max={5} /></Variant>
          <Variant id="pill"><NumberInput variant="pill" testID="ni1-pill" label="Cheque leaves" value={v} onChange={set} min={1} max={5} /></Variant>
        </> : null}</Section>
        <Section id="currency-picker" title="Currency"><Held initial="INR">{(v, set) => <CurrencySelector testID="cp1" label="Currency" value={v} onChange={set} required />}</Held>{variantsShown ? <>
          <Variant id="material"><CurrencySelector variant="material" testID="cp1-material" label="Currency" value={v} onChange={set} required /></Variant>
          <Variant id="outlined"><CurrencySelector variant="outlined" testID="cp1-outlined" label="Currency" value={v} onChange={set} required /></Variant>
          <Variant id="underlined"><CurrencySelector variant="underlined" testID="cp1-underlined" label="Currency" value={v} onChange={set} required /></Variant>
          <Variant id="inline"><CurrencySelector variant="inline" testID="cp1-inline" label="Currency" value={v} onChange={set} required /></Variant>
          <Variant id="pill"><CurrencySelector variant="pill" testID="cp1-pill" label="Currency" value={v} onChange={set} required /></Variant>
        </> : null}</Section>
        <Section id="multi-select" title="Multi select">
          <Held initial={['S']}>{(v, set) => <MultiSelect testID="ms1" label="Accounts on the statement" options={accounts} value={v} onChange={set} />}</Held>
        {variantsShown ? <>
          <Variant id="material"><MultiSelect variant="material" testID="ms1-material" label="Accounts on the statement" options={accounts} value={v} onChange={set} /></Variant>
          <Variant id="outlined"><MultiSelect variant="outlined" testID="ms1-outlined" label="Accounts on the statement" options={accounts} value={v} onChange={set} /></Variant>
          <Variant id="tonal"><MultiSelect variant="tonal" testID="ms1-tonal" label="Accounts on the statement" options={accounts} value={v} onChange={set} /></Variant>
          <Variant id="square"><MultiSelect variant="square" testID="ms1-square" label="Accounts on the statement" options={accounts} value={v} onChange={set} /></Variant>
          <Variant id="glass"><MultiSelect variant="glass" testID="ms1-glass" label="Accounts on the statement" options={accounts} value={v} onChange={set} /></Variant>
        </> : null}</Section>
        <Section id="switch" title="Switch"><Held<boolean> initial={true}>{(v, set) => <Toggle testID="sw1" label="Paperless statements" value={v} onChange={set} />}</Held>{variantsShown ? <>
          <Variant id="material"><Toggle variant="material" testID="sw1-material" label="Paperless statements" value={v} onChange={set} /></Variant>
          <Variant id="ios"><Toggle variant="ios" testID="sw1-ios" label="Paperless statements" value={v} onChange={set} /></Variant>
          <Variant id="fluent"><Toggle variant="fluent" testID="sw1-fluent" label="Paperless statements" value={v} onChange={set} /></Variant>
          <Variant id="labelled"><Toggle variant="labelled" testID="sw1-labelled" label="Paperless statements" value={v} onChange={set} /></Variant>
          <Variant id="squish"><Toggle variant="squish" testID="sw1-squish" label="Paperless statements" value={v} onChange={set} /></Variant>
        </> : null}</Section>
        <Section id="date-range" title="Date range">
          <Held initial={{ from: '2026-10-01', to: '2026-10-31' }}>{(v, set) => <DateRangePicker testID="dr1" label="Statement period" value={v} onChange={set} maxDays={92} />}</Held>
        {variantsShown ? <>
          <Variant id="material"><DateRangePicker variant="material" testID="dr1-material" label="Statement period" value={v} onChange={set} maxDays={92} /></Variant>
          <Variant id="outlined"><DateRangePicker variant="outlined" testID="dr1-outlined" label="Statement period" value={v} onChange={set} maxDays={92} /></Variant>
          <Variant id="underlined"><DateRangePicker variant="underlined" testID="dr1-underlined" label="Statement period" value={v} onChange={set} maxDays={92} /></Variant>
          <Variant id="inline"><DateRangePicker variant="inline" testID="dr1-inline" label="Statement period" value={v} onChange={set} maxDays={92} /></Variant>
        </> : null}</Section>
        <Section id="search" title="Search"><Held initial="rent">{(v, set) => <SearchField testID="se1" label="Search transactions" value={v} onChange={set} />}</Held>{variantsShown ? <>
          <Variant id="material"><SearchField variant="material" testID="se1-material" label="Search transactions" value={v} onChange={set} /></Variant>
          <Variant id="outlined"><SearchField variant="outlined" testID="se1-outlined" label="Search transactions" value={v} onChange={set} /></Variant>
          <Variant id="underlined"><SearchField variant="underlined" testID="se1-underlined" label="Search transactions" value={v} onChange={set} /></Variant>
          <Variant id="floating"><SearchField variant="floating" testID="se1-floating" label="Search transactions" value={v} onChange={set} /></Variant>
          <Variant id="inline"><SearchField variant="inline" testID="se1-inline" label="Search transactions" value={v} onChange={set} /></Variant>
          <Variant id="pill"><SearchField variant="pill" testID="se1-pill" label="Search transactions" value={v} onChange={set} /></Variant>
        </> : null}</Section>
        <Section id="autocomplete" title="Autocomplete">
          <Held initial="P1">{(v, set) => <Autocomplete testID="ac1" label="Payee" value={v} onChange={set}
                                                       options={[{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }]} />}</Held>
        {variantsShown ? <>
          <Variant id="material"><Autocomplete variant="material" testID="ac1-material" label="Payee" value={v} onChange={set}
                                                       options={[{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }]} /></Variant>
          <Variant id="outlined"><Autocomplete variant="outlined" testID="ac1-outlined" label="Payee" value={v} onChange={set}
                                                       options={[{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }]} /></Variant>
          <Variant id="underlined"><Autocomplete variant="underlined" testID="ac1-underlined" label="Payee" value={v} onChange={set}
                                                       options={[{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }]} /></Variant>
          <Variant id="inline"><Autocomplete variant="inline" testID="ac1-inline" label="Payee" value={v} onChange={set}
                                                       options={[{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }]} /></Variant>
          <Variant id="pill"><Autocomplete variant="pill" testID="ac1-pill" label="Payee" value={v} onChange={set}
                                                       options={[{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }]} /></Variant>
        </> : null}</Section>
        <Section id="document-upload" title="Document upload">
          <FileUpload testID="du1" label="Proof of address" value={[{ name: 'statement-october.pdf', size: 248000, type: 'application/pdf' }]} pick={async () => []}
                      accept=".pdf" />
        {variantsShown ? <>
          <Variant id="material"><FileUpload variant="material" testID="du1-material" label="Proof of address" value={[{ name: 'statement-october.pdf', size: 248000, type: 'application/pdf' }]} pick={async () => []}
                      accept=".pdf" /></Variant>
          <Variant id="dropzone"><FileUpload variant="dropzone" testID="du1-dropzone" label="Proof of address" value={[{ name: 'statement-october.pdf', size: 248000, type: 'application/pdf' }]} pick={async () => []}
                      accept=".pdf" /></Variant>
          <Variant id="compact"><FileUpload variant="compact" testID="du1-compact" label="Proof of address" value={[{ name: 'statement-october.pdf', size: 248000, type: 'application/pdf' }]} pick={async () => []}
                      accept=".pdf" /></Variant>
          <Variant id="card"><FileUpload variant="card" testID="du1-card" label="Proof of address" value={[{ name: 'statement-october.pdf', size: 248000, type: 'application/pdf' }]} pick={async () => []}
                      accept=".pdf" /></Variant>
        </> : null}</Section>

        {/* One of each kind from the banking groups (the rest are built on the same parts) */}
        <Section id="secondary-button" title="Secondary button"><SecondaryButton label="Save for later" />{variantsShown ? <>
          <Variant id="material"><SecondaryButton variant="material" label="Save for later" /></Variant>
          <Variant id="tonal"><SecondaryButton variant="tonal" label="Save for later" /></Variant>
          <Variant id="outlined"><SecondaryButton variant="outlined" label="Save for later" /></Variant>
          <Variant id="text"><SecondaryButton variant="text" label="Save for later" /></Variant>
          <Variant id="elevated"><SecondaryButton variant="elevated" label="Save for later" /></Variant>
          <Variant id="gradient"><SecondaryButton variant="gradient" label="Save for later" /></Variant>
          <Variant id="glass"><SecondaryButton variant="glass" label="Save for later" /></Variant>
          <Variant id="pill"><SecondaryButton variant="pill" label="Save for later" /></Variant>
        </> : null}</Section>
        <Section id="danger-button" title="Destructive button"><DestructiveButton label="Cancel payment" />{variantsShown ? <>
          <Variant id="material"><DestructiveButton variant="material" label="Cancel payment" /></Variant>
          <Variant id="tonal"><DestructiveButton variant="tonal" label="Cancel payment" /></Variant>
          <Variant id="outlined"><DestructiveButton variant="outlined" label="Cancel payment" /></Variant>
          <Variant id="text"><DestructiveButton variant="text" label="Cancel payment" /></Variant>
          <Variant id="elevated"><DestructiveButton variant="elevated" label="Cancel payment" /></Variant>
          <Variant id="gradient"><DestructiveButton variant="gradient" label="Cancel payment" /></Variant>
          <Variant id="glass"><DestructiveButton variant="glass" label="Cancel payment" /></Variant>
          <Variant id="pill"><DestructiveButton variant="pill" label="Cancel payment" /></Variant>
        </> : null}</Section>
        <Section id="segmented" title="Toggle group"><Held initial="Day">{(v, set) => <ToggleGroup testID="tg" label="Show" value={v} onChange={set} options={['Day', 'Week', 'Month']} />}</Held>{variantsShown ? <>
          <Variant id="material"><ToggleGroup variant="material" testID="tg-material" label="Show" value={v} onChange={set} options={['Day', 'Week', 'Month']} /></Variant>
          <Variant id="ios"><ToggleGroup variant="ios" testID="tg-ios" label="Show" value={v} onChange={set} options={['Day', 'Week', 'Month']} /></Variant>
          <Variant id="underline"><ToggleGroup variant="underline" testID="tg-underline" label="Show" value={v} onChange={set} options={['Day', 'Week', 'Month']} /></Variant>
          <Variant id="enclosed"><ToggleGroup variant="enclosed" testID="tg-enclosed" label="Show" value={v} onChange={set} options={['Day', 'Week', 'Month']} /></Variant>
          <Variant id="pill"><ToggleGroup variant="pill" testID="tg-pill" label="Show" value={v} onChange={set} options={['Day', 'Week', 'Month']} /></Variant>
        </> : null}</Section>
        <Section id="filter-chips" title="Filter chips"><Held initial={['Card']}>{(v, set) => <FilterChips testID="fc" label="Filter" value={v} onChange={set} options={['Card', 'Transfer', 'Bills']} />}</Held>{variantsShown ? <>
          <Variant id="material"><FilterChips variant="material" testID="fc-material" label="Filter" value={v} onChange={set} options={['Card', 'Transfer', 'Bills']} /></Variant>
          <Variant id="outlined"><FilterChips variant="outlined" testID="fc-outlined" label="Filter" value={v} onChange={set} options={['Card', 'Transfer', 'Bills']} /></Variant>
          <Variant id="tonal"><FilterChips variant="tonal" testID="fc-tonal" label="Filter" value={v} onChange={set} options={['Card', 'Transfer', 'Bills']} /></Variant>
          <Variant id="square"><FilterChips variant="square" testID="fc-square" label="Filter" value={v} onChange={set} options={['Card', 'Transfer', 'Bills']} /></Variant>
          <Variant id="glass"><FilterChips variant="glass" testID="fc-glass" label="Filter" value={v} onChange={set} options={['Card', 'Transfer', 'Bills']} /></Variant>
        </> : null}</Section>
        <Section id="accordion" title="Accordion"><Accordion testID="acc" items={[{ id: 'a', title: 'How long does a transfer take?', body: 'Same day inside the bank.' }]} expanded={['a']} /></Section>
        <Section id="stepper" title="Stepper"><Stepper testID="st" steps={['Details', 'Review', 'Done']} selectedStep="Review" /></Section>
        <Section id="status-badge" title="Status badge"><StatusBadge label="Completed" tone="success" /><StatusBadge label="Failed" tone="danger" /></Section>
        <Section id="timeline" title="Timeline"><Timeline testID="tl" items={[{ label: 'Initiated', meta: '09:12' }, { label: 'Completed', state: 'current' }]} /></Section>
        <Section id="error-message" title="Error message"><ErrorMessage testID="em" message="The amount is more than your daily limit of 5,000.00." actionLabel="Change the amount" /></Section>
        <Section id="balance-card" title="Account balance"><AccountBalance testID="ab" label="Savings ·· 4821" balance={12400} available={12150} currency="USD" /></Section>
        <Section id="transaction-list" title="Transaction history">
          <TransactionHistory testID="th" transactions={[{ id: '1', description: 'Coffee House', date: 'Today', amount: -4.5, currency: 'USD' },
            { id: '2', description: 'Salary', date: '1 Nov', amount: 4200, currency: 'USD' }]} />
        </Section>
        <Section id="otp" title="OTP input"><Held initial="12">{(v, set) => <OtpInput testID="otp" label="Enter the code" value={v} onChange={set} />}</Held>{variantsShown ? <>
          <Variant id="material"><OtpInput variant="material" testID="otp-material" label="Enter the code" value={v} onChange={set} /></Variant>
          <Variant id="underline"><OtpInput variant="underline" testID="otp-underline" label="Enter the code" value={v} onChange={set} /></Variant>
          <Variant id="rounded"><OtpInput variant="rounded" testID="otp-rounded" label="Enter the code" value={v} onChange={set} /></Variant>
          <Variant id="joined"><OtpInput variant="joined" testID="otp-joined" label="Enter the code" value={v} onChange={set} /></Variant>
        </> : null}</Section>
        <Section id="card-tile" title="Card tile"><Held initial={false}>{(v, set) => <CardTile testID="ct" card={{ id: 'c', name: 'Platinum', number: '4111111111114821', expiry: '08/29' }}
                                                                                       frozen={v} onFrozenChange={set} />}</Held></Section>
        <Section id="spending-chart" title="Chart"><BarChart testID="bc" label="Spending" currency="USD" bars={[{ label: 'Sep', value: 980 }, { label: 'Oct', value: 1240 }]} /></Section>
        <Section id="budget-progress" title="Progress bar"><ProgressBar testID="pb" currency="USD" items={[{ label: 'Groceries', value: 320, max: 400 }, { label: 'Eating out', value: 210, max: 200 }]} /></Section>
        <Section id="approval-queue" title="Pending for approval"><ApprovalQueue testID="aq" items={[{ id: 'p', title: 'Payroll Feb', meta: '182,400.00', priority: true }]} onApprove={noop} onReject={noop} /></Section>
        <Section id="alerts-subscription" title="Alerts"><Held initial={['Low balance']}>{(v, set) => <AlertSubscriptions testID="as" label="Tell me about" value={v} onChange={set}
                                                                                                                     options={['Low balance', 'Payments over 500.00']} />}</Held>{variantsShown ? <>
          <Variant id="material"><AlertSubscriptions variant="material" testID="as-material" label="Tell me about" value={v} onChange={set}
                                                                                                                     options={['Low balance', 'Payments over 500.00']} /></Variant>
          <Variant id="cards"><AlertSubscriptions variant="cards" testID="as-cards" label="Tell me about" value={v} onChange={set}
                                                                                                                     options={['Low balance', 'Payments over 500.00']} /></Variant>
          <Variant id="chips"><AlertSubscriptions variant="chips" testID="as-chips" label="Tell me about" value={v} onChange={set}
                                                                                                                     options={['Low balance', 'Payments over 500.00']} /></Variant>
          <Variant id="rows"><AlertSubscriptions variant="rows" testID="as-rows" label="Tell me about" value={v} onChange={set}
                                                                                                                     options={['Low balance', 'Payments over 500.00']} /></Variant>
          <Variant id="round"><AlertSubscriptions variant="round" testID="as-round" label="Tell me about" value={v} onChange={set}
                                                                                                                     options={['Low balance', 'Payments over 500.00']} /></Variant>
        </> : null}</Section>
        <Section id="loan-calculator" title="Loan calculator"><LoanCalculator testID="lc" value={{ amount: 100000, rate: 12, months: 12 }} currency="USD" /></Section>
        <Section id="faq" title="FAQ"><Faq testID="faq" items={[{ id: 'a', title: 'How do I block my card?', body: 'Settings › Cards › Block.' }]} /></Section>
        <Section id="overview" title="Overview widget"><OverviewWidget testID="ov" tiles={[{ id: 'cs', title: 'Current and savings', value: '15,610.50', note: '3 accounts' }]} /></Section>

        {/* The five effect categories: one of each moving kind (under reduced motion they show their end state) */}
        <Section id="rolling-digits" title="Rolling digits"><RollingDigits value="12,400.00" /></Section>
        <Section id="slide-to-confirm" title="Slide to confirm"><SlideToConfirm label="Slide to pay 1,250.00" onConfirm={noop} />{variantsShown ? <>
          <Variant id="material"><SlideToConfirm variant="material" label="Slide to pay 1,250.00" onConfirm={noop} /></Variant>
          <Variant id="tonal"><SlideToConfirm variant="tonal" label="Slide to pay 1,250.00" onConfirm={noop} /></Variant>
          <Variant id="outlined"><SlideToConfirm variant="outlined" label="Slide to pay 1,250.00" onConfirm={noop} /></Variant>
          <Variant id="text"><SlideToConfirm variant="text" label="Slide to pay 1,250.00" onConfirm={noop} /></Variant>
          <Variant id="elevated"><SlideToConfirm variant="elevated" label="Slide to pay 1,250.00" onConfirm={noop} /></Variant>
          <Variant id="gradient"><SlideToConfirm variant="gradient" label="Slide to pay 1,250.00" onConfirm={noop} /></Variant>
          <Variant id="glass"><SlideToConfirm variant="glass" label="Slide to pay 1,250.00" onConfirm={noop} /></Variant>
          <Variant id="pill"><SlideToConfirm variant="pill" label="Slide to pay 1,250.00" onConfirm={noop} /></Variant>
        </> : null}</Section>
        <Section id="success-check" title="Success check"><SuccessCheck label="Payment sent" /></Section>
      </main>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(<Gallery />);
